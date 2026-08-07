import { useEffect, useState } from "react";

import {
  getNativeDrawingPreview,
  hasNativePencilKit,
  NATIVE_DRAWING_UPDATED_EVENT,
} from "../native/pencilKit";

export function NativeSketchPreview({
  className = "",
  documentId,
}: {
  className?: string;
  documentId: string;
}) {
  const [source, setSource] = useState<string>();

  useEffect(() => {
    if (!hasNativePencilKit()) {
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const preview = await getNativeDrawingPreview(documentId);
        if (!cancelled) {
          setSource(preview.previewSrc);
        }
      } catch {
        if (!cancelled) {
          setSource(undefined);
        }
      }
    };
    const handleUpdate = (event: Event) => {
      const update = event as CustomEvent<{ documentId?: string }>;
      if (update.detail?.documentId === documentId) {
        void load();
      }
    };

    globalThis.addEventListener(
      NATIVE_DRAWING_UPDATED_EVENT,
      handleUpdate,
    );
    void load();

    return () => {
      cancelled = true;
      globalThis.removeEventListener(
        NATIVE_DRAWING_UPDATED_EVENT,
        handleUpdate,
      );
    };
  }, [documentId]);

  return source ? (
    <img
      alt=""
      aria-hidden="true"
      className={`native-sketch-preview ${className}`.trim()}
      src={source}
    />
  ) : null;
}
