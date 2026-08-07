import { useEffect, useState, type CSSProperties } from "react";

import {
  getNativeDrawingPreview,
  hasNativePencilKit,
  NATIVE_DRAWING_UPDATED_EVENT,
} from "../native/pencilKit";

export function NativeSketchPreview({
  className = "",
  contentInsetTop = 0,
  documentId,
}: {
  className?: string;
  /** Keep preview aspect matching the inset PencilKit overlay used while drawing. */
  contentInsetTop?: number;
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

  if (!source) {
    return null;
  }

  const inset = Math.max(0, contentInsetTop);
  const style: CSSProperties | undefined =
    inset > 0
      ? {
          top: inset,
          bottom: "auto",
          height: `calc(100% - ${inset}px)`,
        }
      : undefined;

  return (
    <img
      alt=""
      aria-hidden="true"
      className={`native-sketch-preview ${className}`.trim()}
      src={source}
      style={style}
    />
  );
}
