import type { ShapeObject } from "../domain/models";
import { freeformPath } from "./freeformGeometry";
import { renderedShapeVertices, shapeVertices } from "./shapeGeometry";

export function ShapeCard({ shape }: {
  shape: ShapeObject;
  /** Retained temporarily for source compatibility while shape editing lives in ShapeEditor. */
  arrange?: boolean;
  onUpdate?: (shape: ShapeObject) => void;
  selected?: boolean;
}) {
  const vertices = renderedShapeVertices(shape.shapeKind, shapeVertices(shape));
  const common = {
    fill: shape.fillColor ?? "none",
    pointerEvents: "visibleFill" as const,
    stroke: shape.outlineColor ?? "none",
    strokeWidth: shape.outlineColor ? shape.outlineWidth : 0,
    vectorEffect: "non-scaling-stroke" as const,
  };
  return <svg aria-label={`${shape.shapeKind} shape`} className="canvas-shape" preserveAspectRatio="none" role="img" viewBox="0 0 100 100">
    {shape.shapeKind === "circle"
      ? <ellipse {...common} cx="50" cy="50" rx="46" ry="46" />
      : shape.shapeKind === "freeform"
        ? <path {...common} d={freeformPath(vertices)} fillRule="evenodd" />
      : <polygon {...common} points={vertices.map(({ x, y }) => `${x * 100},${y * 100}`).join(" ")} />}
  </svg>;
}
