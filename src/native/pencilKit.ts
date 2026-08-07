import { Capacitor, registerPlugin } from "@capacitor/core";

import type { PencilKitPlugin, PencilKitPreview } from "./contracts";

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
  if (result.saved) {
    globalThis.dispatchEvent(
      new CustomEvent(NATIVE_DRAWING_UPDATED_EVENT, {
        detail: { documentId: options.documentId },
      }),
    );
  }
  return result;
}

export async function getNativeDrawingPreview(
  documentId: string,
): Promise<NativeDrawingPreview> {
  return withWebPreview(await pencilKit.getPreview({ documentId }));
}

function withWebPreview(
  preview: PencilKitPreview,
): NativeDrawingPreview {
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
