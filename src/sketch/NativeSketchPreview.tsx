import { useEffect, useRef, useState, type CSSProperties } from "react";

import {
  getNativeDrawingPreview,
  hasNativePencilKit,
  NATIVE_DRAWING_UPDATED_EVENT,
} from "../native/pencilKit";

export function NativeSketchPreview({
  className = "",
  contentInsetTop = 0,
  documentId,
  renderSize,
}: {
  className?: string;
  /** Keep preview aspect matching the inset PencilKit overlay used while drawing. */
  contentInsetTop?: number;
  documentId: string;
  /** Source canvas coordinates to render; display dimensions must not be used for thumbnails. */
  renderSize?: { width: number; height: number };
}) {
  const [source, setSource] = useState<string>();
  const imageRef = useRef<HTMLImageElement>(null);
  const renderWidth = renderSize?.width;
  const renderHeight = renderSize?.height;

  useEffect(() => {
    if (!hasNativePencilKit()) {
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const bounds = imageRef.current?.getBoundingClientRect();
        const size = renderWidth !== undefined && renderHeight !== undefined
          ? { width: renderWidth, height: renderHeight }
          :
          (bounds && bounds.width >= 8 && bounds.height >= 8
            ? { width: bounds.width, height: bounds.height }
            : undefined);
        const preview = await getNativeDrawingPreview(documentId, size);
        if (!cancelled) {
          setSource(preview.previewSrc);
        }
      } catch {
        if (!cancelled) {
          setSource(undefined);
        }
      }
    };
    const frame = globalThis.requestAnimationFrame(() => void load());
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

    return () => {
      cancelled = true;
      globalThis.cancelAnimationFrame(frame);
      globalThis.removeEventListener(
        NATIVE_DRAWING_UPDATED_EVENT,
        handleUpdate,
      );
    };
  }, [documentId, renderHeight, renderWidth]);

  if (!hasNativePencilKit()) {
    return null;
  }

  const inset = Math.max(0, contentInsetTop);
  const style: CSSProperties =
    inset > 0
      ? {
          top: inset,
          bottom: "auto",
          height: `calc(100% - ${inset}px)`,
          visibility: source ? "visible" : "hidden",
        }
      : { visibility: source ? "visible" : "hidden" };

  return (
    <img
      alt=""
      aria-hidden="true"
      className={`native-sketch-preview ${className}`.trim()}
      src={source}
      ref={imageRef}
      style={style}
    />
  );
}
