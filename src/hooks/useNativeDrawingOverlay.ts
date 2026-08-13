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
import type { PenNib } from "../sketch/types";
import type { DrawingGridSettings } from "../domain/models";
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
  nib = "pen",
  width,
  opacity = 1,
  fingerDrawing = true,
  paperRef,
  protectedHeaderRef,
  toolPaletteRef,
  sketchRepository,
  onError,
  clipShape,
  grid,
}: {
  documentId: string;
  enabled: boolean;
  tool: "pen" | "eraser" | "view" | "arrange";
  color: string;
  nib?: PenNib;
  width: number;
  opacity?: number;
  fingerDrawing?: boolean;
  paperRef: RefObject<HTMLDivElement | null>;
  protectedHeaderRef?: RefObject<HTMLElement | null>;
  toolPaletteRef: RefObject<HTMLDivElement | null>;
  sketchRepository: SketchRepository;
  onError?: (message: string) => void;
  clipShape?: "circle";
  grid?: DrawingGridSettings;
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
  const [gridOrigin, setGridOrigin] = useState({ x: 0, y: 0 });
  const [gridPageSize, setGridPageSize] = useState({ width: 1200, height: 820 });
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
        protectedHeaderRef?.current,
      );
      if (overlayRect.width < 8 || overlayRect.height < 8) {
        return;
      }
      setOverlayRect((current) =>
        current && rectsEqual(current, overlayRect) ? current : overlayRect,
      );
      const paperBounds = paper.getBoundingClientRect();
      const gridCanvasBounds =
        paper
          .querySelector<HTMLElement>(".sketch-layer")
          ?.getBoundingClientRect() ?? paperBounds;
      setGridOrigin({
        x: overlayRect.x - gridCanvasBounds.left,
        y: overlayRect.y - gridCanvasBounds.top,
      });
      setGridPageSize({
        width: gridCanvasBounds.width,
        height: gridCanvasBounds.height,
      });
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
    const protectedHeader = protectedHeaderRef?.current;
    if (protectedHeader) {
      observer.observe(protectedHeader);
    }
    globalThis.addEventListener("resize", updateFrame);
    globalThis.addEventListener("scroll", updateFrame, true);
    globalThis.visualViewport?.addEventListener("resize", updateFrame);

    return () => {
      if (frameTimer !== undefined) {
        clearTimeout(frameTimer);
      }
      observer.disconnect();
      globalThis.removeEventListener("resize", updateFrame);
      globalThis.removeEventListener("scroll", updateFrame, true);
      globalThis.visualViewport?.removeEventListener("resize", updateFrame);
    };
  }, [nativeAvailable, paperRef, protectedHeaderRef, toolPaletteRef]);

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
      nib,
      width,
      opacity,
      fingerDrawing,
      tool: tool === "eraser" ? "eraser" : "pen",
      rect: overlayRect,
      clipShape,
      grid,
      gridOriginX: gridOrigin.x,
      gridOriginY: gridOrigin.y,
      gridPageWidth: gridPageSize.width,
      gridPageHeight: gridPageSize.height,
      sketchRepository,
      onError: (message) => onErrorRef.current?.(message),
    });
  }, [
    color,
    nib,
    clipShape,
    documentId,
    drawing,
    grid,
    gridOrigin.x,
    gridOrigin.y,
    gridPageSize.height,
    gridPageSize.width,
    opacity,
    fingerDrawing,
    overlayRect,
    sketchRepository,
    tool,
    width,
  ]);

  return {
    nativeAvailable,
    overlayActive,
    overlayRequested: drawing,
    suspendOverlay: () =>
      nativeDrawingOverlayCoordinator.releaseAndWait(ownerRef.current),
  };
}
