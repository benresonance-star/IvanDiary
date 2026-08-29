import type { ShapeObject } from "../domain/models";
import type { NativeOverlayShape } from "../native/contracts";
import { shapeBoundaryVertices } from "../components/shapeGeometry";

export function nativeOverlayShapes(shapes: readonly ShapeObject[]): NativeOverlayShape[] {
  return shapes
    .filter((shape) => shape.layer !== "behind-sketch")
    .map((shape) => ({
      kind: shape.shapeKind === "circle" ? "circle" : shape.shapeKind === "freeform" ? "freeform" : "polygon",
      x: shape.position.x,
      y: shape.position.y,
      width: shape.frame?.width ?? .24,
      height: shape.frame?.height ?? .24,
      rotationDegrees: shape.rotationDegrees ?? 0,
      points: shapeBoundaryVertices(shape),
      fillColor: shape.fillColor,
      outlineColor: shape.outlineColor,
      outlineWidth: shape.outlineWidth,
    }));
}
