import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ForwardedRef,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { SaveHealth } from "../domain/models";
import type { DrawingGridSettings } from "../domain/models";
import { createId } from "../utils/id";
import {
  distance,
  distanceToSegment,
  shouldAppendSample,
} from "./geometry";
import { drawStroke, renderDocument } from "./renderer";
import { drawGrid, gridAxisForSample, snapSampleToGrid } from "./gridGeometry";
import type {
  PencilSample,
  SketchCapabilityProfile,
  SketchDocument,
  SketchRepository,
  SketchStroke,
  SketchSurfaceError,
  SketchTool,
  PenNib,
} from "./types";

type HistoryEntry =
  | { type: "stroke-add"; stroke: SketchStroke }
  | { type: "stroke-delete"; stroke: SketchStroke; index: number };

export interface SketchSurfaceHandle {
  exportPreviewDataUrl(): string | undefined;
  redo(): void;
  undo(): void;
}

type SketchSurfaceProps = {
  capabilities: SketchCapabilityProfile;
  documentId: string;
  grid?: DrawingGridSettings;
  penColor: string;
  penNib?: PenNib;
  penWidth: number;
  penOpacity?: number;
  repository: SketchRepository;
  tool: SketchTool;
  onError?: (error: SketchSurfaceError) => void;
  onMutation?: () => void;
  onSaveHealthChange?: (health: SaveHealth) => void;
};

function sampleFromEvent(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
  document: SketchDocument,
): PencilSample {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * document.size.width,
    y: ((event.clientY - bounds.top) / bounds.height) * document.size.height,
    pressure: event.pressure > 0 ? event.pressure : 0.5,
    timestamp: event.timeStamp,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
  };
}

function strokeHit(
  stroke: SketchStroke,
  point: PencilSample,
  radius: number,
): boolean {
  if (stroke.points.length === 1 && stroke.points[0]) {
    return distanceToSegment(point, stroke.points[0], stroke.points[0]) <= radius;
  }

  for (let index = 1; index < stroke.points.length; index += 1) {
    const previous = stroke.points[index - 1];
    const current = stroke.points[index];
    if (
      previous &&
      current &&
      distanceToSegment(point, previous, current) <= radius
    ) {
      return true;
    }
  }

  return false;
}

