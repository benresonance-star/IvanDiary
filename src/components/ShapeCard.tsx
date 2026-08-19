import { Palette } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";

import type { ShapeObject } from "../domain/models";

export function shapeVertices(shape: ShapeObject) {
  if (shape.points?.length) return shape.points;
  if (shape.shapeKind === "triangle") return [{ x: .5, y: .05 }, { x: .95, y: .95 }, { x: .05, y: .95 }];
  if (shape.shapeKind === "rectangle") return [{ x: .05, y: .05 }, { x: .95, y: .05 }, { x: .95, y: .95 }, { x: .05, y: .95 }];
  if (shape.shapeKind === "cross") {
    return [{ x: .35, y: .05 }, { x: .65, y: .05 }, { x: .65, y: .35 }, { x: .85, y: .35 }, { x: .85, y: .65 }, { x: .65, y: .65 }, { x: .65, y: .95 }, { x: .35, y: .95 }, { x: .35, y: .65 }, { x: .15, y: .65 }, { x: .15, y: .35 }, { x: .35, y: .35 }];
  }
  return [];
}

export function ShapeCard({ arrange, onUpdate, selected, shape }: {
  arrange: boolean;
  onUpdate: (shape: ShapeObject) => void;
  selected: boolean;
  shape: ShapeObject;
}) {
  const [editingAppearance, setEditingAppearance] = useState(false);
  const [outlineWidth, setOutlineWidth] = useState(shape.outlineWidth);
  const [vertices, setVertices] = useState(() => shapeVertices(shape));
  const verticesRef = useRef(vertices);
  const appearanceButtonRef = useRef<HTMLButtonElement>(null);
  const activeVertexRef = useRef<number | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<CSSProperties>({ left: 12, top: 12 });
  useEffect(() => setOutlineWidth(shape.outlineWidth), [shape.outlineWidth]);
  useEffect(() => { const next = shapeVertices(shape); verticesRef.current = next; setVertices(next); }, [shape.points, shape.shapeKind]);
  const saveOutlineWidth = () => {
    if (outlineWidth !== shape.outlineWidth) onUpdate({ ...shape, outlineWidth, revision: shape.revision + 1 });
  };
  const fill = shape.fillColor ?? "none";
  const stroke = shape.outlineColor ?? "none";
  const common = { fill, stroke, strokeWidth: outlineWidth, vectorEffect: "non-scaling-stroke" as const };
  const moveVertex = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    const bounds = event.currentTarget.closest<HTMLElement>("[data-object-id]")?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    const next = verticesRef.current.map((point, pointIndex) => pointIndex === index ? {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    } : point);
    verticesRef.current = next; setVertices(next);
  };
  const finishVertex = (event: PointerEvent<HTMLButtonElement>) => {
    if (activeVertexRef.current === null) return;
    activeVertexRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* Capture may already be released. */ }
    onUpdate({ ...shape, points: verticesRef.current, revision: shape.revision + 1 });
  };
  const positionAppearancePopover = useCallback(() => {
    const button = appearanceButtonRef.current;
    const object = button?.closest<HTMLElement>("[data-object-id]");
    const paper = button?.closest<HTMLElement>(".paper-page");
    if (!button || !object || !paper) return;

    const objectBounds = object.getBoundingClientRect();
    const paperBounds = paper.getBoundingClientRect();
    const viewport = globalThis.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportRight = viewportLeft + (viewport?.width ?? globalThis.innerWidth);
    const viewportBottom = viewportTop + (viewport?.height ?? globalThis.innerHeight);
    const margin = 12;
    const width = 264;
    const height = 306;
    const visibleLeft = Math.max(paperBounds.left, viewportLeft) + margin;
    const visibleRight = Math.min(paperBounds.right, viewportRight) - margin;
    const visibleTop = Math.max(paperBounds.top, viewportTop) + margin;
    const visibleBottom = Math.min(paperBounds.bottom, viewportBottom) - margin;
    const paperCentre = (visibleLeft + visibleRight) / 2;
    const objectCentre = objectBounds.left + objectBounds.width / 2;
    const preferredLeft = objectCentre <= paperCentre ? visibleRight - width : visibleLeft;
    const left = Math.max(visibleLeft, Math.min(preferredLeft, visibleRight - width));
    const top = Math.max(visibleTop, Math.min(objectBounds.top, visibleBottom - height));
    setPopoverPosition({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (editingAppearance && arrange && selected) positionAppearancePopover();
  }, [arrange, editingAppearance, positionAppearancePopover, selected]);
  useEffect(() => {
    if (!editingAppearance || !arrange || !selected) return;
    const update = () => positionAppearancePopover();
    globalThis.addEventListener("resize", update);
    globalThis.addEventListener("scroll", update, true);
    globalThis.visualViewport?.addEventListener("resize", update);
    globalThis.visualViewport?.addEventListener("scroll", update);
    return () => {
      globalThis.removeEventListener("resize", update);
      globalThis.removeEventListener("scroll", update, true);
      globalThis.visualViewport?.removeEventListener("resize", update);
      globalThis.visualViewport?.removeEventListener("scroll", update);
    };
  }, [arrange, editingAppearance, positionAppearancePopover, selected]);
  useEffect(() => {
    if (!arrange || !selected) setEditingAppearance(false);
  }, [arrange, selected]);

  return <>
    <svg aria-label={`${shape.shapeKind} shape`} className="canvas-shape" role="img" viewBox="0 0 100 100">
      {shape.shapeKind === "circle" ? <ellipse {...common} cx="50" cy="50" rx="46" ry="46" />
        : <polygon {...common} points={vertices.map(({ x, y }) => `${x * 100},${y * 100}`).join(" ")} />}
    </svg>
    {arrange && selected && shape.shapeKind !== "circle" && shape.shapeKind !== "cross" ? vertices.map(({ x, y }, index) => <button
      aria-label={`Move vertex ${index + 1}`} className="shape-vertex-handle" key={index}
      onLostPointerCapture={finishVertex} onPointerCancel={finishVertex} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); activeVertexRef.current = index; try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Continue while pointer events arrive. */ } }}
      onPointerMove={(event) => { if (activeVertexRef.current === index) moveVertex(event, index); }}
      onPointerUp={finishVertex} style={{ left: `${x * 100}%`, top: `${y * 100}%` }} type="button" />) : null}
    {arrange && selected ? <button aria-label="Change shape fill and outline" aria-pressed={editingAppearance} className="shape-appearance-button" data-help-topic="arrange-shape-appearance" onClick={(event) => { event.stopPropagation(); setEditingAppearance((value) => !value); }} ref={appearanceButtonRef} type="button"><Palette aria-hidden="true" /></button> : null}
    {arrange && selected && editingAppearance && typeof document !== "undefined" ? createPortal(<div aria-label="Shape fill and outline" className="shape-appearance-popover" onClick={(event) => event.stopPropagation()} role="dialog" style={popoverPosition}>
      <label><span>Fill</span><input aria-label="Shape fill colour" disabled={!shape.fillColor} onChange={(event) => onUpdate({ ...shape, fillColor: event.target.value, revision: shape.revision + 1 })} type="color" value={shape.fillColor ?? "#d9a441"} /></label>
      <button aria-pressed={Boolean(shape.fillColor)} disabled={Boolean(shape.fillColor && !shape.outlineColor)} onClick={() => onUpdate({ ...shape, fillColor: shape.fillColor ? undefined : "#d9a441", revision: shape.revision + 1 })} type="button">{shape.fillColor ? "Remove fill" : "Add fill"}</button>
      <label><span>Outline</span><input aria-label="Shape outline colour" disabled={!shape.outlineColor} onChange={(event) => onUpdate({ ...shape, outlineColor: event.target.value, revision: shape.revision + 1 })} type="color" value={shape.outlineColor ?? "#3f3528"} /></label>
      <button aria-pressed={Boolean(shape.outlineColor)} disabled={Boolean(shape.outlineColor && !shape.fillColor)} onClick={() => onUpdate({ ...shape, outlineColor: shape.outlineColor ? undefined : "#3f3528", revision: shape.revision + 1 })} type="button">{shape.outlineColor ? "Remove outline" : "Add outline"}</button>
      <label><span>Outline thickness</span><input aria-label="Shape outline thickness" disabled={!shape.outlineColor} max="12" min="1" onBlur={saveOutlineWidth} onChange={(event) => setOutlineWidth(Number(event.target.value))} onKeyUp={saveOutlineWidth} onPointerCancel={saveOutlineWidth} onPointerUp={saveOutlineWidth} type="range" value={outlineWidth} /></label>
    </div>, document.body) : null}
  </>;
}
