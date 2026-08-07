import { useEffect, useRef, type RefObject } from "react";

import {
  hasNativePencilKit,
  hideNativeDrawingOverlay,
  showNativeDrawingOverlay,
  updateNativeDrawingOverlay,
} from "../native/pencilKit";
import { measureDrawingOverlayLayout } from "../sketch/drawingOverlayLayout";
import { toLegacyInkDocument } from "../sketch/legacyInk";
import type { SketchRepository } from "../sketch/types";

export function useNativeDrawingOverlay({
  documentId,
  enabled,
  tool,
  color,
  width,
  opacity = 1,
  paperRef,
  toolPaletteRef,
  sketchRepository,
  onError,
}: {
  documentId: string;
  enabled: boolean;
  tool: "pen" | "eraser" | "view" | "arrange";
  color: string;
  width: number;
  opacity?: number;
  paperRef: RefObject<HTMLDivElement | null>;
  toolPaletteRef: RefObject<HTMLDivElement | null>;
  sketchRepository: SketchRepository;
  onError?: (message: string) => void;
}) {
  const documentIdRef = useRef(documentId);
  const nativeAvailable = hasNativePencilKit();
  const drawing =
    nativeAvailable && enabled && (tool === "pen" || tool === "eraser");

  useEffect(() => {
    documentIdRef.current = documentId;
  }, [documentId]);

  useEffect(() => {
    if (!nativeAvailable) {
      return;
    }

    const paper = paperRef.current;
    if (!paper) {
      return;
    }

    let cancelled = false;

    const sync = async () => {
      if (cancelled) {
        return;
      }
      if (!drawing) {
        try {
          await hideNativeDrawingOverlay(documentId, true);
        } catch (error) {
          onError?.(
            error instanceof Error
              ? error.message
              : "The drawing could not be saved.",
          );
        }
        return;
      }

      const { overlayRect } = measureDrawingOverlayLayout(
        paper,
        toolPaletteRef.current,
      );
      if (overlayRect.width < 8 || overlayRect.height < 8) {
        return;
      }

      try {
        const sketch = await sketchRepository.load(documentId);
        if (cancelled) {
          return;
        }
        const legacyInk = toLegacyInkDocument(sketch);
        if (legacyInk) {
          await sketchRepository.save({
            ...sketch,
            strokes: [],
            revision: sketch.revision + 1,
          });
        }
        try {
          await showNativeDrawingOverlay({
            documentId,
            color,
            width,
            opacity,
            tool: tool === "eraser" ? "eraser" : "pen",
            rect: overlayRect,
            legacyInk,
          });
        } catch (error) {
          if (legacyInk) {
            await sketchRepository.save(sketch);
          }
          throw error;
        }
      } catch (error) {
        onError?.(
          error instanceof Error
            ? error.message
            : "The drawing overlay could not be opened.",
        );
      }
    };

    const updateFrame = () => {
      if (!drawing || cancelled) {
        return;
      }
      const { overlayRect } = measureDrawingOverlayLayout(
        paper,
        toolPaletteRef.current,
      );
      if (overlayRect.width < 8 || overlayRect.height < 8) {
        return;
      }
      void updateNativeDrawingOverlay({ rect: overlayRect });
    };

    void sync();

    const observer = new ResizeObserver(updateFrame);
    observer.observe(paper);
    const tools = toolPaletteRef.current;
    if (tools) {
      observer.observe(tools);
    }
    globalThis.addEventListener("resize", updateFrame);
    globalThis.visualViewport?.addEventListener("resize", updateFrame);
    globalThis.visualViewport?.addEventListener("scroll", updateFrame);

    return () => {
      cancelled = true;
      observer.disconnect();
      globalThis.removeEventListener("resize", updateFrame);
      globalThis.visualViewport?.removeEventListener("resize", updateFrame);
      globalThis.visualViewport?.removeEventListener("scroll", updateFrame);
      void hideNativeDrawingOverlay(documentIdRef.current, true).catch(() => {
        // Best-effort save while leaving the page.
      });
    };
  }, [
    color,
    documentId,
    drawing,
    nativeAvailable,
    onError,
    opacity,
    paperRef,
    sketchRepository,
    tool,
    toolPaletteRef,
    width,
  ]);

  return {
    nativeAvailable,
    overlayActive: drawing,
  };
}
