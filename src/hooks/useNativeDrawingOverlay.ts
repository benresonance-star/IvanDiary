import { useEffect, useRef, type RefObject } from "react";

import {
  hasNativePencilKit,
  hideNativeDrawingOverlay,
  showNativeDrawingOverlay,
  updateNativeDrawingOverlay,
} from "../native/pencilKit";

function measureDrawingOverlayRect(
  paper: HTMLElement,
  toolPalette?: HTMLElement | null,
) {
  const paperRect = paper.getBoundingClientRect();
  let top = paperRect.top;
  if (toolPalette) {
    const tools = toolPalette.getBoundingClientRect();
    if (tools.bottom > paperRect.top && tools.top < paperRect.bottom) {
      top = Math.max(top, tools.bottom + 8);
    }
  }
  return {
    x: paperRect.left,
    y: top,
    width: paperRect.width,
    height: Math.max(0, paperRect.bottom - top),
  };
}

export function useNativeDrawingOverlay({
  documentId,
  enabled,
  tool,
  color,
  width,
  paperRef,
  toolPaletteRef,
  onError,
}: {
  documentId: string;
  enabled: boolean;
  tool: "pen" | "eraser" | "view" | "arrange";
  color: string;
  width: number;
  paperRef: RefObject<HTMLDivElement | null>;
  toolPaletteRef: RefObject<HTMLDivElement | null>;
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

      const rect = measureDrawingOverlayRect(paper, toolPaletteRef.current);
      if (rect.width < 8 || rect.height < 8) {
        return;
      }

      try {
        await showNativeDrawingOverlay({
          documentId,
          color,
          width,
          tool: tool === "eraser" ? "eraser" : "pen",
          rect,
        });
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
      const rect = measureDrawingOverlayRect(paper, toolPaletteRef.current);
      if (rect.width < 8 || rect.height < 8) {
        return;
      }
      void updateNativeDrawingOverlay({ rect });
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
    paperRef,
    tool,
    toolPaletteRef,
    width,
  ]);

  return {
    nativeAvailable,
    overlayActive: drawing,
  };
}
