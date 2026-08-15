import { Capacitor, registerPlugin } from "@capacitor/core";

import type {
  LegacyInkDocument,
  PencilKitOverlayRect,
  PencilKitPlugin,
  PencilKitPreview,
} from "./contracts";
import type { DrawingGridSettings } from "../domain/models";

const pencilKit = registerPlugin<PencilKitPlugin>("PencilKit");
export const NATIVE_DRAWING_UPDATED_EVENT = "native-drawing-updated";

export type NativeDrawingPreview = PencilKitPreview & {
  previewSrc?: string;
  didHide?: boolean;
};

/** Prevent overlapping Capacitor bridge calls from locking the UI thread. */
let overlayQueue: Promise<unknown> = Promise.resolve();

function enqueueOverlayCall<T>(operation: () => Promise<T>): Promise<T> {
  const run = overlayQueue.then(operation, operation);
  overlayQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function rectKey(rect?: PencilKitOverlayRect): string {
  if (!rect) {
    return "";
  }
  return [
    Math.round(rect.x),
    Math.round(rect.y),
    Math.round(rect.width),
    Math.round(rect.height),
  ].join(":");
}

let lastUpdateKey = "";

export function hasNativePencilKit(): boolean {
  return (
    Capacitor.getPlatform() === "ios" &&
    Capacitor.isPluginAvailable("PencilKit")
  );
}

export async function openNativeDrawing(options: {
  documentId: string;
  color: string;
  width: number;
  opacity?: number;
  fingerDrawing?: boolean;
  initialTool: "pen" | "eraser";
  backgroundDataUrl?: string;
}): Promise<NativeDrawingPreview> {
  const result = withWebPreview(
    await enqueueOverlayCall(() => pencilKit.open(options)),
  );
  notifyDrawingUpdated(options.documentId, result.saved);
  return result;
}

export async function showNativeDrawingOverlay(options: {
  documentId: string;
  color: string;
  nib?: "pen" | "marker" | "pencil" | "brush";
  width: number;
  opacity?: number;
  fingerDrawing?: boolean;
  tool: "pen" | "eraser";
  rect: PencilKitOverlayRect;
  clipShape?: "circle";
  legacyInk?: LegacyInkDocument;
  grid?: DrawingGridSettings;
  gridOriginX?: number;
  gridOriginY?: number;
  gridPageWidth?: number;
  gridPageHeight?: number;
  gridDocumentWidth?: number;
  gridDocumentHeight?: number;
}): Promise<{ importedLegacyStrokes: boolean }> {
  lastUpdateKey = rectKey(options.rect);
  const result = await enqueueOverlayCall(() =>
    pencilKit.showOverlay(options),
  );
  return {
    importedLegacyStrokes: result.importedLegacyStrokes === true,
  };
}

export async function updateNativeDrawingOverlay(options: {
  color?: string;
  nib?: "pen" | "marker" | "pencil" | "brush";
  width?: number;
  opacity?: number;
  fingerDrawing?: boolean;
  tool?: "pen" | "eraser";
  rect?: PencilKitOverlayRect;
  clipShape?: "circle";
  grid?: DrawingGridSettings;
  gridOriginX?: number;
  gridOriginY?: number;
  gridPageWidth?: number;
  gridPageHeight?: number;
  gridDocumentWidth?: number;
  gridDocumentHeight?: number;
}): Promise<void> {
  const key = [
    options.color ?? "",
    options.nib ?? "",
    options.width ?? "",
    options.opacity ?? "",
    options.fingerDrawing ?? "",
    options.tool ?? "",
    options.clipShape ?? "",
    options.grid?.enabled ?? "",
    options.grid?.spacing ?? "",
    options.grid?.rotationDegrees ?? "",
    options.grid?.type ?? "",
    options.grid?.color ?? "",
    options.gridOriginX ?? "",
    options.gridOriginY ?? "",
    options.gridPageWidth ?? "",
    options.gridPageHeight ?? "",
    options.gridDocumentWidth ?? "",
    options.gridDocumentHeight ?? "",
    rectKey(options.rect),
  ].join("|");
  if (key === lastUpdateKey) {
    return;
  }
  lastUpdateKey = key;
  await enqueueOverlayCall(() => pencilKit.updateOverlay(options));
}

export async function hideNativeDrawingOverlay(
  documentId: string,
  save = true,
): Promise<NativeDrawingPreview> {
  const result = withWebPreview(
    await enqueueOverlayCall(() => pencilKit.hideOverlay({ save })),
  );
  // Avoid calendar/preview rescans when hide is a no-op (already dismissed).
  if (result.didHide) {
    notifyDrawingUpdated(documentId, save);
  }
  return result;
}

export async function flushNativeDrawingOverlay(): Promise<NativeDrawingPreview> {
  return withWebPreview(
    await enqueueOverlayCall(() => pencilKit.flushOverlay()),
  );
}

export async function clearNativeDrawingOverlay(
  documentId: string,
): Promise<NativeDrawingPreview> {
  const result = withWebPreview(
    await enqueueOverlayCall(() => pencilKit.clearOverlay()),
  );
  notifyDrawingUpdated(documentId, result.saved);
  return result;
}

export async function deleteNativeDrawing(documentId: string): Promise<void> {
  await enqueueOverlayCall(() => pencilKit.deleteDrawing({ documentId }));
  notifyDrawingUpdated(documentId, false);
}

export async function undoNativeDrawingOverlay(): Promise<void> {
  await enqueueOverlayCall(() => pencilKit.undoOverlay());
}

export async function redoNativeDrawingOverlay(): Promise<void> {
  await enqueueOverlayCall(() => pencilKit.redoOverlay());
}

export async function getNativeDrawingPreview(
  documentId: string,
): Promise<NativeDrawingPreview> {
  return withWebPreview(await pencilKit.getPreview({ documentId }));
}

export async function subscribeNativeDrawingChanges(): Promise<() => void> {
  const handle = await pencilKit.addListener("drawingChanged", ({ documentId }) => {
    globalThis.dispatchEvent(
      new CustomEvent(NATIVE_DRAWING_UPDATED_EVENT, { detail: { documentId } }),
    );
  });
  return () => void handle.remove();
}

function notifyDrawingUpdated(documentId: string, saved: boolean) {
  if (!saved) {
    return;
  }
  globalThis.dispatchEvent(
    new CustomEvent(NATIVE_DRAWING_UPDATED_EVENT, {
      detail: { documentId },
    }),
  );
}

function withWebPreview(preview: PencilKitPreview): NativeDrawingPreview {
  if (!preview.available || !preview.previewUri) {
    return preview;
  }
  const source = Capacitor.convertFileSrc(preview.previewUri);
  const versionedSource =
    preview.modifiedAt === undefined
      ? source
      : `${source}${source.includes("?") ? "&" : "?"}v=${preview.modifiedAt}`;
  return {
    ...preview,
    previewSrc: versionedSource,
  };
}
