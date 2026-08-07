import { Capacitor, registerPlugin } from "@capacitor/core";

import type {
  LegacyInkDocument,
  PencilKitOverlayRect,
  PencilKitPlugin,
  PencilKitPreview,
} from "./contracts";

const pencilKit = registerPlugin<PencilKitPlugin>("PencilKit");
export const NATIVE_DRAWING_UPDATED_EVENT = "native-drawing-updated";

export type NativeDrawingPreview = PencilKitPreview & {
  previewSrc?: string;
};

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
  initialTool: "pen" | "eraser";
  backgroundDataUrl?: string;
}): Promise<NativeDrawingPreview> {
  const result = withWebPreview(await pencilKit.open(options));
  notifyDrawingUpdated(options.documentId, result.saved);
  return result;
}

export async function showNativeDrawingOverlay(options: {
  documentId: string;
  color: string;
  width: number;
  tool: "pen" | "eraser";
  rect: PencilKitOverlayRect;
  legacyInk?: LegacyInkDocument;
}): Promise<{ importedLegacyStrokes: boolean }> {
  const result = await pencilKit.showOverlay(options);
  return {
    importedLegacyStrokes: result.importedLegacyStrokes === true,
  };
}

export async function updateNativeDrawingOverlay(options: {
  color?: string;
  width?: number;
  tool?: "pen" | "eraser";
  rect?: PencilKitOverlayRect;
}): Promise<void> {
  await pencilKit.updateOverlay(options);
}

export async function hideNativeDrawingOverlay(
  documentId: string,
  save = true,
): Promise<NativeDrawingPreview> {
  const result = withWebPreview(await pencilKit.hideOverlay({ save }));
  notifyDrawingUpdated(documentId, save);
  return result;
}

export async function undoNativeDrawingOverlay(): Promise<void> {
  await pencilKit.undoOverlay();
}

export async function getNativeDrawingPreview(
  documentId: string,
): Promise<NativeDrawingPreview> {
  return withWebPreview(await pencilKit.getPreview({ documentId }));
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
  return { ...preview, previewSrc: versionedSource };
}
