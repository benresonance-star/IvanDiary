import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  DocumentOperation,
  DocumentOperationInput,
  JournalSnapshot,
  SaveHealth,
} from "../domain/models";
import type { JournalRepository } from "../repository/journalRepository";
import { createId } from "../utils/id";

const INITIAL_HEALTH: SaveHealth = {
  localDurability: "saving",
  remoteSync: "offline",
  durableRevision: 0,
  pendingOperationCount: 0,
};

export function useJournal(repository: JournalRepository) {
  const snapshotRef = useRef<JournalSnapshot | undefined>(undefined);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const [snapshot, setSnapshot] = useState<JournalSnapshot>();
  const [health, setHealth] = useState<SaveHealth>(INITIAL_HEALTH);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void repository
      .load()
      .then((result) => {
        if (cancelled) {
          return;
        }
        snapshotRef.current = result.snapshot;
        setSnapshot(result.snapshot);
        setHealth({
          localDurability: "saved",
          remoteSync: "offline",
          durableRevision: result.snapshot.revision,
          pendingOperationCount: result.snapshot.appliedOperationIds.length,
        });
        setMessage(result.message);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setHealth({
          ...INITIAL_HEALTH,
          localDurability: "error",
          message:
            error instanceof Error
              ? error.message
              : "The journal could not be opened.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [repository]);

  const commit = useCallback(
    (input: DocumentOperationInput): Promise<boolean> => {
      let succeeded = false;
      const queued = queueRef.current.then(async () => {
        const current = snapshotRef.current;
        if (!current) {
          setMessage("Please wait for the journal to finish opening.");
          return;
        }

        const operation: DocumentOperation = {
          ...input,
          id: createId(),
          journalId: current.id,
          baseRevision: current.revision,
          resultingRevision: current.revision + 1,
          createdAt: new Date().toISOString(),
        } as DocumentOperation;

        setHealth((previous) => ({
          ...previous,
          localDurability: "saving",
        }));
        try {
          const result = await repository.commit(operation);
          snapshotRef.current = result.snapshot;
          setSnapshot(result.snapshot);
          setHealth(result.health);
          succeeded = true;
        } catch (error) {
          setHealth((previous) => ({
            ...previous,
            localDurability: "error",
            message:
              error instanceof Error
                ? error.message
                : "This change could not be saved.",
          }));
        }
      });
      queueRef.current = queued;
      return queued.then(() => succeeded);
    },
    [repository],
  );

  return {
    snapshot,
    health,
    message,
    clearMessage: () => setMessage(undefined),
    commit,
  };
}