function SketchSurfaceComponent(
  {
    capabilities,
    documentId,
    grid,
    penColor,
    penNib = "pen",
    penWidth,
    penOpacity = 1,
    repository,
    tool,
    onError,
    onMutation,
    onSaveHealthChange,
  }: SketchSurfaceProps,
  ref: ForwardedRef<SketchSurfaceHandle>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const documentRef = useRef<SketchDocument | undefined>(undefined);
  const activeStrokeRef = useRef<SketchStroke | undefined>(undefined);
  const activePointerRef = useRef<number | undefined>(undefined);
  const activeGridAxisRef = useRef<"horizontal" | "vertical" | undefined>(undefined);
  const frameRef = useRef<number | undefined>(undefined);
  const historyRef = useRef<HistoryEntry[]>([]);
  const redoHistoryRef = useRef<HistoryEntry[]>([]);
  const onErrorRef = useRef(onError);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const configureContext = useCallback(
    (canvas: HTMLCanvasElement): CanvasRenderingContext2D | null => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(bounds.width * pixelRatio));
      const height = Math.max(1, Math.round(bounds.height * pixelRatio));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const context = canvas.getContext("2d");
      const document = documentRef.current;
      if (!context || !document) {
        return null;
      }

      context.setTransform(
        width / document.size.width,
        0,
        0,
        height / document.size.height,
        0,
        0,
      );
      return context;
    },
    [],
  );

  const renderScene = useCallback(() => {
    const canvas = sceneCanvasRef.current;
    const document = documentRef.current;
    if (!canvas || !document) {
      return;
    }

    const context = configureContext(canvas);
    if (!context) {
      onErrorRef.current?.({
        code: "canvas-unavailable",
        message: "Drawing is unavailable on this device.",
        recoverable: false,
      });
      return;
    }

    renderDocument(context, document);
  }, [configureContext]);

  const renderLiveStroke = useCallback(() => {
    const canvas = liveCanvasRef.current;
    const document = documentRef.current;
    if (!canvas || !document) {
      return;
    }

    const context = configureContext(canvas);
    if (!context) {
      return;
    }

    context.clearRect(0, 0, document.size.width, document.size.height);
    if (grid) {
      drawGrid(context, document.size.width, document.size.height, grid);
    }
    if (activeStrokeRef.current) {
      drawStroke(context, activeStrokeRef.current);
    }
  }, [configureContext, grid]);

  const scheduleSceneRender = useCallback(() => {
    if (frameRef.current !== undefined) {
      return;
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = undefined;
      renderScene();
      renderLiveStroke();
    });
  }, [renderLiveStroke, renderScene]);

  useEffect(() => {
    scheduleSceneRender();
  }, [grid, scheduleSceneRender]);

  const persist = useCallback(
    async (document: SketchDocument) => {
      onSaveHealthChange?.({
        localDurability: "saving",
        remoteSync: "offline",
        durableRevision: Math.max(0, document.revision - 1),
        pendingOperationCount: document.revision,
      });
      const health = await repository.save(document);
      onSaveHealthChange?.(health);
      if (health.localDurability === "error") {
        onError?.({
          code: "storage-failed",
          message: health.message ?? "The drawing could not be saved.",
          recoverable: true,
        });
      }
    },
    [onError, onSaveHealthChange, repository],
  );

  const replaceDocument = useCallback(
    (next: SketchDocument) => {
      documentRef.current = next;
      scheduleSceneRender();
      void persist(next);
    },
    [persist, scheduleSceneRender],
  );

  const undo = useCallback(() => {
    const document = documentRef.current;
    const entry = historyRef.current.pop();
    if (!document || !entry) {
      return;
    }

    let strokes: SketchStroke[];
    switch (entry.type) {
      case "stroke-add":
        strokes = document.strokes.filter((stroke) => stroke.id !== entry.stroke.id);
        break;
      case "stroke-delete":
        strokes = [...document.strokes];
        strokes.splice(entry.index, 0, entry.stroke);
        break;
      default: {
        const exhaustiveEntry: never = entry;
        throw new Error(`Unsupported history entry: ${String(exhaustiveEntry)}`);
      }
    }

    redoHistoryRef.current.push(entry);

    replaceDocument({
      ...document,
      strokes,
      revision: document.revision + 1,
    });
  }, [replaceDocument]);

  const redo = useCallback(() => {
    const document = documentRef.current;
    const entry = redoHistoryRef.current.pop();
    if (!document || !entry) return;

    const strokes = entry.type === "stroke-add"
      ? [...document.strokes, entry.stroke]
      : document.strokes.filter((stroke) => stroke.id !== entry.stroke.id);
    historyRef.current.push(entry);
    replaceDocument({
      ...document,
      strokes,
      revision: document.revision + 1,
    });
  }, [replaceDocument]);

  const exportPreviewDataUrl = useCallback(
    () => sceneCanvasRef.current?.toDataURL("image/png"),
    [],
  );

  useImperativeHandle(
    ref,
    () => ({ exportPreviewDataUrl, redo, undo }),
    [exportPreviewDataUrl, redo, undo],
  );

  useEffect(() => {
    let cancelled = false;
    void repository
      .load(documentId)
      .then((document) => {
        if (cancelled) {
          return;
        }
        documentRef.current = document;
        historyRef.current = [];
        redoHistoryRef.current = [];
        setLoading(false);
        scheduleSceneRender();
        onSaveHealthChange?.({
          localDurability: "saved",
          remoteSync: "offline",
          durableRevision: document.revision,
          pendingOperationCount: document.revision,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setLoading(false);
        onErrorRef.current?.({
          code: "storage-failed",
          message:
            error instanceof Error
              ? error.message
              : "The drawing could not be opened.",
          recoverable: true,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [documentId, onSaveHealthChange, repository, scheduleSceneRender]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver(scheduleSceneRender);
    observer.observe(container);
    return () => observer.disconnect();
  }, [scheduleSceneRender]);

  useEffect(
    () => () => {
      if (frameRef.current !== undefined) {
        cancelAnimationFrame(frameRef.current);
      }
    },
    [],
  );

  const inputAllowed = useCallback(
    (event: PointerEvent): boolean => {
      if (capabilities.kind === "readonly") {
        return false;
      }
      if (event.pointerType === "touch") {
        return capabilities.fingerDrawing;
      }
      return event.pointerType === "pen" || event.pointerType === "mouse";
    },
    [capabilities],
  );

  const eraseAt = useCallback(
    (point: PencilSample) => {
      const document = documentRef.current;
      if (!document) {
        return;
      }

      for (let index = document.strokes.length - 1; index >= 0; index -= 1) {
        const stroke = document.strokes[index];
        if (!stroke || !strokeHit(stroke, point, 24)) {
          continue;
        }
        historyRef.current.push({ type: "stroke-delete", stroke, index });
        redoHistoryRef.current = [];
        onMutation?.();
        replaceDocument({
          ...document,
          strokes: document.strokes.filter((candidate) => candidate.id !== stroke.id),
          revision: document.revision + 1,
        });
        return;
      }
    },
    [onMutation, replaceDocument],
  );

  const handlePointerDown = useCallback(
    (reactEvent: ReactPointerEvent<HTMLCanvasElement>) => {
      const event = reactEvent.nativeEvent;
      const canvas = liveCanvasRef.current;
      const document = documentRef.current;
      if (!canvas || !document || loading || !inputAllowed(event)) {
        return;
      }

      reactEvent.preventDefault();
      canvas.focus({ preventScroll: true });
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Continue without capture. The document-level Pointer Events fallback is
        // sufficient for a mark that remains over the canvas.
      }

      activePointerRef.current = event.pointerId;
      const point = sampleFromEvent(event, canvas, document);
      if (tool === "eraser") {
        eraseAt(point);
        return;
      }

      activeStrokeRef.current = {
        id: createId(),
        tool: "pen",
        points: [point],
        color: penColor,
        nib: penNib,
        width: penWidth,
        opacity: penOpacity,
        createdAt: new Date().toISOString(),
      };
      activeGridAxisRef.current = undefined;
      renderLiveStroke();
    },
    [
      eraseAt,
      inputAllowed,
      loading,
      penColor,
      penNib,
      penOpacity,
      penWidth,
      renderLiveStroke,
      tool,
    ],
  );

  const handlePointerMove = useCallback(
    (reactEvent: ReactPointerEvent<HTMLCanvasElement>) => {
      const event = reactEvent.nativeEvent;
      const canvas = liveCanvasRef.current;
      const document = documentRef.current;
      if (
        !canvas ||
        !document ||
        activePointerRef.current !== event.pointerId
      ) {
        return;
      }

      reactEvent.preventDefault();
      const coalesced = event.getCoalescedEvents?.() ?? [];
      const events = coalesced.length > 0 ? coalesced : [event];
      if (tool === "eraser") {
        const latest = events.at(-1);
        if (latest) {
          eraseAt(sampleFromEvent(latest, canvas, document));
        }
        return;
      }

      const active = activeStrokeRef.current;
      if (!active) {
        return;
      }
      for (const sampleEvent of events) {
        let sample = sampleFromEvent(sampleEvent, canvas, document);
        const start = active.points[0];
        if (grid?.enabled && start) {
          if (!activeGridAxisRef.current && distance(start, sample) >= 8) {
            activeGridAxisRef.current = gridAxisForSample(
              sample,
              start,
              grid.rotationDegrees,
            );
            active.points = active.points.map((point) =>
              snapSampleToGrid(
                point,
                start,
                grid,
                activeGridAxisRef.current,
              ),
            );
          }
          if (activeGridAxisRef.current) {
            sample = snapSampleToGrid(
              sample,
              start,
              grid,
              activeGridAxisRef.current,
            );
          }
        }
        if (shouldAppendSample(active.points.at(-1), sample)) {
          active.points.push(sample);
        }
      }
      renderLiveStroke();
    },
    [eraseAt, grid, renderLiveStroke, tool],
  );

  const finishPointer = useCallback(
    (event: PointerEvent, cancelled: boolean) => {
      if (activePointerRef.current !== event.pointerId) {
        return;
      }

      const active = activeStrokeRef.current;
      const document = documentRef.current;
      const canvas = liveCanvasRef.current;
      const previous = active?.points.at(-1);
      if (!cancelled && active && document && canvas && previous) {
        let released = sampleFromEvent(event, canvas, document);
        const start = active.points[0];
        if (grid?.enabled && start && activeGridAxisRef.current) {
          released = snapSampleToGrid(
            released,
            start,
            grid,
            activeGridAxisRef.current,
          );
        }
        if (distance(previous, released) >= 0.1) {
          active.points.push({
            ...released,
            pressure:
              released.pressure > 0 ? released.pressure : previous.pressure,
          });
        }
      }

      activePointerRef.current = undefined;
      activeStrokeRef.current = undefined;
      activeGridAxisRef.current = undefined;
      renderLiveStroke();

      if (!document || !active || active.points.length === 0) {
        if (cancelled) {
          onError?.({
            code: "pointer-cancelled",
            message: "The interrupted mark could not be recovered.",
            recoverable: true,
          });
        }
        return;
      }

      historyRef.current.push({ type: "stroke-add", stroke: active });
      redoHistoryRef.current = [];
      onMutation?.();
      replaceDocument({
        ...document,
        strokes: [...document.strokes, active],
        revision: document.revision + 1,
      });
    },
    [grid, onError, onMutation, renderLiveStroke, replaceDocument],
  );

  useEffect(() => {
    const finishOutsideCanvas = (event: PointerEvent) =>
      finishPointer(event, false);
    const cancelOutsideCanvas = (event: PointerEvent) =>
      finishPointer(event, true);
    window.addEventListener("pointerup", finishOutsideCanvas);
    window.addEventListener("pointercancel", cancelOutsideCanvas);
    return () => {
      window.removeEventListener("pointerup", finishOutsideCanvas);
      window.removeEventListener("pointercancel", cancelOutsideCanvas);
    };
  }, [finishPointer]);

  return (
    <div
      className="sketch-surface"
      ref={containerRef}
      aria-busy={loading}
    >
      <canvas className="sketch-layer" ref={sceneCanvasRef} />
      <canvas
        aria-label="Drawing area"
        className="sketch-layer sketch-input-layer"
        onContextMenu={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
        onPointerCancel={(event) => finishPointer(event.nativeEvent, true)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointer(event.nativeEvent, false)}
        ref={liveCanvasRef}
        tabIndex={0}
      />
      {loading ? <p className="sketch-loading">Opening page…</p> : null}
    </div>
  );
}

export const SketchSurface = forwardRef(SketchSurfaceComponent);
