import { createInitialJournalSnapshot } from "../domain/initialState";
import { migrateJournalSnapshot } from "../domain/migrations";
import { applyDocumentOperation } from "../domain/operations";
import type {
  DocumentOperation,
  JournalSnapshot,
} from "../domain/models";
import { developmentDatabase } from "./developmentDatabase";
import type {
  JournalCommitResult,
  JournalLoadResult,
  JournalRepository,
} from "./journalRepository";

export class JournalCommitError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "JournalCommitError";
  }
}

export class BrowserJournalRepository implements JournalRepository {
  readonly #journalId: string;
  readonly #seedFactory: () => JournalSnapshot;

  constructor(
    journalId = "ivan-journal",
    seedFactory = createInitialJournalSnapshot,
  ) {
    this.#journalId = journalId;
    this.#seedFactory = seedFactory;
  }

  async #createIfMissing(): Promise<JournalSnapshot> {
    const instance = await developmentDatabase();
    const existing = await instance.get("journalSnapshots", this.#journalId);
    if (existing) {
      return existing;
    }

    const seed = this.#seedFactory();
    const transaction = instance.transaction(
      ["journalSnapshots", "journalBaselines"],
      "readwrite",
    );
    await Promise.all([
      transaction.objectStore("journalSnapshots").put(seed),
      transaction.objectStore("journalBaselines").put(seed),
      transaction.done,
    ]);
    return seed;
  }

  async #recoverFromOperations(): Promise<JournalSnapshot> {
    const instance = await developmentDatabase();
    const storedBaseline = await instance.get(
      "journalBaselines",
      this.#journalId,
    );
    let recovered = storedBaseline
      ? migrateJournalSnapshot(storedBaseline)
      : this.#seedFactory();
    const operations = await instance.getAllFromIndex(
      "journalOperations",
      "by-journal",
      this.#journalId,
    );
    operations.sort(
      (first, second) => first.resultingRevision - second.resultingRevision,
    );

    for (const operation of operations) {
      recovered = applyDocumentOperation(recovered, operation);
    }
    await instance.put("journalSnapshots", recovered);
    return recovered;
  }

  async load(): Promise<JournalLoadResult> {
    const stored = await this.#createIfMissing();
    try {
      const snapshot = migrateJournalSnapshot(stored);
      if (snapshot !== stored) {
        const instance = await developmentDatabase();
        await instance.put("journalSnapshots", snapshot);
      }
      return { snapshot, recoveredFromOperationLog: false };
    } catch (migrationError) {
      try {
        const snapshot = await this.#recoverFromOperations();
        return {
          snapshot,
          recoveredFromOperationLog: true,
          message:
            "The latest complete journal state was rebuilt from its change history.",
        };
      } catch (recoveryError) {
        throw new JournalCommitError(
          "The journal could not be opened safely. Its stored data was left unchanged.",
          {
            cause:
              recoveryError instanceof Error ? recoveryError : migrationError,
          },
        );
      }
    }
  }

  async commit(operation: DocumentOperation): Promise<JournalCommitResult> {
    try {
      const instance = await developmentDatabase();
      const transaction = instance.transaction(
        ["journalSnapshots", "journalOperations"],
        "readwrite",
      );
      const snapshotStore = transaction.objectStore("journalSnapshots");
      const operationStore = transaction.objectStore("journalOperations");
      const stored = await snapshotStore.get(this.#journalId);
      const snapshot = stored
        ? migrateJournalSnapshot(stored)
        : this.#seedFactory();
      const next = applyDocumentOperation(snapshot, operation);

      await operationStore.put(operation);
      await snapshotStore.put(next);
      await transaction.done;

      return {
        snapshot: next,
        health: {
          localDurability: "saved",
          remoteSync: "offline",
          durableRevision: next.revision,
          pendingOperationCount: await instance.countFromIndex(
            "journalOperations",
            "by-journal",
            this.#journalId,
          ),
        },
      };
    } catch (error) {
      throw new JournalCommitError(
        "This change could not be saved on this device.",
        { cause: error },
      );
    }
  }

  async replace(snapshot: JournalSnapshot): Promise<JournalCommitResult> {
    const instance = await developmentDatabase();
    const restored = migrateJournalSnapshot(snapshot);
    const transaction = instance.transaction(
      ["journalSnapshots", "journalBaselines", "journalOperations"],
      "readwrite",
    );
    await transaction.objectStore("journalSnapshots").put(restored);
    await transaction.objectStore("journalBaselines").put(restored);
    const operations = await transaction.objectStore("journalOperations").index("by-journal").getAllKeys(restored.id);
    await Promise.all(operations.map((key) => transaction.objectStore("journalOperations").delete(key)));
    await transaction.done;
    return {
      snapshot: restored,
      health: { localDurability: "saved", remoteSync: "synced", durableRevision: restored.revision, pendingOperationCount: 0 },
    };
  }
}
