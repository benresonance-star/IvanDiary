import type { SaveHealth } from "../domain/models";
import { migrateSketchDocument } from "../sketch/migrations";
import {
  SKETCH_SCHEMA_VERSION,
  type SketchDocument,
  type SketchRepository,
} from "../sketch/types";
import { developmentDatabase } from "./developmentDatabase";

export class BrowserSketchRepository implements SketchRepository {
  private readonly listeners = new Map<string, Set<() => void>>();

  async load(documentId: string): Promise<SketchDocument> {
    const instance = await developmentDatabase();
    const stored = await instance.get("sketchDocuments", documentId);

    if (!stored) {
      return {
        schemaVersion: SKETCH_SCHEMA_VERSION,
        id: documentId,
        size: { width: 1200, height: 820 },
        strokes: [],
        revision: 0,
      };
    }

    const migrated = migrateSketchDocument(stored);
    if (migrated.changed) {
      await instance.put("sketchDocuments", migrated.document);
    }
    return migrated.document;
  }

  async save(document: SketchDocument): Promise<SaveHealth> {
    try {
      const instance = await developmentDatabase();
      await instance.put("sketchDocuments", document);
      this.listeners
        .get(document.id)
        ?.forEach((listener) => listener());
      return {
        localDurability: "saved",
        remoteSync: "offline",
        durableRevision: document.revision,
        pendingOperationCount: document.revision,
      };
    } catch (error) {
      return {
        localDurability: "error",
        remoteSync: "offline",
        durableRevision: Math.max(0, document.revision - 1),
        pendingOperationCount: document.revision,
        message:
          error instanceof Error
            ? error.message
            : "The drawing could not be saved on this device.",
      };
    }
  }

  subscribe(documentId: string, listener: () => void): () => void {
    const documentListeners =
      this.listeners.get(documentId) ?? new Set<() => void>();
    documentListeners.add(listener);
    this.listeners.set(documentId, documentListeners);
    return () => {
      documentListeners.delete(listener);
      if (documentListeners.size === 0) {
        this.listeners.delete(documentId);
      }
    };
  }
}
