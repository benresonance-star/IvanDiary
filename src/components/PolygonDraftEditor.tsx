import { useEffect, useRef, type PointerEvent, type RefObject } from "react";

import type { Position } from "../domain/models";

export function PolygonDraftEditor({ color, onCancel, onChange, onFinish, pageRef, points }: {
  color: string;
  onCancel: () => void;
  onChange: (points: Position[]) => void;
  onFinish: () => void;
  pageRef: RefObject<HTMLDivElement | null>;
  points: Position[];
}) {
  const pointsRef = useRef(points);
  useEffect(() => { pointsRef.current = points; }, [points]);
  const activeRef = useRef<number | null>(null);
  const move = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    const bounds = pageRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    const next = pointsRef.current.map((point, pointIndex) => pointIndex === index ? {
      x: Math.min(.96, Math.max(.04, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(.96, Math.max(.04, (event.clientY - bounds.top) / bounds.height)),
    } : point);
    pointsRef.current = next; onChange(next);
  };
  const finishMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (activeRef.current === null) return;
    activeRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* Capture may already be released. */ }
  };
  const pointString = points.map(({ x, y }) => `${x * 100},${y * 100}`).join(" ");
  return <>
    <div className="polygon-draft-layer" aria-label="Polygon being created">
      <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100">
        {points.length >= 3 ? <polygon fill={color} fillOpacity="0.42" points={pointString} /> : null}
        <polyline fill="none" points={pointString} />
      </svg>
      {points.map(({ x, y }, index) => <button aria-label={`Move polygon point ${index + 1}`} className="polygon-point-handle" key={index}
        onLostPointerCapture={finishMove} onPointerCancel={finishMove}
        onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); activeRef.current = index; try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Continue while pointer events arrive. */ } }}
        onPointerMove={(event) => { if (activeRef.current === index) move(event, index); }} onPointerUp={finishMove}
        style={{ left: `${x * 100}%`, top: `${y * 100}%` }} type="button" />)}
    </div>
    <div className="polygon-draft-actions"><strong>{points.length} points</strong><button disabled={points.length < 3} onClick={(event) => { event.stopPropagation(); onFinish(); }} type="button">Finish polygon</button><button onClick={(event) => { event.stopPropagation(); onCancel(); }} type="button">Cancel</button></div>
  </>;
}
