import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import { hasNativePencilKit } from "../native/pencilKit";
import { measureDrawingOverlayLayout } from "../sketch/drawingOverlayLayout";
import type { SketchRepository } from "../sketch/types";
import {
  nativeDrawingOverlayCoordinator,
  type NativeDrawingOverlayState,
} from "./nativeDrawingOverlayCoordinator";

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
  const ownerRef = useRef(Symbol("native-drawing-overlay-owner"));
  const onErrorRef = useRef(onError);
  const [overlayActive, setOverlayActive] = useState(false);
  const [overlayRect, setOverlayRect] = useState<
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
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const owner = ownerRef.current;
    return nativeDrawingOverlayCoordinator.subscribe(
      (state: NativeDrawingOverlayState) => {
        setOverlayActive(state.active && state.owner === owner);
      },
    );
  }, []);

  useEffect(
    () => () => {
      nativeDrawingOverlayCoordinator.release(ownerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!nativeAvailable) {
      return;
    }

    const paper = paperRef.current;
    if (!paper) {
      return;
    }

    let frameTimer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      const { overlayRect } = measureDrawingOverlayLayout(
        paper,
        toolPaletteRef.current,
      );
      if (overlayRect.width < 8 || overlayRect.height < 8) {
        return;
      }
      setOverlayRect((current) =>
        current && rectsEqual(current, overlayRect) ? current : overlayRect,
      );
    };

    const updateFrame = () => {
      if (frameTimer !== undefined) {
        clearTimeout(frameTimer);
      }
      frameTimer = setTimeout(() => {
        measure();
      }, 80);
    };

    measure();

    const observer = new ResizeObserver(updateFrame);
    observer.observe(paper);
    const tools = toolPaletteRef.current;
    if (tools) {
      observer.observe(tools);
    }
    globalThis.addEventListener("resize", updateFrame);
    globalThis.visualViewport?.addEventListener("resize", updateFrame);

    return () => {
      if (frameTimer !== undefined) {
        clearTimeout(frameTimer);
      }
      observer.disconnect();
      globalThis.removeEventListener("resize", updateFrame);
      globalThis.visualViewport?.removeEventListener("resize", updateFrame);
    };
  }, [nativeAvailable, paperRef, toolPaletteRef]);

  useLayoutEffect(() => {
    const owner = ownerRef.current;
    if (!drawing || !overlayRect) {
      nativeDrawingOverlayCoordinator.release(owner);
      return;
    }
    nativeDrawingOverlayCoordinator.request({
      owner,
      documentId,
      color,
      width,
      opacity,
      tool: tool === "eraser" ? "eraser" : "pen",
      rect: overlayRect,
      sketchRepository,
      onError: (message) => onErrorRef.current?.(message),
    });
  }, [
    color,
    documentId,
    drawing,
    opacity,
    overlayRect,
    sketchRepository,
    tool,
    width,
  ]);

  return {
    nativeAvailable,
    overlayActive,
    overlayRequested: drawing,
  };
}
