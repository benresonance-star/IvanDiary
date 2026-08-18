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

const OPERATION_CHECKPOINT_INTERVAL = 100;
const NEW_JOURNAL_PENDING_KEY = "ivan-diary-new-journal-pending";

function pendingNewJournal(journalId: string): boolean {
  return globalThis.localStorage?.getItem(`${NEW_JOURNAL_PENDING_KEY}:${journalId}`) === "true";
}

function setPendingNewJournal(journalId: string, pending: boolean): void {
  const key = `${NEW_JOURNAL_PENDING_KEY}:${journalId}`;
  if (pending) globalThis.localStorage?.setItem(key, "true");
  else globalThis.localStorage?.removeItem(key);
}

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
    seedFactory = () => createInitialJournalSnapshot(new Date(), false),
  ) {
    this.#journalId = journalId;
    this.#seedFactory = seedFactory;
  }

  acknowledgeNewJournal(): void {
    setPendingNewJournal(this.#journalId, false);
  }

  async #createIfMissing(): Promise<{
    snapshot: JournalSnapshot;
    created: boolean;
  }> {
    const instance = await developmentDatabase();
    const existing = await instance.get("journalSnapshots", this.#journalId);
    if (existing) {
      return { snapshot: existing, created: pendingNewJournal(this.#journalId) };
    }

    const seed = this.#seedFactory();
    setPendingNewJournal(this.#journalId, true);
    const transaction = instance.transaction(
      ["journalSnapshots", "journalBaselines"],
      "readwrite",
    );
    await Promise.all([
      transaction.objectStore("journalSnapshots").put(seed),
      transaction.objectStore("journalBaselines").put(seed),
      transaction.done,
    ]);
    return { snapshot: seed, created: true };
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
    const { snapshot: stored, created } = await this.#createIfMissing();
    try {
      const snapshot = migrateJournalSnapshot(stored);
      if (snapshot !== stored) {
        const instance = await developmentDatabase();
        await instance.put("journalSnapshots", snapshot);
      }
      return {
        snapshot,
        recoveredFromOperationLog: false,
        isNewJournal: created,
      };
    } catch (migrationError) {
      try {
        const snapshot = await this.#recoverFromOperations();
        return {
          snapshot,
          isNewJournal: false,
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
        ["journalSnapshots", "journalBaselines", "journalOperations"],
        "readwrite",
      );
      const snapshotStore = transaction.objectStore("journalSnapshots");
      const baselineStore = transaction.objectStore("journalBaselines");
      const operationStore = transaction.objectStore("journalOperations");
      const stored = await snapshotStore.get(this.#journalId);
      const snapshot = stored
        ? migrateJournalSnapshot(stored)
        : this.#seedFactory();
      const next = applyDocumentOperation(snapshot, operation);

      await operationStore.put(operation);
      await snapshotStore.put(next);
      const operationIndex = operationStore.index("by-journal");
      const operationCount = await operationIndex.count(this.#journalId);
      if (operationCount >= OPERATION_CHECKPOINT_INTERVAL) {
        await baselineStore.put(next);
        const operationKeys = await operationIndex.getAllKeys(this.#journalId);
        await Promise.all(
          operationKeys.map((key) => operationStore.delete(key)),
        );
      }
      await transaction.done;
      setPendingNewJournal(this.#journalId, false);

      const pendingOperationCount =
        operationCount >= OPERATION_CHECKPOINT_INTERVAL ? 0 : operationCount;
      return {
        snapshot: next,
        health: {
          localDurability: "saved",
          remoteSync: "offline",
          durableRevision: next.revision,
          pendingOperationCount,
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
    setPendingNewJournal(this.#journalId, false);
    return {
      snapshot: restored,
      health: { localDurability: "saved", remoteSync: "synced", durableRevision: restored.revision, pendingOperationCount: 0 },
    };
  }
}
