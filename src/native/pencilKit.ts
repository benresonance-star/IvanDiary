import { Capacitor, registerPlugin } from "@capacitor/core";

import type { PencilKitPlugin } from "./contracts";

const pencilKit = registerPlugin<PencilKitPlugin>("PencilKit");

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
}): Promise<{ saved: boolean }> {
  return pencilKit.open(options);
}
