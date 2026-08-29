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
  goldFinish = "raised",
  onVisibilityChange,
  paperAspectRatio,
  renderSize,
}: {
  className?: string;
  /** Keep preview aspect matching the inset PencilKit overlay used while drawing. */
  contentInsetTop?: number;
  documentId: string;
  goldFinish?: "smooth" | "raised" | "sparkle";
  onVisibilityChange?: (visible: boolean) => void;
  /** Full paper width divided by height, used to recover a saved overlay's inset. */
  paperAspectRatio?: number;
  /** Source canvas coordinates to render; display dimensions must not be used for thumbnails. */
  renderSize?: { width: number; height: number };
}) {
  const [source, setSource] = useState<string>();
  const [goldMaskSource, setGoldMaskSource] = useState<string>();
  const [sourceAspectRatio, setSourceAspectRatio] = useState<number>();
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
          setGoldMaskSource(preview.goldMaskSrc);
          onVisibilityChange?.(Boolean(preview.previewSrc));
        }
      } catch {
        if (!cancelled) {
          setSource(undefined);
          setGoldMaskSource(undefined);
          onVisibilityChange?.(false);
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
  }, [documentId, onVisibilityChange, renderHeight, renderWidth]);

  if (!hasNativePencilKit()) {
    return null;
  }

  const inset = Math.max(0, contentInsetTop);
  const drawableHeightPercent = paperAspectRatio && sourceAspectRatio
    ? Math.min(100, paperAspectRatio / sourceAspectRatio * 100)
    : undefined;
  const style: CSSProperties =
    inset > 0
      ? {
          top: inset,
          bottom: "auto",
          height: `calc(100% - ${inset}px)`,
          objectFit: "fill",
          visibility: source ? "visible" : "hidden",
        }
      : drawableHeightPercent !== undefined
        ? {
            top: `${100 - drawableHeightPercent}%`,
            bottom: "auto",
            height: `${drawableHeightPercent}%`,
            objectFit: "fill",
            visibility: source ? "visible" : "hidden",
          }
        : { objectFit: "fill", visibility: source ? "visible" : "hidden" };

  const goldStyle = goldMaskSource ? {
    ...style,
    WebkitMaskImage: `url("${goldMaskSource}")`,
    maskImage: `url("${goldMaskSource}")`,
  } as CSSProperties : undefined;

  return (
    <>
      <img
      alt=""
      aria-hidden="true"
      className={`native-sketch-preview ${className}`.trim()}
      onLoad={(event) => {
        const image = event.currentTarget;
        if (image.naturalWidth > 0 && image.naturalHeight > 0) {
          setSourceAspectRatio(image.naturalWidth / image.naturalHeight);
        }
      }}
      src={source}
      ref={imageRef}
      style={style}
      />
      {goldStyle ? <span aria-hidden="true" className={`native-sketch-preview native-sketch-gold-view native-sketch-gold-${goldFinish} ${className}`.trim()} style={goldStyle} /> : null}
    </>
  );
}
