import type {
  DocumentOperation,
  JournalSnapshot,
  SaveHealth,
} from "../domain/models";

export type JournalLoadResult = {
  snapshot: JournalSnapshot;
  isNewJournal: boolean;
  recoveredFromOperationLog: boolean;
  message?: string;
};

export type JournalCommitResult = {
  snapshot: JournalSnapshot;
  health: SaveHealth;
};

export interface JournalRepository {
  acknowledgeNewJournal(): void;
  load(): Promise<JournalLoadResult>;
  commit(operation: DocumentOperation): Promise<JournalCommitResult>;
  replace(snapshot: JournalSnapshot): Promise<JournalCommitResult>;
}
