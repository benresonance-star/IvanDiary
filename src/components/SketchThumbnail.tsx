import { useEffect, useRef } from "react";

import { renderDocument } from "../sketch/renderer";
import { NativeSketchPreview } from "../sketch/NativeSketchPreview";
import type { SketchRepository } from "../sketch/types";

const THUMBNAIL_WIDTH = 240;
const THUMBNAIL_HEIGHT = 180;

export function SketchThumbnail({
  documentId,
  repository,
}: {
  documentId: string;
  repository: SketchRepository;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const renderLatest = async () => {
      const document = await repository.load(documentId);
      const canvas = canvasRef.current;
      if (cancelled || !canvas) {
        return;
      }
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      canvas.width = THUMBNAIL_WIDTH;
      canvas.height = THUMBNAIL_HEIGHT;
      context.setTransform(
        THUMBNAIL_WIDTH / document.size.width,
        0,
        0,
        THUMBNAIL_HEIGHT / document.size.height,
        0,
        0,
      );
      renderDocument(context, document);
    };

    const unsubscribe = repository.subscribe?.(
      documentId,
      () => void renderLatest(),
    );
    void renderLatest();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [documentId, repository]);

  return (
    <>
      <canvas
        aria-hidden="true"
        className="sketch-thumbnail"
        ref={canvasRef}
      />
      <NativeSketchPreview
        className="native-sketch-thumbnail"
        documentId={documentId}
      />
    </>
  );
}
