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

function rectsEqual(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    Math.abs(left.x - right.x) < 0.5 &&
    Math.abs(left.y - right.y) < 0.5 &&
    Math.abs(left.width - right.width) < 0.5 &&
    Math.abs(left.height - right.height) < 0.5
  );
}

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
  const onErrorRef = useRef(onError);
  const presentedRef = useRef(false);
  const lastRectRef = useRef<
    | {
        x: number;
        y: number;
        width: number;
        height: number;
      }
    | undefined
  >(undefined);
  const nativeAvailable = hasNativePencilKit();
  const drawing =
    nativeAvailable && enabled && (tool === "pen" || tool === "eraser");

  useEffect(() => {
    documentIdRef.current = documentId;
  }, [documentId]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!nativeAvailable) {
      return;
    }

    const paper = paperRef.current;
    if (!paper) {
      return;
    }

    let cancelled = false;
    let frameTimer: ReturnType<typeof setTimeout> | undefined;

    const hideIfPresented = async () => {
      if (!presentedRef.current) {
        return;
      }
      presentedRef.current = false;
      lastRectRef.current = undefined;
      try {
        await hideNativeDrawingOverlay(documentIdRef.current, true);
      } catch (error) {
        onErrorRef.current?.(
          error instanceof Error
            ? error.message
            : "The drawing could not be saved.",
        );
      }
    };

    const sync = async () => {
      if (cancelled) {
        return;
      }
      if (!drawing) {
        await hideIfPresented();
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
          if (!cancelled) {
            presentedRef.current = true;
            lastRectRef.current = overlayRect;
          }
        } catch (error) {
          if (legacyInk) {
            await sketchRepository.save(sketch);
          }
          throw error;
        }
      } catch (error) {
        if (!cancelled) {
          presentedRef.current = false;
        }
        onErrorRef.current?.(
          error instanceof Error
            ? error.message
            : "The drawing overlay could not be opened.",
        );
      }
    };

    const updateFrame = () => {
      if (!drawing || cancelled || !presentedRef.current) {
        return;
      }
      const { overlayRect } = measureDrawingOverlayLayout(
        paper,
        toolPaletteRef.current,
      );
      if (overlayRect.width < 8 || overlayRect.height < 8) {
        return;
      }
      if (
        lastRectRef.current &&
        rectsEqual(lastRectRef.current, overlayRect)
      ) {
        return;
      }
      lastRectRef.current = overlayRect;
      if (frameTimer !== undefined) {
        clearTimeout(frameTimer);
      }
      frameTimer = setTimeout(() => {
        if (cancelled || !presentedRef.current) {
          return;
        }
        void updateNativeDrawingOverlay({ rect: overlayRect });
      }, 80);
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

    return () => {
      cancelled = true;
      if (frameTimer !== undefined) {
        clearTimeout(frameTimer);
      }
      observer.disconnect();
      globalThis.removeEventListener("resize", updateFrame);
      globalThis.visualViewport?.removeEventListener("resize", updateFrame);
      void hideIfPresented();
    };
  }, [
    color,
    documentId,
    drawing,
    nativeAvailable,
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
