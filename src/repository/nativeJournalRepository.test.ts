import { describe, expect, it } from "vitest";

import { createInitialJournalSnapshot } from "../domain/initialState";
import { migrateJournalSnapshot } from "../domain/migrations";
import type { DocumentOperation, JournalSnapshot } from "../domain/models";
import type { JournalFilesPlugin, NativeJournalStorePlugin } from "../native/contracts";
import { NativeJournalRepository } from "./nativeJournalRepository";
import type { JournalRepository } from "./journalRepository";

class MemoryNativeStore implements NativeJournalStorePlugin {
  contents?: string;
  failWrites = false;

  async read() {
    return this.contents === undefined
      ? { available: false }
      : { available: true, contents: this.contents };
  }

  async write({ contents }: { contents: string }) {
    if (this.failWrites) throw new Error("disk full");
    this.contents = contents;
  }
}

function fallback(snapshot: JournalSnapshot, isNewJournal = true): JournalRepository {
  return {
    acknowledgeNewJournal() {},
    async load() {
      return { snapshot, isNewJournal, recoveredFromOperationLog: false };
    },
    async commit() { throw new Error("unexpected fallback commit"); },
    async replace() { throw new Error("unexpected fallback replace"); },
  };
}

function settingsOperation(snapshot: JournalSnapshot, id = "native-operation"): DocumentOperation {
  return {
    id,
    type: "settings-update",
    journalId: snapshot.id,
    baseRevision: snapshot.revision,
    resultingRevision: snapshot.revision + 1,
    createdAt: "2026-08-23T10:00:00.000Z",
    settings: { welcomeMessage: "Saved natively" },
  };
}

describe("NativeJournalRepository", () => {
  it("migrates the browser snapshot once and reopens it from native storage", async () => {
    const store = new MemoryNativeStore();
    const seed = createInitialJournalSnapshot(new Date("2026-08-23T09:00:00.000Z"), false);
    const repository = new NativeJournalRepository(store, fallback(seed));

    const migrated = await repository.load();
    expect(migrated.snapshot).toEqual(seed);
    expect(migrated.message).toMatch(/protected iPad storage/i);

    const reopened = new NativeJournalRepository(store, fallback({ ...seed, id: "wrong" }));
    expect((await reopened.load()).snapshot).toEqual(migrateJournalSnapshot(seed));
  });

  it("atomically persists operations and recovers a damaged latest snapshot", async () => {
    const store = new MemoryNativeStore();
    const seed = createInitialJournalSnapshot(new Date("2026-08-23T09:00:00.000Z"), false);
    const repository = new NativeJournalRepository(store, fallback(seed));
    await repository.load();
    await repository.commit(settingsOperation(seed));

    const envelope = JSON.parse(store.contents!) as { snapshot: JournalSnapshot };
    envelope.snapshot = { id: seed.id, schemaVersion: 99 } as unknown as JournalSnapshot;
    store.contents = JSON.stringify(envelope);

    const recovered = await new NativeJournalRepository(store, fallback(seed)).load();
    expect(recovered.recoveredFromOperationLog).toBe(true);
    expect(recovered.snapshot.settings.welcomeMessage).toBe("Saved natively");
  });

  it("does not advance in-memory state when the atomic write fails", async () => {
    const store = new MemoryNativeStore();
    const seed = createInitialJournalSnapshot(new Date("2026-08-23T09:00:00.000Z"), false);
    const repository = new NativeJournalRepository(store, fallback(seed));
    await repository.load();
    store.failWrites = true;
    await expect(repository.commit(settingsOperation(seed))).rejects.toThrow(/could not be saved/i);
    store.failWrites = false;
    const committed = await repository.commit(settingsOperation(seed, "retry-operation"));
    expect(committed.snapshot.revision).toBe(1);
  });

  it("repairs stale restored asset paths durably before exposing a reopened journal", async () => {
    const store = new MemoryNativeStore();
    const seed = createInitialJournalSnapshot(new Date("2026-08-23T09:00:00.000Z"));
    await new NativeJournalRepository(store, fallback(seed)).load();
    const envelope = JSON.parse(store.contents!) as {
      snapshot: JournalSnapshot;
      baseline: JournalSnapshot;
    };
    const voice = envelope.snapshot.pages[0]!.objects.find(
      (object) => object.type === "voice",
    )!;
    for (const storedSnapshot of [envelope.snapshot, envelope.baseline]) {
      storedSnapshot.pages[0]!.objects = storedSnapshot.pages[0]!.objects.map(
        (object) => object.id === voice.id
          ? {
              ...voice,
              asset: { ...voice.asset, localUri: "file:///old-container/voice.m4a" },
            }
          : object,
      );
    }
    store.contents = JSON.stringify(envelope);
    const resolvedUri = "file:///current-container/voice.m4a";
    const files: JournalFilesPlugin = {
      finaliseTemporaryAsset: async () => voice.asset,
      removeToTrash: async () => undefined,
      resolveStoredAssets: async ({ assets }) => ({
        resolvedAssetUris: Object.fromEntries(
          assets.map((asset) => [asset.id, resolvedUri]),
        ),
        unresolvedAssetIds: [],
      }),
      storageHealth: async () => ({ lowStorage: false }),
    };

    const reopened = await new NativeJournalRepository(
      store,
      fallback(seed),
      files,
    ).load();
    const repairedVoice = reopened.snapshot.pages[0]!.objects.find(
      (object) => object.type === "voice",
    )!;
    expect(repairedVoice.asset.localUri).toBe(resolvedUri);
    expect(store.contents).toContain(resolvedUri);
  });
});
