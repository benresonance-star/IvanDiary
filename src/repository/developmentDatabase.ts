import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type {
  DocumentOperation,
  JournalSnapshot,
} from "../domain/models";
import type { SketchDocument } from "../sketch/types";

interface DevelopmentDatabase extends DBSchema {
  sketchDocuments: {
    key: string;
    value: SketchDocument;
  };
  journalSnapshots: {
    key: string;
    value: JournalSnapshot;
  };
  journalBaselines: {
    key: string;
    value: JournalSnapshot;
  };
  journalOperations: {
    key: string;
    value: DocumentOperation;
    indexes: {
      "by-journal": string;
      "by-journal-revision": [string, number];
    };
  };
}

const DATABASE_NAME = "ivans-diary-development";
const DATABASE_VERSION = 3;

let databasePromise: Promise<IDBPDatabase<DevelopmentDatabase>> | undefined;

export function developmentDatabase(): Promise<
  IDBPDatabase<DevelopmentDatabase>
> {
  databasePromise ??= openDB<DevelopmentDatabase>(
    DATABASE_NAME,
    DATABASE_VERSION,
    {
      upgrade(instance) {
        if (!instance.objectStoreNames.contains("sketchDocuments")) {
          instance.createObjectStore("sketchDocuments", { keyPath: "id" });
        }
        if (!instance.objectStoreNames.contains("journalSnapshots")) {
          instance.createObjectStore("journalSnapshots", { keyPath: "id" });
        }
        if (!instance.objectStoreNames.contains("journalBaselines")) {
          instance.createObjectStore("journalBaselines", { keyPath: "id" });
        }
        if (!instance.objectStoreNames.contains("journalOperations")) {
          const operationStore = instance.createObjectStore(
            "journalOperations",
            { keyPath: "id" },
          );
          operationStore.createIndex("by-journal", "journalId");
          operationStore.createIndex("by-journal-revision", [
            "journalId",
            "resultingRevision",
          ]);
        }
      },
      blocked() {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("journal-database-blocked"));
        }
      },
      blocking(currentVersion, blockedVersion, event) {
        void currentVersion;
        void blockedVersion;
        if (event.target instanceof IDBDatabase) {
          event.target.close();
        }
      },
    },
  );

  return databasePromise;
}
