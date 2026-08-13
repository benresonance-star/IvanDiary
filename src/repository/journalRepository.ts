import type {
  DocumentOperation,
  JournalSnapshot,
  SaveHealth,
} from "../domain/models";

export type JournalLoadResult = {
  snapshot: JournalSnapshot;
  recoveredFromOperationLog: boolean;
  message?: string;
};

export type JournalCommitResult = {
  snapshot: JournalSnapshot;
  health: SaveHealth;
};

export interface JournalRepository {
  load(): Promise<JournalLoadResult>;
  commit(operation: DocumentOperation): Promise<JournalCommitResult>;
  replace(snapshot: JournalSnapshot): Promise<JournalCommitResult>;
}
