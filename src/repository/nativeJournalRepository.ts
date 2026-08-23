import { Capacitor, registerPlugin } from "@capacitor/core";

import { migrateJournalSnapshot } from "../domain/migrations";
import { applyDocumentOperation } from "../domain/operations";
import type { DocumentOperation, JournalSnapshot } from "../domain/models";
import type { NativeJournalStorePlugin } from "../native/contracts";
import { BrowserJournalRepository, JournalCommitError } from "./browserJournalRepository";
import type { JournalCommitResult, JournalLoadResult, JournalRepository } from "./journalRepository";

const ENVELOPE_VERSION = 1 as const;
const CHECKPOINT_INTERVAL = 100;

type NativeJournalEnvelope = {
  version: typeof ENVELOPE_VERSION;
  snapshot: JournalSnapshot;
  baseline: JournalSnapshot;
  operations: DocumentOperation[];
  newJournalPending: boolean;
};

function serialize(envelope: NativeJournalEnvelope): string {
  return JSON.stringify(envelope);
}

function parse(contents: string): NativeJournalEnvelope {
  const candidate = JSON.parse(contents) as Partial<NativeJournalEnvelope>;
  if (
    candidate.version !== ENVELOPE_VERSION ||
    !candidate.snapshot ||
    !candidate.baseline ||
    !Array.isArray(candidate.operations)
  ) {
    throw new Error("The native journal store has an unsupported format.");
  }
  return {
    version: ENVELOPE_VERSION,
    snapshot: candidate.snapshot,
    baseline: candidate.baseline,
    operations: candidate.operations,
    newJournalPending: candidate.newJournalPending === true,
  };
}

function recover(envelope: NativeJournalEnvelope): JournalSnapshot {
  let snapshot = migrateJournalSnapshot(envelope.baseline);
  const operations = [...envelope.operations].sort(
    (first, second) => first.resultingRevision - second.resultingRevision,
  );
  for (const operation of operations) {
    snapshot = applyDocumentOperation(snapshot, operation);
  }
  return snapshot;
}

export class NativeJournalRepository implements JournalRepository {
  #envelope?: NativeJournalEnvelope;

  constructor(
    private readonly store: NativeJournalStorePlugin,
    private readonly browserFallback: JournalRepository = new BrowserJournalRepository(),
  ) {}

  acknowledgeNewJournal(): void {
    if (!this.#envelope?.newJournalPending) return;
    this.#envelope = { ...this.#envelope, newJournalPending: false };
    void this.store.write({ contents: serialize(this.#envelope) }).catch(() => {
      // A subsequent journal commit will persist the acknowledgement again.
    });
  }

  async load(): Promise<JournalLoadResult> {
    try {
      const stored = await this.store.read();
      if (!stored.available || !stored.contents) {
        const legacy = await this.browserFallback.load();
        this.#envelope = {
          version: ENVELOPE_VERSION,
          snapshot: legacy.snapshot,
          baseline: legacy.snapshot,
          operations: [],
          newJournalPending: legacy.isNewJournal,
        };
        await this.store.write({ contents: serialize(this.#envelope) });
        return {
          ...legacy,
          message: legacy.message ?? "Journal storage was moved into protected iPad storage.",
        };
      }

      const envelope = parse(stored.contents);
      try {
        const snapshot = migrateJournalSnapshot(envelope.snapshot);
        this.#envelope = { ...envelope, snapshot };
        if (snapshot !== envelope.snapshot) {
          await this.store.write({ contents: serialize(this.#envelope) });
        }
        return {
          snapshot,
          isNewJournal: envelope.newJournalPending,
          recoveredFromOperationLog: false,
        };
      } catch {
        const snapshot = recover(envelope);
        this.#envelope = { ...envelope, snapshot };
        await this.store.write({ contents: serialize(this.#envelope) });
        return {
          snapshot,
          isNewJournal: false,
          recoveredFromOperationLog: true,
          message: "The journal was rebuilt from its protected change history.",
        };
      }
    } catch (error) {
      throw new JournalCommitError(
        "The journal could not be opened from protected iPad storage.",
        { cause: error },
      );
    }
  }

  async commit(operation: DocumentOperation): Promise<JournalCommitResult> {
    const envelope = this.#envelope;
    if (!envelope) throw new JournalCommitError("The journal has not finished opening.");
    try {
      const snapshot = applyDocumentOperation(envelope.snapshot, operation);
      const operations = [...envelope.operations, operation];
      const nextEnvelope: NativeJournalEnvelope = operations.length >= CHECKPOINT_INTERVAL
        ? { version: ENVELOPE_VERSION, snapshot, baseline: snapshot, operations: [], newJournalPending: false }
        : { ...envelope, snapshot, operations, newJournalPending: false };
      await this.store.write({ contents: serialize(nextEnvelope) });
      this.#envelope = nextEnvelope;
      return {
        snapshot,
        health: {
          localDurability: "saved",
          remoteSync: "offline",
          durableRevision: snapshot.revision,
          pendingOperationCount: nextEnvelope.operations.length,
        },
      };
    } catch (error) {
      throw new JournalCommitError("This change could not be saved in protected iPad storage.", { cause: error });
    }
  }

  async replace(snapshot: JournalSnapshot): Promise<JournalCommitResult> {
    try {
      const restored = migrateJournalSnapshot(snapshot);
      const nextEnvelope: NativeJournalEnvelope = {
        version: ENVELOPE_VERSION,
        snapshot: restored,
        baseline: restored,
        operations: [],
        newJournalPending: false,
      };
      await this.store.write({ contents: serialize(nextEnvelope) });
      this.#envelope = nextEnvelope;
      return {
        snapshot: restored,
        health: { localDurability: "saved", remoteSync: "synced", durableRevision: restored.revision, pendingOperationCount: 0 },
      };
    } catch (error) {
      throw new JournalCommitError("The restored journal could not be saved in protected iPad storage.", { cause: error });
    }
  }
}

export function createJournalRepository(): JournalRepository {
  if (Capacitor.getPlatform() !== "ios") return new BrowserJournalRepository();
  return new NativeJournalRepository(registerPlugin<NativeJournalStorePlugin>("NativeJournalStore"));
}
