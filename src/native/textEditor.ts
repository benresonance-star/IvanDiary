import { Capacitor, registerPlugin } from "@capacitor/core";

import type {
  NativeTextEditorOptions,
  NativeTextEditorPlugin,
  NativeTextEditorResult,
} from "./contracts";

const nativeTextEditor =
  registerPlugin<NativeTextEditorPlugin>("NativeTextEditor");

let editorQueue: Promise<unknown> = Promise.resolve();

function enqueueEditorCall<T>(operation: () => Promise<T>): Promise<T> {
  const run = editorQueue.then(operation, operation);
  editorQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function hasNativeTextEditor(): boolean {
  return (
    Capacitor.getPlatform() === "ios" &&
    Capacitor.isPluginAvailable("NativeTextEditor")
  );
}

export async function openNativeTextEditor(
  options: NativeTextEditorOptions,
): Promise<NativeTextEditorResult> {
  const result = await enqueueEditorCall(() =>
    nativeTextEditor.open({
      ...options,
      initialText: options.initialText.slice(0, 20_000),
      contextualStrings: options.contextualStrings
        .map((word) => word.trim())
        .filter(Boolean)
        .slice(0, 100),
      ...(options.recordingLimitMilliseconds === undefined
        ? {}
        : {
            recordingLimitMilliseconds: Math.max(
              1_000,
              Math.round(options.recordingLimitMilliseconds),
            ),
          }),
    }),
  );
  if (
    typeof result?.cancelled !== "boolean" ||
    typeof result?.text !== "string"
  ) {
    throw new Error("The native text editor returned an invalid result.");
  }
  return result;
}
