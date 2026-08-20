import type { ShapeObject } from "../domain/models";

/**
 * PencilKit is hosted above the WebView while it is accepting input. It can
 * therefore preserve the canvas stack only when every shape belongs behind
 * the sketch layer. Above-sketch shapes use the web drawing surface so their
 * visual order stays the same in Draw, Edit, and View modes.
 */
export function nativeDrawingPreservesShapeStack(
  shapes: readonly ShapeObject[],
): boolean {
  return shapes.every((shape) => shape.layer === "behind-sketch");
}
