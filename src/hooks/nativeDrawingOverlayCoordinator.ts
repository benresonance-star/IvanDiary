import type { DrawingGridSettings } from "../domain/models";
import {
  hideNativeDrawingOverlay,
  showNativeDrawingOverlay,
  updateNativeDrawingOverlay,
} from "../native/pencilKit";
import { toLegacyInkDocument } from "../sketch/legacyInk";
import type { SketchRepository } from "../sketch/types";
import type { PenNib } from "../sketch/types";
import type { OverlayRect } from "../sketch/drawingOverlayLayout";

export type NativeDrawingOverlayRequest = {
  owner: symbol;
  documentId: string;
  color: string;
  nib?: PenNib;
  width: number;
  opacity: number;
  fingerDrawing?: boolean;
  tool: "pen" | "eraser";
  rect: OverlayRect;
  clipShape?: "circle";
  grid?: DrawingGridSettings;
  gridOriginX?: number;
  gridOriginY?: number;
  gridPageWidth?: number;
  gridPageHeight?: number;
  gridDocumentWidth?: number;
  gridDocumentHeight?: number;
  sketchRepository: SketchRepository;
  onError?: (message: string) => void;
};

export type NativeDrawingOverlayState = {
  active: boolean;
  documentId?: string;
  failed?: boolean;
  owner?: symbol;
};

export type NativeDrawingOverlayOperations = {
  hide(documentId: string): Promise<unknown>;
  show(
    request: NativeDrawingOverlayRequest,
    legacyInk: ReturnType<typeof toLegacyInkDocument>,
  ): Promise<{ importedLegacyStrokes: boolean }>;
  update(request: NativeDrawingOverlayRequest): Promise<void>;
};

const defaultOperations: NativeDrawingOverlayOperations = {
  hide: (documentId) => hideNativeDrawingOverlay(documentId, true),
  show: (request, legacyInk) =>
    showNativeDrawingOverlay({
      documentId: request.documentId,
      color: request.color,
      nib: request.nib ?? "pen",
      width: request.width,
      opacity: request.opacity,
      fingerDrawing: request.fingerDrawing ?? true,
      tool: request.tool,
      rect: request.rect,
      clipShape: request.clipShape,
      legacyInk,
      grid: request.grid,
      gridOriginX: request.gridOriginX,
      gridOriginY: request.gridOriginY,
      gridPageWidth: request.gridPageWidth,
      gridPageHeight: request.gridPageHeight,
      gridDocumentWidth: request.gridDocumentWidth,
      gridDocumentHeight: request.gridDocumentHeight,
    }),
  update: (request) =>
    updateNativeDrawingOverlay({
      color: request.color,
      nib: request.nib ?? "pen",
      width: request.width,
      opacity: request.opacity,
      fingerDrawing: request.fingerDrawing ?? true,
      tool: request.tool,
      rect: request.rect,
      clipShape: request.clipShape,
      grid: request.grid,
      gridOriginX: request.gridOriginX,
      gridOriginY: request.gridOriginY,
      gridPageWidth: request.gridPageWidth,
      gridPageHeight: request.gridPageHeight,
      gridDocumentWidth: request.gridDocumentWidth,
      gridDocumentHeight: request.gridDocumentHeight,
    }),
};

/**
 * Owns the single native PencilKit overlay across React page unmounts.
 * Requests may change while a bridge call is pending; reconciliation always
 * continues from the latest request before publishing an active overlay.
 */
export class NativeDrawingOverlayCoordinator {
  readonly #listeners = new Set<(state: NativeDrawingOverlayState) => void>();
  readonly #operations: NativeDrawingOverlayOperations;
  #desired?: NativeDrawingOverlayRequest;
  #lastErrorHandler?: (message: string) => void;
  #presentedDocumentId?: string;
  #presentedOwner?: symbol;
  #reconciliation?: Promise<void>;
  #state: NativeDrawingOverlayState = { active: false };
  #version = 0;

  constructor(operations: NativeDrawingOverlayOperations = defaultOperations) {
    this.#operations = operations;
  }

  get state(): NativeDrawingOverlayState {
    return this.#state;
  }

  request(request: NativeDrawingOverlayRequest): void {
    this.#desired = request;
    this.#lastErrorHandler = request.onError;
    if (this.#state.failed && this.#state.owner === request.owner) {
      this.#publish({ active: false, owner: request.owner });
    }
    this.#version += 1;
    this.#startReconciliation();
  }

