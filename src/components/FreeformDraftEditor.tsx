import { useRef, useState, type PointerEvent, type RefObject } from "react";

import type { Position } from "../domain/models";
import { freeformPath, simplifyFreeformStroke } from "./freeformGeometry";

export function FreeformDraftEditor({ color, onCancel, onFinish, onInvalid, pageRef }: {
  color: string;
  onCancel: () => void;
  onFinish: (anchors: Position[]) => void;
  onInvalid: () => void;
  pageRef: RefObject<HTMLDivElement | null>;
}) {
  const [points, setPoints] = useState<Position[]>([]);
  const pointsRef = useRef<Position[]>([]);
  const pointerRef = useRef<number | undefined>(undefined);

  const canvasPoint = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = pageRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return undefined;
    return {
      x: Math.min(.96, Math.max(.04, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(.96, Math.max(.04, (event.clientY - bounds.top) / bounds.height)),
    };
  };
  const addPoint = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== event.pointerId) return;
    const point = canvasPoint(event);
    if (!point) return;
    const previous = pointsRef.current.at(-1);
    if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < .002) return;
    pointsRef.current = [...pointsRef.current, point];
    setPoints(pointsRef.current);
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== event.pointerId) return;
    addPoint(event);
    pointerRef.current = undefined;
    const bounds = pageRef.current?.getBoundingClientRect();
    const anchors = bounds ? simplifyFreeformStroke(pointsRef.current, bounds.width, bounds.height) : [];
    if (anchors.length >= 3) onFinish(anchors);
    else { pointsRef.current = []; setPoints([]); onInvalid(); }
  };

  return <>
    {/* This full-canvas surface captures one continuous outline gesture. */}
    {/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
    <div
      aria-label="Draw a freeform shape outline. Press Enter for a starter shape."
      className="freeform-draft-layer"
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); onCancel(); }
        else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onFinish(Array.from({ length: 8 }, (_, index) => {
            const angle = index / 8 * Math.PI * 2;
            return { x: .5 + Math.cos(angle) * .18, y: .5 + Math.sin(angle) * .18 };
          }));
        }
      }}
      onPointerCancel={() => { pointerRef.current = undefined; pointsRef.current = []; setPoints([]); onInvalid(); }}
      onPointerDown={(event) => {
        if (event.button !== 0 || pointerRef.current !== undefined) return;
        event.preventDefault();
        event.stopPropagation();
        pointsRef.current = [];
        setPoints([]);
        pointerRef.current = event.pointerId;
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Continue while pointer events arrive. */ }
        addPoint(event);
      }}
      onPointerMove={addPoint}
      onPointerUp={finish}
      role="application"
      tabIndex={0}
    >
      <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100">
        {points.length >= 3 ? <path d={freeformPath(points)} fill={color} fillOpacity=".42" stroke={color} strokeWidth=".5" /> : null}
      </svg>
    </div>
    {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
    <div className="polygon-draft-actions freeform-draft-actions"><strong>Draw one outline, then release</strong><button onClick={onCancel} type="button">Cancel</button></div>
  </>;
}
