import { ArrowDown, ArrowUp, Copy, GripHorizontal, Trash2 } from "lucide-react";
import {
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import type { ShapeObject } from "../domain/models";
import { PAGE_LAYOUT_BOUNDS, clampPosition } from "./arrangeGeometry";
import { ConfirmDialog } from "./ConfirmDialog";
import { ShapeCard } from "./ShapeCard";
import { shapeBoundaryVertices, shapeVertices } from "./shapeGeometry";

type ShapeMode = "move" | "rotate" | "scale";
type DragState = {
  pointerId: number;
  mode: ShapeMode;
  start: ShapeObject;
  startX: number;
  startY: number;
  centreX: number;
  centreY: number;
  startDistance: number;
  startAngle: number;
};
type PalettePosition = { left: number; top: number };

let retainedPalettePosition: PalettePosition | undefined;
let retainedSnapEnabled = true;
let retainedShapeMode: ShapeMode = "move";
let retainedColourOpen = false;
const SNAP_DISTANCE_PX = 20;

const normalizedRotation = (degrees: number) => ((degrees % 360) + 360) % 360;
const distance = (x: number, y: number, centreX: number, centreY: number) => Math.hypot(x - centreX, y - centreY);
const angle = (x: number, y: number, centreX: number, centreY: number) => Math.atan2(y - centreY, x - centreX) * 180 / Math.PI;
const snapRotation = (degrees: number) => {
  const snapped = Math.round(degrees / 15) * 15;
  return normalizedRotation(Math.abs(degrees - snapped) <= 2.5 ? snapped : degrees);
};

function fitFrameToVertices(shape: ShapeObject, points: Array<{ x: number; y: number }>, pageWidth: number, pageHeight: number): ShapeObject {
  const frame = shape.frame ?? { width: 0.24, height: 0.24 };
  const minX = Math.min(...points.map(({ x }) => x));
  const maxX = Math.max(...points.map(({ x }) => x));
  const minY = Math.min(...points.map(({ y }) => y));
  const maxY = Math.max(...points.map(({ y }) => y));
  const spanX = Math.max(0.01, maxX - minX);
  const spanY = Math.max(0.01, maxY - minY);
  const radians = (shape.rotationDegrees ?? 0) * Math.PI / 180;
  const localCentreX = ((minX + maxX) / 2 - 0.5) * frame.width * pageWidth;
  const localCentreY = ((minY + maxY) / 2 - 0.5) * frame.height * pageHeight;
  const centreX = shape.position.x + frame.width / 2 + (localCentreX * Math.cos(radians) - localCentreY * Math.sin(radians)) / pageWidth;
  const centreY = shape.position.y + frame.height / 2 + (localCentreX * Math.sin(radians) + localCentreY * Math.cos(radians)) / pageHeight;
  const nextFrame = { width: frame.width * spanX, height: frame.height * spanY };
  return {
    ...shape,
    frame: nextFrame,
    position: { x: centreX - nextFrame.width / 2, y: centreY - nextFrame.height / 2 },
    points: points.map(({ x, y }) => ({ x: (x - minX) / spanX, y: (y - minY) / spanY })),
  };
}

function constrainVertexToCanvas(point: { x: number; y: number }, shape: ShapeObject, page: DOMRect) {
  const frame = shape.frame ?? { width: 0.24, height: 0.24 };
  const radians = (shape.rotationDegrees ?? 0) * Math.PI / 180;
  const localX = (point.x - 0.5) * frame.width * page.width;
  const localY = (point.y - 0.5) * frame.height * page.height;
  const centreX = page.left + (shape.position.x + frame.width / 2) * page.width;
  const centreY = page.top + (shape.position.y + frame.height / 2) * page.height;
  const worldX = centreX + localX * Math.cos(radians) - localY * Math.sin(radians);
  const worldY = centreY + localX * Math.sin(radians) + localY * Math.cos(radians);
  const boundedX = Math.max(page.left + PAGE_LAYOUT_BOUNDS.left * page.width, Math.min(worldX, page.left + PAGE_LAYOUT_BOUNDS.right * page.width));
  const boundedY = Math.max(page.top + PAGE_LAYOUT_BOUNDS.top * page.height, Math.min(worldY, page.top + PAGE_LAYOUT_BOUNDS.bottom * page.height));
  const deltaX = boundedX - centreX;
  const deltaY = boundedY - centreY;
  return {
    x: (deltaX * Math.cos(radians) + deltaY * Math.sin(radians)) / frame.width / page.width + 0.5,
    y: (-deltaX * Math.sin(radians) + deltaY * Math.cos(radians)) / frame.height / page.height + 0.5,
  };
}

function reframeEditedVertices(shape: ShapeObject, points: Array<{ x: number; y: number }>, page: DOMRect) {
  const outsideFrame = points.some(({ x, y }) => x < 0 || x > 1 || y < 0 || y > 1);
  return shape.shapeKind === "rectangle" || outsideFrame
    ? fitFrameToVertices({ ...shape, points }, points, page.width, page.height)
    : { ...shape, points };
}

function shapeStyle(shape: ShapeObject, stackIndex: number): CSSProperties {
  const frame = shape.frame ?? { width: 0.24, height: 0.24 };
  return {
    height: `${frame.height * 100}%`,
    left: `${shape.position.x * 100}%`,
    top: `${shape.position.y * 100}%`,
    transform: `rotate(${shape.rotationDegrees ?? 0}deg)`,
    width: `${frame.width * 100}%`,
    zIndex: shape.layer === "behind-sketch" ? 0 : 20 + stackIndex,
  };
}

function editorNodePoints(shape: ShapeObject) {
  if (shape.shapeKind === "circle") return [{ x: 0.96, y: 0.5 }];
  return shape.shapeKind === "rectangle" ? shapeVertices(shape) : shapeBoundaryVertices(shape);
}

function canvasNodePoints(shape: ShapeObject, page: DOMRect) {
  const frame = shape.frame ?? { width: 0.24, height: 0.24 };
  const radians = (shape.rotationDegrees ?? 0) * Math.PI / 180;
  const centreX = page.left + (shape.position.x + frame.width / 2) * page.width;
  const centreY = page.top + (shape.position.y + frame.height / 2) * page.height;
  return editorNodePoints(shape).map((point) => {
    const localX = (point.x - 0.5) * frame.width * page.width;
    const localY = (point.y - 0.5) * frame.height * page.height;
    return { x: centreX + localX * Math.cos(radians) - localY * Math.sin(radians), y: centreY + localX * Math.sin(radians) + localY * Math.cos(radians) };
  });
}

export function ShapeEditor({
  arrange,
  canMoveDown,
  canMoveUp,
  onDelete,
  onDeselect,
  onDuplicate,
  onMoveDown,
  onMoveUp,
  onSelect,
  onUpdate,
  pageRef,
  selected,
  shape,
  snapShapes,
  stackIndex,
}: {
  arrange: boolean;
  canMoveDown: boolean;
  canMoveUp: boolean;
  onDelete: () => void;
  onDeselect: () => void;
  onDuplicate: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onSelect: () => void;
  onUpdate: (shape: ShapeObject, previous: ShapeObject) => void;
  pageRef: RefObject<HTMLDivElement | null>;
  selected: boolean;
  shape: ShapeObject;
  snapShapes: ShapeObject[];
  stackIndex: number;
}) {
  const [mode, setMode] = useState<ShapeMode>(retainedShapeMode);
  const [draft, setDraft] = useState<ShapeObject>();
  const [colourOpen, setColourOpen] = useState(retainedColourOpen);
  const [addingVertex, setAddingVertex] = useState(false);
  const [selectedVertex, setSelectedVertex] = useState<number>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [controllerTarget, setControllerTarget] = useState<Element | null>(null);
  const [palettePosition, setPalettePosition] = useState<CSSProperties>(retainedPalettePosition ?? { left: 12, top: 12 });
  const [announcement, setAnnouncement] = useState("");
  const [, setSnapRevision] = useState(0);
  const draftRef = useRef<ShapeObject | undefined>(undefined);
  const pendingRevisionRef = useRef<number | undefined>(undefined);
  const dragRef = useRef<DragState | undefined>(undefined);
  const vertexRef = useRef<{ pointerId: number; index: number; start: ShapeObject } | undefined>(undefined);
  const objectRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const paletteDragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | undefined>(undefined);
  const current = draft ?? shape;
  const activePalettePlaced = Boolean(retainedPalettePosition);
  const activePalettePosition = retainedPalettePosition ?? palettePosition;
  const frame = current.frame ?? { width: 0.24, height: 0.24 };
  const vertices = current.shapeKind === "circle" ? [] : current.shapeKind === "rectangle" ? shapeVertices(current) : shapeBoundaryVertices(current);
  const snapEnabled = retainedSnapEnabled;
  const activeMode = selected ? retainedShapeMode : mode;
  const activeColourOpen = selected ? retainedColourOpen : colourOpen;

  const nearestSnapPoint = (x: number, y: number, page: DOMRect) => {
    if (!snapEnabled) return undefined;
    let nearest: { x: number; y: number; distance: number } | undefined;
    for (const target of snapShapes.flatMap((candidate) => canvasNodePoints(candidate, page))) {
      const targetDistance = Math.hypot(target.x - x, target.y - y);
      if (targetDistance <= SNAP_DISTANCE_PX && (!nearest || targetDistance < nearest.distance)) nearest = { ...target, distance: targetDistance };
    }
    return nearest;
  };

  const snapMovedShape = (candidate: ShapeObject, page: DOMRect) => {
    if (!snapEnabled) return candidate;
    let adjustment: { x: number; y: number; distance: number } | undefined;
    const targets = snapShapes.flatMap((other) => canvasNodePoints(other, page));
    for (const own of canvasNodePoints(candidate, page)) {
      for (const target of targets) {
        const dx = target.x - own.x;
        const dy = target.y - own.y;
        const targetDistance = Math.hypot(dx, dy);
        if (targetDistance <= SNAP_DISTANCE_PX && (!adjustment || targetDistance < adjustment.distance)) adjustment = { x: dx, y: dy, distance: targetDistance };
      }
    }
    return adjustment ? { ...candidate, position: { x: candidate.position.x + adjustment.x / page.width, y: candidate.position.y + adjustment.y / page.height } } : candidate;
  };

  useEffect(() => {
    const pendingRevision = pendingRevisionRef.current;
    if (pendingRevision === undefined || shape.revision < pendingRevision) return;
    pendingRevisionRef.current = undefined;
    draftRef.current = undefined;
    setDraft(undefined);
  }, [shape]);

  useEffect(() => {
    setControllerTarget(pageRef.current?.isConnected ? pageRef.current : typeof document !== "undefined" ? document.body : null);
  }, [pageRef]);

  useLayoutEffect(() => {
    if (!selected || !arrange) return;
    const position = () => {
      const object = objectRef.current?.getBoundingClientRect();
      const palette = paletteRef.current?.getBoundingClientRect();
      const page = pageRef.current?.getBoundingClientRect();
      if (!object || !palette || !page) return;
      const viewport = globalThis.visualViewport;
      const margin = 12;
      const leftBound = Math.max(page.left, viewport?.offsetLeft ?? 0) + margin;
      const topBound = Math.max(page.top, viewport?.offsetTop ?? 0) + margin;
      const rightBound = Math.min(page.right, (viewport?.offsetLeft ?? 0) + (viewport?.width ?? globalThis.innerWidth)) - margin;
      const bottomBound = Math.min(page.bottom, (viewport?.offsetTop ?? 0) + (viewport?.height ?? globalThis.innerHeight)) - margin;
      if (activePalettePlaced) {
        setPalettePosition(() => {
          const viewportLeft = (viewport?.offsetLeft ?? 0) + margin;
          const viewportTop = (viewport?.offsetTop ?? 0) + margin;
          const viewportRight = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? globalThis.innerWidth) - margin;
          const viewportBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? globalThis.innerHeight) - margin;
          const clamped = {
            left: Math.max(viewportLeft, Math.min(retainedPalettePosition?.left ?? margin, viewportRight - palette.width)),
            top: Math.max(viewportTop, Math.min(retainedPalettePosition?.top ?? margin, viewportBottom - palette.height)),
          };
          retainedPalettePosition = clamped;
          return clamped;
        });
        return;
      }
      const candidates = [
        { left: object.right + margin, top: object.top },
        { left: object.left - palette.width - margin, top: object.top },
        { left: object.left, top: object.bottom + margin },
        { left: object.left, top: object.top - palette.height - margin },
      ];
      const fitting = candidates.find((candidate) => candidate.left >= leftBound && candidate.left + palette.width <= rightBound && candidate.top >= topBound && candidate.top + palette.height <= bottomBound);
      const preferred = fitting ?? candidates[object.left + object.width / 2 < (leftBound + rightBound) / 2 ? 0 : 1]!;
      setPalettePosition({
        left: Math.max(leftBound, Math.min(preferred.left, rightBound - palette.width)),
        top: Math.max(topBound, Math.min(preferred.top, bottomBound - palette.height)),
      });
    };
    position();
    globalThis.addEventListener("resize", position);
    globalThis.addEventListener("scroll", position, true);
    globalThis.visualViewport?.addEventListener("resize", position);
    globalThis.visualViewport?.addEventListener("scroll", position);
    return () => {
      globalThis.removeEventListener("resize", position);
      globalThis.removeEventListener("scroll", position, true);
      globalThis.visualViewport?.removeEventListener("resize", position);
      globalThis.visualViewport?.removeEventListener("scroll", position);
    };
  }, [activePalettePlaced, activeColourOpen, arrange, current.frame, current.position, current.rotationDegrees, pageRef, selected]);

  const movePalette = (left: number, top: number) => {
    const palette = paletteRef.current?.getBoundingClientRect();
    const viewport = globalThis.visualViewport;
    if (!palette) return;
    const margin = 12;
    const minLeft = (viewport?.offsetLeft ?? 0) + margin;
    const minTop = (viewport?.offsetTop ?? 0) + margin;
    const maxLeft = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? globalThis.innerWidth) - palette.width - margin;
    const maxTop = (viewport?.offsetTop ?? 0) + (viewport?.height ?? globalThis.innerHeight) - palette.height - margin;
    const next = { left: Math.max(minLeft, Math.min(left, maxLeft)), top: Math.max(minTop, Math.min(top, maxTop)) };
    retainedPalettePosition = next;
    setPalettePosition(next);
  };

  const beginPaletteMove = (event: PointerEvent<HTMLButtonElement>) => {
    const palette = paletteRef.current?.getBoundingClientRect();
    if (!palette || event.button !== 0) return;
    event.preventDefault();
    paletteDragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - palette.left, offsetY: event.clientY - palette.top };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Continue while pointer events arrive. */ }
  };

  const updatePaletteMove = (event: PointerEvent<HTMLButtonElement>) => {
    const active = paletteDragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    movePalette(event.clientX - active.offsetX, event.clientY - active.offsetY);
  };

  const keyboardPaletteMove = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const step = event.shiftKey ? 40 : 10;
    movePalette((Number(activePalettePosition.left) || 0) + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), (Number(activePalettePosition.top) || 0) + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0));
  };

  const commit = (next: ShapeObject, message: string) => {
    const committed = { ...next, revision: Math.max(shape.revision, next.revision) + 1 };
    draftRef.current = undefined;
    pendingRevisionRef.current = committed.revision;
    // Keep the committed draft visible until the asynchronous parent update
    // returns it. Clearing here briefly exposes the previous saved position.
    setDraft(committed);
    onUpdate(committed, shape);
    setAnnouncement(message);
  };

  const preview = (next: ShapeObject) => {
    draftRef.current = next;
    setDraft(next);
  };

  const beginTransform = (event: PointerEvent<HTMLDivElement>) => {
    if (!arrange || event.button !== 0 || (event.target instanceof Element && event.target.closest("button, input"))) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect();
    if (!selected) return;
    const bounds = pageRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const centreX = bounds.left + (current.position.x + frame.width / 2) * bounds.width;
    const centreY = bounds.top + (current.position.y + frame.height / 2) * bounds.height;
    dragRef.current = {
      pointerId: event.pointerId, mode: activeMode, start: current, startX: event.clientX, startY: event.clientY,
      centreX, centreY, startDistance: Math.max(1, distance(event.clientX, event.clientY, centreX, centreY)),
      startAngle: angle(event.clientX, event.clientY, centreX, centreY),
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Continue while pointer events arrive. */ }
  };

  const beginCircleScale = (event: PointerEvent<HTMLButtonElement>) => {
    if (!arrange || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect();
    const bounds = pageRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const centreX = bounds.left + (current.position.x + frame.width / 2) * bounds.width;
    const centreY = bounds.top + (current.position.y + frame.height / 2) * bounds.height;
    dragRef.current = {
      pointerId: event.pointerId, mode: "scale", start: current, startX: event.clientX, startY: event.clientY,
      centreX, centreY, startDistance: Math.max(1, distance(event.clientX, event.clientY, centreX, centreY)),
      startAngle: 0,
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Continue while pointer events arrive. */ }
  };

  const updateTransform = (event: PointerEvent<HTMLElement>) => {
    if (vertexRef.current || (event.target instanceof Element && event.target.closest(".shape-vertex-handle, .shape-edge-handle"))) return;
    const active = dragRef.current;
    const bounds = pageRef.current?.getBoundingClientRect();
    if (!active || !bounds || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    const startFrame = active.start.frame ?? { width: 0.24, height: 0.24 };
    if (active.mode === "move") {
      const nextFrame = startFrame;
      const moved = { ...active.start, position: clampPosition({ x: active.start.position.x + (event.clientX - active.startX) / bounds.width, y: active.start.position.y + (event.clientY - active.startY) / bounds.height }, nextFrame) };
      const snapped = snapMovedShape(moved, bounds);
      preview({ ...snapped, position: clampPosition(snapped.position, nextFrame) });
    } else if (active.mode === "rotate") {
      const delta = angle(event.clientX, event.clientY, active.centreX, active.centreY) - active.startAngle;
      preview({ ...active.start, rotationDegrees: snapRotation((active.start.rotationDegrees ?? 0) + delta) });
    } else {
      const centre = { x: active.start.position.x + startFrame.width / 2, y: active.start.position.y + startFrame.height / 2 };
      const rawFactor = distance(event.clientX, event.clientY, active.centreX, active.centreY) / active.startDistance;
      const minimumFactor = Math.max(0.08 / startFrame.width, 0.08 / startFrame.height);
      const maximumFactor = Math.min((PAGE_LAYOUT_BOUNDS.right - PAGE_LAYOUT_BOUNDS.left) / startFrame.width, (PAGE_LAYOUT_BOUNDS.bottom - PAGE_LAYOUT_BOUNDS.top) / startFrame.height);
      const factor = Math.max(minimumFactor, Math.min(maximumFactor, rawFactor));
      const nextFrame = { width: startFrame.width * factor, height: startFrame.height * factor };
      preview({ ...active.start, frame: nextFrame, position: clampPosition({ x: centre.x - nextFrame.width / 2, y: centre.y - nextFrame.height / 2 }, nextFrame) });
    }
  };

  const finishTransform = (event: PointerEvent<HTMLElement>) => {
    if (vertexRef.current || (event.target instanceof Element && event.target.closest(".shape-vertex-handle, .shape-edge-handle"))) return;
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    if (draftRef.current) commit(draftRef.current, `${active.mode} complete`);
  };

  const cancelTransform = (event: PointerEvent<HTMLElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    draftRef.current = undefined;
    setDraft(undefined);
    setAnnouncement("Shape change cancelled");
  };

  const keyboardTransform = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!arrange || event.target !== event.currentTarget) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (dragRef.current || draft) {
        dragRef.current = undefined;
        draftRef.current = undefined;
        setDraft(undefined);
        setAnnouncement("Shape change cancelled");
      } else {
        onDeselect();
      }
      return;
    }
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const amount = event.shiftKey ? 0.05 : 0.015;
    if (activeMode === "move") {
      const delta = { x: event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0, y: event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0 };
      commit({ ...current, position: clampPosition({ x: current.position.x + delta.x, y: current.position.y + delta.y }, frame) }, "Shape moved");
    } else if (activeMode === "rotate") {
      const direction = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1;
      commit({ ...current, rotationDegrees: normalizedRotation((current.rotationDegrees ?? 0) + direction * (event.shiftKey ? 15 : 5)) }, "Shape rotated");
    } else {
      const grow = event.key === "ArrowUp" || event.key === "ArrowRight";
      const requestedFactor = grow ? 1 + (event.shiftKey ? 0.15 : 0.05) : 1 - (event.shiftKey ? 0.15 : 0.05);
      const centre = { x: current.position.x + frame.width / 2, y: current.position.y + frame.height / 2 };
      const minimumFactor = Math.max(0.08 / frame.width, 0.08 / frame.height);
      const maximumFactor = Math.min((PAGE_LAYOUT_BOUNDS.right - PAGE_LAYOUT_BOUNDS.left) / frame.width, (PAGE_LAYOUT_BOUNDS.bottom - PAGE_LAYOUT_BOUNDS.top) / frame.height);
      const factor = Math.max(minimumFactor, Math.min(maximumFactor, requestedFactor));
      const nextFrame = { width: frame.width * factor, height: frame.height * factor };
      commit({ ...current, frame: nextFrame, position: clampPosition({ x: centre.x - nextFrame.width / 2, y: centre.y - nextFrame.height / 2 }, nextFrame) }, "Shape scaled");
    }
  };

  const keyboardCircleScale = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    event.stopPropagation();
    const grow = event.key === "ArrowUp" || event.key === "ArrowRight";
    const requestedFactor = grow ? 1 + (event.shiftKey ? 0.15 : 0.05) : 1 - (event.shiftKey ? 0.15 : 0.05);
    const centre = { x: current.position.x + frame.width / 2, y: current.position.y + frame.height / 2 };
    const minimumFactor = Math.max(0.08 / frame.width, 0.08 / frame.height);
    const maximumFactor = Math.min((PAGE_LAYOUT_BOUNDS.right - PAGE_LAYOUT_BOUNDS.left) / frame.width, (PAGE_LAYOUT_BOUNDS.bottom - PAGE_LAYOUT_BOUNDS.top) / frame.height);
    const factor = Math.max(minimumFactor, Math.min(maximumFactor, requestedFactor));
    const nextFrame = { width: frame.width * factor, height: frame.height * factor };
    commit({ ...current, frame: nextFrame, position: clampPosition({ x: centre.x - nextFrame.width / 2, y: centre.y - nextFrame.height / 2 }, nextFrame) }, "Circle scaled");
  };

  const keyboardVertex = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    event.stopPropagation();
    const amount = event.shiftKey ? 0.05 : 0.015;
    const page = pageRef.current?.getBoundingClientRect();
    if (!page) return;
    const point = vertices[index]!;
    const points = vertices.map((vertex, vertexIndex) => vertexIndex === index ? constrainVertexToCanvas({
      x: point.x + (event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0),
      y: point.y + (event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0),
    }, current, page) : vertex);
    const bounded = points.map((vertex) => constrainVertexToCanvas(vertex, current, page));
    const next = reframeEditedVertices(current, bounded, page);
    commit(next, `Vertex ${index + 1} moved`);
  };

  const vertexPosition = (event: PointerEvent<HTMLButtonElement>, base: ShapeObject) => {
    const page = pageRef.current?.getBoundingClientRect();
    if (!page) return undefined;
    const baseFrame = base.frame ?? { width: 0.24, height: 0.24 };
    const radians = -((base.rotationDegrees ?? 0) * Math.PI / 180);
    const centreX = page.left + (base.position.x + baseFrame.width / 2) * page.width;
    const centreY = page.top + (base.position.y + baseFrame.height / 2) * page.height;
    const snap = nearestSnapPoint(event.clientX, event.clientY, page);
    const x = (snap?.x ?? event.clientX) - centreX;
    const y = (snap?.y ?? event.clientY) - centreY;
    return constrainVertexToCanvas({ x: (x * Math.cos(radians) - y * Math.sin(radians)) / baseFrame.width / page.width + 0.5, y: (x * Math.sin(radians) + y * Math.cos(radians)) / baseFrame.height / page.height + 0.5 }, base, page);
  };

  const updateVertex = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const active = vertexRef.current;
    if (!active) return;
    const point = vertexPosition(event, active.start);
    if (!active || !point || active.pointerId !== event.pointerId) return;
    const startingVertices = active.start.shapeKind === "rectangle" ? shapeVertices(active.start) : shapeBoundaryVertices(active.start);
    const page = pageRef.current?.getBoundingClientRect();
    if (!page) return;
    const next = startingVertices.map((vertex, index) => constrainVertexToCanvas(index === active.index ? point : vertex, active.start, page));
    preview(reframeEditedVertices(active.start, next, page));
  };

  const finishVertex = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!vertexRef.current || vertexRef.current.pointerId !== event.pointerId) return;
    vertexRef.current = undefined;
    if (draftRef.current) commit(draftRef.current, "Vertex moved");
  };

  const insertVertex = (index: number) => {
    const first = vertices[index]!;
    const second = vertices[(index + 1) % vertices.length]!;
    const points = [...vertices];
    points.splice(index + 1, 0, { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });
    setAddingVertex(false);
    setSelectedVertex(index + 1);
    commit({ ...current, shapeKind: current.shapeKind === "freeform" ? "freeform" : "polygon", points }, "Vertex added");
  };

  const removeVertex = () => {
    if (selectedVertex === undefined || vertices.length <= 3) return;
    const points = vertices.filter((_, index) => index !== selectedVertex);
    setSelectedVertex(undefined);
    commit({ ...current, shapeKind: current.shapeKind === "freeform" ? "freeform" : "polygon", points }, "Vertex deleted");
  };

  const palette = selected && arrange && typeof document !== "undefined" ? createPortal(
    <div aria-label="Shape editing commands" className="shape-edit-palette" ref={paletteRef} role="toolbar" style={activePalettePosition}>
      <button aria-label="Move shape editing palette" className="shape-palette-drag" data-help-topic="shape-palette-move" onKeyDown={keyboardPaletteMove} onLostPointerCapture={() => { paletteDragRef.current = undefined; }} onPointerDown={beginPaletteMove} onPointerMove={updatePaletteMove} onPointerUp={() => { paletteDragRef.current = undefined; }} type="button"><GripHorizontal aria-hidden="true" /></button>
      <div className="shape-edit-mode-group">{(["move", "rotate", "scale"] as const).map((value) => <button aria-pressed={activeMode === value} data-help-topic={`shape-${value}`} key={value} onClick={() => { retainedShapeMode = value; setMode(value); }} type="button">{value[0]!.toUpperCase() + value.slice(1)}</button>)}</div>
      <button aria-expanded={activeColourOpen} data-help-topic="shape-colour" onClick={() => { retainedColourOpen = !activeColourOpen; setColourOpen(retainedColourOpen); }} type="button">Look</button>
      {activeColourOpen ? <div className="shape-colour-controls">
        <label>Fill <input aria-label="Shape fill colour" data-help-topic="shape-colour" disabled={!current.fillColor} onChange={(event) => commit({ ...current, fillColor: event.target.value }, "Fill colour changed")} type="color" value={current.fillColor ?? "#d9a441"} /></label>
        <button aria-pressed={Boolean(current.fillColor)} data-help-topic="shape-colour" onClick={() => commit({ ...current, fillColor: current.fillColor ? undefined : "#d9a441" }, "Shape fill changed")} type="button">{current.fillColor ? "No Fill" : "Add Fill"}</button>
        <label>Outline <input aria-label="Shape outline colour" data-help-topic="shape-colour" disabled={!current.outlineColor} onChange={(event) => commit({ ...current, outlineColor: event.target.value }, "Outline colour changed")} type="color" value={current.outlineColor ?? "#3f3528"} /></label>
        <button aria-pressed={Boolean(current.outlineColor)} data-help-topic="shape-colour" onClick={() => commit({ ...current, outlineColor: current.outlineColor ? undefined : "#3f3528" }, "Shape outline changed")} type="button">{current.outlineColor ? "No Outline" : "Add Outline"}</button>
        <label>Thickness <input aria-label="Shape outline thickness" data-help-topic="shape-colour" disabled={!current.outlineColor} max="12" min="1" onBlur={() => draftRef.current && commit(draftRef.current, "Outline thickness changed")} onChange={(event) => preview({ ...current, outlineWidth: Number(event.target.value) })} onKeyUp={() => draftRef.current && commit(draftRef.current, "Outline thickness changed")} onPointerUp={() => draftRef.current && commit(draftRef.current, "Outline thickness changed")} type="range" value={current.outlineWidth} /></label>
      </div> : null}
      <div className="shape-edit-grid"><button aria-label="Add a vertex" aria-pressed={addingVertex} data-help-topic="shape-add-vertex" disabled={current.shapeKind === "circle" || current.shapeKind === "rectangle"} onClick={() => setAddingVertex((adding) => !adding)} type="button">+</button><button aria-label="Delete selected vertex" data-help-topic="shape-delete-vertex" disabled={current.shapeKind === "circle" || current.shapeKind === "rectangle" || selectedVertex === undefined || vertices.length <= 3} onClick={removeVertex} type="button">−</button><button aria-label="Move shape up one layer" data-help-topic="shape-layer-up" disabled={!canMoveUp} onClick={onMoveUp} type="button"><ArrowUp aria-hidden="true" /></button><button aria-label="Move shape down one layer" data-help-topic="shape-layer-down" disabled={!canMoveDown} onClick={onMoveDown} type="button"><ArrowDown aria-hidden="true" /></button></div>
      <button aria-pressed={snapEnabled} data-help-topic="shape-snap" onClick={() => { retainedSnapEnabled = !retainedSnapEnabled; setSnapRevision((revision) => revision + 1); setAnnouncement(`Shape snapping ${retainedSnapEnabled ? "on" : "off"}`); }} type="button">Snap {snapEnabled ? "On" : "Off"}</button>
      <button data-help-topic="shape-duplicate" onClick={onDuplicate} type="button"><Copy aria-hidden="true" />Duplicate</button>
      <button className="shape-edit-delete" data-help-topic="shape-delete" onClick={() => setDeleteOpen(true)} type="button"><Trash2 aria-hidden="true" />Delete</button>
    </div>, document.body) : null;

  const controllers = selected && arrange && controllerTarget ? createPortal(
    <div aria-label={`${shape.shapeKind} shape editing points`} className="shape-controller-overlay shape-editor" style={{ ...shapeStyle(current, stackIndex), zIndex: 850 }}>
      {current.shapeKind === "circle" && activeMode === "scale" ? <button
        aria-label="Scale circle"
        className="shape-scale-handle"
        data-help-topic="shape-scale"
        onKeyDown={keyboardCircleScale}
        onLostPointerCapture={finishTransform}
        onPointerCancel={cancelTransform}
        onPointerDown={beginCircleScale}
        onPointerMove={updateTransform}
        onPointerUp={finishTransform}
        style={{ left: "96%", top: "50%" }}
        type="button"
      /> : null}
      {vertices.map((point, index) => <button
        aria-label={`Vertex ${index + 1}`}
        aria-pressed={selectedVertex === index}
        className={`shape-vertex-handle${selectedVertex === index ? " selected" : ""}`}
        data-help-topic="shape-vertex"
        key={index}
        onClick={(event) => { event.stopPropagation(); setSelectedVertex(index); setAnnouncement(`Vertex ${index + 1} selected`); }}
        onKeyDown={(event) => keyboardVertex(event, index)}
        onLostPointerCapture={finishVertex}
        onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedVertex(index); vertexRef.current = { pointerId: event.pointerId, index, start: current }; try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Continue while pointer events arrive. */ } }}
        onPointerMove={updateVertex}
        onPointerUp={finishVertex}
        style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
        type="button"
      />)}
      {addingVertex ? vertices.map((point, index) => {
        const next = vertices[(index + 1) % vertices.length]!;
        return <button aria-label={`Add vertex on edge ${index + 1}`} className="shape-edge-handle" data-help-topic="shape-edge" key={index} onClick={(event) => { event.stopPropagation(); insertVertex(index); }} style={{ left: `${(point.x + next.x) * 50}%`, top: `${(point.y + next.y) * 50}%` }} type="button">+</button>;
      }) : null}
    </div>, controllerTarget) : null;

  return <>
    {/* Pointer and keyboard transform behavior is implemented on this group. */}
    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
    <div
      aria-label={arrange ? `${shape.shapeKind} shape. ${activeMode} mode.` : undefined}
      className={`page-object shape-object shape-editor${current.layer === "behind-sketch" ? " behind-sketch" : ""}${arrange ? " arrangeable" : ""}${selected ? " selected-object" : ""}`}
      data-help-topic={arrange ? "shape-edit" : undefined}
      data-object-id={shape.id}
      onClick={arrange ? onSelect : undefined}
      onKeyDown={keyboardTransform}
      onLostPointerCapture={finishTransform}
      onPointerCancel={cancelTransform}
      onPointerDown={beginTransform}
      onPointerMove={updateTransform}
      onPointerUp={finishTransform}
      ref={objectRef}
      role={arrange ? "group" : undefined}
      style={shapeStyle(current, stackIndex)}
      tabIndex={arrange ? 0 : undefined}
    >
      <ShapeCard shape={current} />
    </div>
    {controllers}
    {palette}
    <span aria-live="polite" className="visually-hidden">{announcement}</span>
    {deleteOpen ? <ConfirmDialog cancelLabel="Keep it" confirmClassName="confirm-delete" confirmLabel="Delete" icon={<Trash2 aria-hidden="true" />} onCancel={() => setDeleteOpen(false)} onConfirm={() => { setDeleteOpen(false); onDelete(); }} title={`Delete ${shape.shapeKind} shape?`}><p>Do you want to delete this shape?</p></ConfirmDialog> : null}
  </>;
}