  release(owner: symbol): void {
    if (this.#desired?.owner !== owner) {
      return;
    }
    this.#desired = undefined;
    this.#version += 1;
    this.#startReconciliation();
  }

  async releaseAndWait(owner: symbol): Promise<boolean> {
    this.release(owner);
    while (this.#reconciliation) {
      await this.#reconciliation;
    }
    return !this.#state.active && this.#presentedDocumentId === undefined;
  }

  async suspendAndWait(): Promise<boolean> {
    this.#desired = undefined;
    this.#version += 1;
    this.#startReconciliation();
    while (this.#reconciliation) {
      await this.#reconciliation;
    }
    return !this.#state.active && this.#presentedDocumentId === undefined;
  }

  subscribe(listener: (state: NativeDrawingOverlayState) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  #publish(state: NativeDrawingOverlayState): void {
    this.#state = state;
    this.#listeners.forEach((listener) => listener(state));
  }

  #report(error: unknown, fallback: string): void {
    this.#lastErrorHandler?.(error instanceof Error ? error.message : fallback);
  }

  #startReconciliation(): void {
    if (this.#reconciliation) {
      return;
    }

    let processedVersion = -1;
    const reconcile = async () => {
      try {
        while (processedVersion !== this.#version) {
          processedVersion = this.#version;
          const desired = this.#desired;

          if (!desired) {
            if (this.#presentedDocumentId) {
              const documentId = this.#presentedDocumentId;
              try {
                await this.#operations.hide(documentId);
                this.#presentedDocumentId = undefined;
                this.#presentedOwner = undefined;
                this.#publish({ active: false });
              } catch (error) {
                this.#publish({
                  active: true,
                  documentId,
                  owner: this.#presentedOwner,
                });
                this.#report(error, "The drawing could not be saved.");
                return;
              }
            } else {
              this.#publish({ active: false });
            }
            continue;
          }

          if (this.#presentedDocumentId === desired.documentId) {
            try {
              await this.#operations.update(desired);
              this.#presentedOwner = desired.owner;
              if (
                processedVersion === this.#version &&
                this.#desired?.owner === desired.owner
              ) {
                this.#publish({
                  active: true,
                  documentId: desired.documentId,
                  owner: desired.owner,
                });
              }
            } catch (error) {
              this.#report(error, "The drawing tool could not be changed.");
              return;
            }
            continue;
          }

          if (this.#presentedDocumentId) {
            const documentId = this.#presentedDocumentId;
            try {
              await this.#operations.hide(documentId);
              this.#presentedDocumentId = undefined;
              this.#presentedOwner = undefined;
              this.#publish({ active: false });
            } catch (error) {
              this.#report(error, "The drawing could not be saved.");
              return;
            }
            if (processedVersion !== this.#version) {
              continue;
            }
          }

          try {
            const sketch = await desired.sketchRepository.load(desired.documentId);
            const legacyInk = toLegacyInkDocument(sketch);
            const result = await this.#operations.show(desired, legacyInk);
            this.#presentedDocumentId = desired.documentId;
            this.#presentedOwner = desired.owner;

            if (legacyInk && result.importedLegacyStrokes) {
              const health = await desired.sketchRepository.save({
                ...sketch,
                strokes: [],
                revision: sketch.revision + 1,
              });
              if (health.localDurability === "error") {
                desired.onError?.(
                  health.message ??
                    "The previous drawing could not be marked as imported.",
                );
              }
            }

            if (
              processedVersion === this.#version &&
              this.#desired?.owner === desired.owner
            ) {
              this.#publish({
                active: true,
                documentId: desired.documentId,
                owner: desired.owner,
              });
            }
          } catch (error) {
            this.#presentedDocumentId = undefined;
            this.#presentedOwner = undefined;
            this.#publish({
              active: false,
              documentId: desired.documentId,
              failed: true,
              owner: desired.owner,
            });
            this.#report(error, "The drawing overlay could not be opened.");
            return;
          }
        }
      } finally {
        this.#reconciliation = undefined;
        if (processedVersion !== this.#version) {
          this.#startReconciliation();
        }
      }
    };

    this.#reconciliation = Promise.resolve().then(reconcile);
  }
}

export const nativeDrawingOverlayCoordinator =
  new NativeDrawingOverlayCoordinator();
