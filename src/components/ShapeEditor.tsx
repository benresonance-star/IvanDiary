import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, GripHorizontal, Layers3, Magnet, Minus, Move, Palette, Plus, RotateCcw, RotateCw, Scaling, Trash2 } from "lucide-react";
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

type TransformMode = "move" | "rotate" | "scale";
type ShapeMode = TransformMode | "sort";
type DragState = {
  pointerId: number;
  mode: TransformMode;
  start: ShapeObject;
  startX: number;
  startY: number;
  centreX: number;
  centreY: number;
  startDistance: number;
  startAngle: number;
  scaleAxis?: "horizontal" | "vertical";
};
type PalettePosition = { left: number; top: number };
type PaletteDragState = {
  frame?: number;
  latest: PalettePosition;
  maxLeft: number;
  maxTop: number;
  minLeft: number;
  minTop: number;
  offsetX: number;
  offsetY: number;
  origin: PalettePosition;
  pointerId: number;
};

let retainedPalettePosition: PalettePosition | undefined;
let retainedSnapEnabled = true;
let retainedShapeMode: ShapeMode = "move";
type InspectorSection = "adjust" | "style";
let retainedInspectorSection: InspectorSection = "adjust";
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
  const [modeState, setModeState] = useState<{ value: ShapeMode }>({ value: retainedShapeMode });
  const [draft, setDraft] = useState<ShapeObject>();
  const [inspectorSection, setInspectorSection] = useState<InspectorSection>(retainedInspectorSection);
  const [addingVertex, setAddingVertex] = useState(false);
  const [selectedVertex, setSelectedVertex] = useState<number>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [controllerTarget, setControllerTarget] = useState<Element | null>(null);
  const [palettePosition, setPalettePosition] = useState<CSSProperties>(retainedPalettePosition ?? { left: 12, top: 12 });
  const [announcement, setAnnouncement] = useState("");
  const [, setPaletteRevision] = useState(0);
  const draftRef = useRef<ShapeObject | undefined>(undefined);
  const pendingRevisionRef = useRef<number | undefined>(undefined);
  const dragRef = useRef<DragState | undefined>(undefined);
  const vertexRef = useRef<{ pointerId: number; index: number; start: ShapeObject } | undefined>(undefined);
  const objectRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const paletteDragRef = useRef<PaletteDragState | undefined>(undefined);
  const positionPaletteRef = useRef<() => void>(() => undefined);
  const current = draft ?? shape;
  const activePalettePlaced = Boolean(retainedPalettePosition);
  const activePalettePosition = retainedPalettePosition ?? palettePosition;
  const frame = current.frame ?? { width: 0.24, height: 0.24 };
  const vertices = current.shapeKind === "circle" ? [] : current.shapeKind === "rectangle" ? shapeVertices(current) : shapeBoundaryVertices(current);
  const snapEnabled = retainedSnapEnabled;
  const activeMode = selected ? retainedShapeMode : modeState.value;
  const activeInspectorSection = selected ? retainedInspectorSection : inspectorSection;
  const activeStyleOpen = activeInspectorSection === "style";

  const toggleInspectorSection = (section: InspectorSection) => {
    retainedInspectorSection = section;
    setInspectorSection(retainedInspectorSection);
    setPaletteRevision((revision) => revision + 1);
  };

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
    if (
      pendingRevision === undefined ||
      shape.revision < pendingRevision ||
      dragRef.current ||
      vertexRef.current
    ) return;
    pendingRevisionRef.current = undefined;
    draftRef.current = undefined;
    setDraft(undefined);
  }, [shape]);

  useEffect(() => {
    setControllerTarget(pageRef.current?.isConnected ? pageRef.current : typeof document !== "undefined" ? document.body : null);
  }, [pageRef]);

  useLayoutEffect(() => {
    positionPaletteRef.current = () => {
      const palette = paletteRef.current?.getBoundingClientRect();
      if (!palette) return;
      const viewport = globalThis.visualViewport;
      const margin = 12;
      if (retainedPalettePosition) {
        const viewportLeft = (viewport?.offsetLeft ?? 0) + margin;
        const viewportTop = (viewport?.offsetTop ?? 0) + margin;
        const viewportRight = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? globalThis.innerWidth) - margin;
        const viewportBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? globalThis.innerHeight) - margin;
        const clamped = {
          left: Math.max(viewportLeft, Math.min(retainedPalettePosition.left, viewportRight - palette.width)),
          top: Math.max(viewportTop, Math.min(retainedPalettePosition.top, viewportBottom - palette.height)),
        };
        retainedPalettePosition = clamped;
        setPalettePosition((previous) => Number(previous.left) === clamped.left && Number(previous.top) === clamped.top ? previous : clamped);
        return;
      }
      const object = objectRef.current?.getBoundingClientRect();
      const page = pageRef.current?.getBoundingClientRect();
      if (!object || !page) return;
      const leftBound = Math.max(page.left, viewport?.offsetLeft ?? 0) + margin;
      const topBound = Math.max(page.top, viewport?.offsetTop ?? 0) + margin;
      const rightBound = Math.min(page.right, (viewport?.offsetLeft ?? 0) + (viewport?.width ?? globalThis.innerWidth)) - margin;
      const bottomBound = Math.min(page.bottom, (viewport?.offsetTop ?? 0) + (viewport?.height ?? globalThis.innerHeight)) - margin;
      const candidates = [
        { left: object.right + margin, top: object.top },
        { left: object.left - palette.width - margin, top: object.top },
        { left: object.left, top: object.bottom + margin },
        { left: object.left, top: object.top - palette.height - margin },
      ];
      const fitting = candidates.find((candidate) => candidate.left >= leftBound && candidate.left + palette.width <= rightBound && candidate.top >= topBound && candidate.top + palette.height <= bottomBound);
      const preferred = fitting ?? candidates[object.left + object.width / 2 < (leftBound + rightBound) / 2 ? 0 : 1]!;
      const next = {
        left: Math.max(leftBound, Math.min(preferred.left, rightBound - palette.width)),
        top: Math.max(topBound, Math.min(preferred.top, bottomBound - palette.height)),
      };
      setPalettePosition((previous) => Number(previous.left) === next.left && Number(previous.top) === next.top ? previous : next);
    };
  });

  useLayoutEffect(() => {
    if (!selected || !arrange) return;
    positionPaletteRef.current();
  }, [activeInspectorSection, activePalettePlaced, arrange, current.frame, current.position, current.rotationDegrees, pageRef, selected]);

  useEffect(() => {
    if (!selected || !arrange) return;
    const position = () => positionPaletteRef.current();
    globalThis.addEventListener("resize", position);
    globalThis.addEventListener("scroll", position, true);
    globalThis.visualViewport?.addEventListener("resize", position);
    globalThis.visualViewport?.addEventListener("scroll", position);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(position);
    if (paletteRef.current) observer?.observe(paletteRef.current);
    return () => {
      globalThis.removeEventListener("resize", position);
      globalThis.removeEventListener("scroll", position, true);
      globalThis.visualViewport?.removeEventListener("resize", position);
      globalThis.visualViewport?.removeEventListener("scroll", position);
      observer?.disconnect();
    };
  }, [arrange, selected]);

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
    const viewport = globalThis.visualViewport;
    const margin = 12;
    const origin = { left: palette.left, top: palette.top };
    paletteDragRef.current = {
      latest: origin,
      maxLeft: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? globalThis.innerWidth) - palette.width - margin,
      maxTop: (viewport?.offsetTop ?? 0) + (viewport?.height ?? globalThis.innerHeight) - palette.height - margin,
      minLeft: (viewport?.offsetLeft ?? 0) + margin,
      minTop: (viewport?.offsetTop ?? 0) + margin,
      offsetX: event.clientX - palette.left,
      offsetY: event.clientY - palette.top,
      origin,
      pointerId: event.pointerId,
    };
    paletteRef.current?.classList.add("dragging");
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Continue while pointer events arrive. */ }
  };

  const updatePaletteMove = (event: PointerEvent<HTMLButtonElement>) => {
    const active = paletteDragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    active.latest = {
      left: Math.max(active.minLeft, Math.min(event.clientX - active.offsetX, active.maxLeft)),
      top: Math.max(active.minTop, Math.min(event.clientY - active.offsetY, active.maxTop)),
    };
    if (active.frame !== undefined) return;
    active.frame = requestAnimationFrame(() => {
      active.frame = undefined;
      const palette = paletteRef.current;
      if (!palette || paletteDragRef.current !== active) return;
      palette.style.transform = `translate3d(${active.latest.left - active.origin.left}px, ${active.latest.top - active.origin.top}px, 0)`;
    });
  };

  const finishPaletteMove = (event: PointerEvent<HTMLButtonElement>) => {
    const active = paletteDragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.frame !== undefined) cancelAnimationFrame(active.frame);
    paletteDragRef.current = undefined;
    if (paletteRef.current) {
      paletteRef.current.style.transform = "";
      paletteRef.current.classList.remove("dragging");
    }
    retainedPalettePosition = active.latest;
    setPalettePosition(active.latest);
  };

  const cancelPaletteMove = (event: PointerEvent<HTMLButtonElement>) => {
    const active = paletteDragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.frame !== undefined) cancelAnimationFrame(active.frame);
    paletteDragRef.current = undefined;
    if (paletteRef.current) {
      paletteRef.current.style.transform = "";
      paletteRef.current.classList.remove("dragging");
    }
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
      pointerId: event.pointerId, mode: "move", start: current, startX: event.clientX, startY: event.clientY,
      centreX, centreY, startDistance: Math.max(1, distance(event.clientX, event.clientY, centreX, centreY)),
      startAngle: angle(event.clientX, event.clientY, centreX, centreY),
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Continue while pointer events arrive. */ }
  };

  const beginCircleScale = (
    event: PointerEvent<HTMLButtonElement>,
    scaleAxis: "horizontal" | "vertical",
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = pageRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const centreX = bounds.left + (current.position.x + frame.width / 2) * bounds.width;
    const centreY = bounds.top + (current.position.y + frame.height / 2) * bounds.height;
    dragRef.current = {
      pointerId: event.pointerId,
      mode: "scale",
      start: current,
      startX: event.clientX,
      startY: event.clientY,
      centreX,
      centreY,
      startDistance: Math.max(1, distance(event.clientX, event.clientY, centreX, centreY)),
      startAngle: angle(event.clientX, event.clientY, centreX, centreY),
      scaleAxis,
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Continue while pointer events arrive. */ }
  };
  const beginCircleWidthScale = (event: PointerEvent<HTMLButtonElement>) => {
    beginCircleScale(event, "horizontal");
  };
  const beginCircleHeightScale = (event: PointerEvent<HTMLButtonElement>) => {
    beginCircleScale(event, "vertical");
  };

  const updateTransform = (event: PointerEvent<HTMLElement>) => {
    if (vertexRef.current || (event.target instanceof Element && event.target.closest(".shape-vertex-handle:not(.shape-scale-handle), .shape-edge-handle"))) return;
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
      if (active.scaleAxis) {
        const radians = (active.start.rotationDegrees ?? 0) * Math.PI / 180;
        const deltaX = event.clientX - active.centreX;
        const deltaY = event.clientY - active.centreY;
        const localDistance = Math.abs(active.scaleAxis === "horizontal"
          ? deltaX * Math.cos(radians) + deltaY * Math.sin(radians)
          : -deltaX * Math.sin(radians) + deltaY * Math.cos(radians));
        const requested = 2 * localDistance / (active.scaleAxis === "horizontal" ? bounds.width : bounds.height);
        const limit = active.scaleAxis === "horizontal"
          ? PAGE_LAYOUT_BOUNDS.right - PAGE_LAYOUT_BOUNDS.left
          : PAGE_LAYOUT_BOUNDS.bottom - PAGE_LAYOUT_BOUNDS.top;
        const nextFrame = active.scaleAxis === "horizontal"
          ? { ...startFrame, width: Math.max(.08, Math.min(limit, requested)) }
          : { ...startFrame, height: Math.max(.08, Math.min(limit, requested)) };
        preview({ ...active.start, frame: nextFrame, position: clampPosition({ x: centre.x - nextFrame.width / 2, y: centre.y - nextFrame.height / 2 }, nextFrame) });
        return;
      }
      const rawFactor = distance(event.clientX, event.clientY, active.centreX, active.centreY) / active.startDistance;
      const minimumFactor = Math.max(0.08 / startFrame.width, 0.08 / startFrame.height);
      const maximumFactor = Math.min((PAGE_LAYOUT_BOUNDS.right - PAGE_LAYOUT_BOUNDS.left) / startFrame.width, (PAGE_LAYOUT_BOUNDS.bottom - PAGE_LAYOUT_BOUNDS.top) / startFrame.height);
      const factor = Math.max(minimumFactor, Math.min(maximumFactor, rawFactor));
      const nextFrame = { width: startFrame.width * factor, height: startFrame.height * factor };
      preview({ ...active.start, frame: nextFrame, position: clampPosition({ x: centre.x - nextFrame.width / 2, y: centre.y - nextFrame.height / 2 }, nextFrame) });
    }
  };

  const finishTransform = (event: PointerEvent<HTMLElement>) => {
    if (vertexRef.current || (event.target instanceof Element && event.target.closest(".shape-vertex-handle:not(.shape-scale-handle), .shape-edge-handle"))) return;
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
    const delta = { x: event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0, y: event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0 };
    commit({ ...current, position: clampPosition({ x: current.position.x + delta.x, y: current.position.y + delta.y }, frame) }, "Shape moved");
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

  const adjustShape = (direction: "up" | "down" | "left" | "right") => {
    if (activeMode === "move") {
      const amount = 0.015;
      const delta = {
        x: direction === "left" ? -amount : direction === "right" ? amount : 0,
        y: direction === "up" ? -amount : direction === "down" ? amount : 0,
      };
      commit({ ...current, position: clampPosition({ x: current.position.x + delta.x, y: current.position.y + delta.y }, frame) }, "Shape moved");
      return;
    }
    if (activeMode === "rotate") {
      const anticlockwise = direction === "left" || direction === "down";
      commit({ ...current, rotationDegrees: normalizedRotation((current.rotationDegrees ?? 0) + (anticlockwise ? -5 : 5)) }, `Shape rotated ${anticlockwise ? "anticlockwise" : "clockwise"}`);
      return;
    }
    if (activeMode === "sort") return;
    const grow = direction === "up" || direction === "right";
    const factor = grow ? 1.05 : 0.95;
    const centre = { x: current.position.x + frame.width / 2, y: current.position.y + frame.height / 2 };
    const minimumFactor = Math.max(0.08 / frame.width, 0.08 / frame.height);
    const maximumFactor = Math.min((PAGE_LAYOUT_BOUNDS.right - PAGE_LAYOUT_BOUNDS.left) / frame.width, (PAGE_LAYOUT_BOUNDS.bottom - PAGE_LAYOUT_BOUNDS.top) / frame.height);
    const boundedFactor = Math.max(minimumFactor, Math.min(maximumFactor, factor));
    const nextFrame = { width: frame.width * boundedFactor, height: frame.height * boundedFactor };
    commit({ ...current, frame: nextFrame, position: clampPosition({ x: centre.x - nextFrame.width / 2, y: centre.y - nextFrame.height / 2 }, nextFrame) }, `Shape made ${grow ? "larger" : "smaller"}`);
  };

  const activeModeLabel = activeMode[0]!.toUpperCase() + activeMode.slice(1);

  const palette = selected && arrange && typeof document !== "undefined" ? createPortal(
    <div aria-label="Shape editing commands" className="shape-edit-palette" ref={paletteRef} role="toolbar" style={activePalettePosition}>
      <header className="shape-inspector-heading">
        <button
          aria-label="Move shape editing palette"
          className="shape-palette-heading-drag"
          data-help-topic="shape-palette-move"
          onKeyDown={keyboardPaletteMove}
          onLostPointerCapture={finishPaletteMove}
          onPointerCancel={cancelPaletteMove}
          onPointerDown={beginPaletteMove}
          onPointerMove={updatePaletteMove}
          onPointerUp={finishPaletteMove}
          type="button"
        >
          <span>{current.shapeKind.replace("freeform", "Freeform")}</span>
          <GripHorizontal aria-hidden="true" />
        </button>
      </header>
      <div aria-label="Shape editing section" className="shape-inspector-tabs" role="group">
        <button aria-pressed={!activeStyleOpen} data-help-topic="shape-adjust" onClick={() => toggleInspectorSection("adjust")} type="button"><Move aria-hidden="true" />Adjust</button>
        <button aria-pressed={activeStyleOpen} data-help-topic="shape-colour" onClick={() => toggleInspectorSection("style")} type="button"><Palette aria-hidden="true" />Style</button>
      </div>
      {!activeStyleOpen ? <>
        <div className="shape-adjust-workspace">
          <div aria-label="Shape adjustment mode" className="shape-edit-mode-group" role="group">{(["move", "rotate", "scale", "sort"] as const).map((value) => {
            const Icon = value === "move" ? Move : value === "rotate" ? RotateCw : value === "scale" ? Scaling : Layers3;
            return <button aria-pressed={activeMode === value} data-help-topic={`shape-${value}`} key={value} onClick={() => { retainedShapeMode = value; setModeState({ value }); }} type="button"><Icon aria-hidden="true" /><span>{value[0]!.toUpperCase() + value.slice(1)}</span></button>;
          })}</div>
          <div aria-label={`${activeModeLabel} controls`} className={`shape-adjustment-panel shape-adjustment-${activeMode}`} role="group">
            {activeMode === "move" ? <>
              <div aria-label="Move shape precisely" className="shape-nudge-grid" role="group">
                <button aria-label="Move shape up" onClick={() => adjustShape("up")} type="button"><ArrowUp aria-hidden="true" /></button>
                <button aria-label="Move shape left" onClick={() => adjustShape("left")} type="button"><ArrowLeft aria-hidden="true" /></button>
                <span aria-hidden="true" className="shape-nudge-centre" />
                <button aria-label="Move shape right" onClick={() => adjustShape("right")} type="button"><ArrowRight aria-hidden="true" /></button>
                <button aria-label="Move shape down" onClick={() => adjustShape("down")} type="button"><ArrowDown aria-hidden="true" /></button>
              </div>
              <button aria-pressed={snapEnabled} className="shape-snap-toggle" data-help-topic="shape-snap" onClick={() => { retainedSnapEnabled = !retainedSnapEnabled; setPaletteRevision((revision) => revision + 1); setAnnouncement(`Shape snapping ${retainedSnapEnabled ? "on" : "off"}`); }} type="button"><Magnet aria-hidden="true" />Snap {snapEnabled ? "On" : "Off"}</button>
            </> : activeMode === "rotate" ? <div className="shape-adjustment-actions">
              <button aria-label="Rotate shape anticlockwise" onClick={() => adjustShape("left")} type="button"><RotateCcw aria-hidden="true" /><span>Left</span></button>
              <button aria-label="Rotate shape clockwise" onClick={() => adjustShape("right")} type="button"><RotateCw aria-hidden="true" /><span>Right</span></button>
            </div> : activeMode === "scale" ? <div className="shape-adjustment-actions">
              <button aria-label="Make shape larger" onClick={() => adjustShape("right")} type="button"><Plus aria-hidden="true" /><span>Larger</span></button>
              <button aria-label="Make shape smaller" onClick={() => adjustShape("left")} type="button"><Minus aria-hidden="true" /><span>Smaller</span></button>
            </div> : <div className="shape-sort-actions">
              <button aria-label="Move shape up one layer" data-help-topic="shape-layer-up" disabled={!canMoveUp} onClick={onMoveUp} type="button"><ArrowUp aria-hidden="true" /><span>Forward</span></button>
              <button aria-label="Move shape down one layer" data-help-topic="shape-layer-down" disabled={!canMoveDown} onClick={onMoveDown} type="button"><ArrowDown aria-hidden="true" /><span>Backward</span></button>
            </div>}
          </div>
        </div>
        {current.shapeKind !== "circle" && current.shapeKind !== "rectangle" ? <div className="shape-context-section"><strong>Points</strong><div className="shape-point-actions"><button aria-label="Add a vertex" aria-pressed={addingVertex} data-help-topic="shape-add-vertex" onClick={() => setAddingVertex((adding) => !adding)} type="button"><Plus aria-hidden="true" />Add</button><button aria-label="Delete selected vertex" data-help-topic="shape-delete-vertex" disabled={selectedVertex === undefined || vertices.length <= 3} onClick={removeVertex} type="button"><Minus aria-hidden="true" />Remove</button></div></div> : null}
      </> : <div className="shape-colour-controls">
        <div className="shape-colour-row">
          <label>Fill <input aria-label="Shape fill colour" data-help-topic="shape-colour" disabled={!current.fillColor} onChange={(event) => commit({ ...current, fillColor: event.target.value }, "Fill colour changed")} type="color" value={current.fillColor ?? "#d9a441"} /></label>
          <button aria-pressed={Boolean(current.fillColor)} data-help-topic="shape-colour" onClick={() => commit({ ...current, fillColor: current.fillColor ? undefined : "#d9a441" }, "Shape fill changed")} type="button">{current.fillColor ? "No Fill" : "Add Fill"}</button>
        </div>
        <div className="shape-colour-row">
          <label>Outline <input aria-label="Shape outline colour" data-help-topic="shape-colour" disabled={!current.outlineColor} onChange={(event) => commit({ ...current, outlineColor: event.target.value }, "Outline colour changed")} type="color" value={current.outlineColor ?? "#3f3528"} /></label>
          <button aria-pressed={Boolean(current.outlineColor)} data-help-topic="shape-colour" onClick={() => commit({ ...current, outlineColor: current.outlineColor ? undefined : "#3f3528" }, "Shape outline changed")} type="button">{current.outlineColor ? "No Outline" : "Add Outline"}</button>
        </div>
        <label className="shape-thickness-control">Thickness <output>{current.outlineWidth}</output><input aria-label="Shape outline thickness" data-help-topic="shape-colour" disabled={!current.outlineColor} max="12" min="1" onBlur={() => draftRef.current && commit(draftRef.current, "Outline thickness changed")} onChange={(event) => preview({ ...current, outlineWidth: Number(event.target.value) })} onKeyUp={() => draftRef.current && commit(draftRef.current, "Outline thickness changed")} onPointerUp={() => draftRef.current && commit(draftRef.current, "Outline thickness changed")} type="range" value={current.outlineWidth} /></label>
      </div>}
      <div className="shape-inspector-footer"><button className="shape-edit-delete" data-help-topic="shape-delete" onClick={() => setDeleteOpen(true)} type="button"><Trash2 aria-hidden="true" />Delete</button><button data-help-topic="shape-duplicate" onClick={() => { retainedShapeMode = "move"; setModeState({ value: "move" }); onDuplicate(); }} type="button"><Copy aria-hidden="true" />Make a copy</button></div>
    </div>, document.body) : null;

  const controllers = selected && arrange && controllerTarget ? createPortal(
    <div aria-label={`${shape.shapeKind} shape editing points`} className="shape-controller-overlay shape-editor" style={{ ...shapeStyle(current, stackIndex), zIndex: 850 }}>
      {current.shapeKind === "circle" && activeMode === "scale" ? [
        { axis: "horizontal" as const, label: "width", left: "100%", top: "50%" },
        { axis: "vertical" as const, label: "height", left: "50%", top: "100%" },
      ].map((handle) => <button
        aria-label={`Change circle ${handle.label}`}
        className={`shape-vertex-handle shape-scale-handle shape-scale-${handle.axis}`}
        key={handle.label}
        onLostPointerCapture={finishTransform}
        onPointerDown={handle.axis === "horizontal"
          ? beginCircleWidthScale
          : beginCircleHeightScale}
        onPointerMove={updateTransform}
        onPointerUp={finishTransform}
        style={{ left: handle.left, top: handle.top }}
        type="button"
      />) : null}
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
      aria-label={arrange ? `${shape.shapeKind} shape. Drag or use arrow keys to move.` : undefined}
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
