import type { ShapeObject } from "../domain/models";

export function shapeVertices(shape: ShapeObject) {
  if (shape.shapeKind === "rectangle") {
    if (shape.points?.length === 2) return shape.points;
    if (shape.points?.length) {
      const xs = shape.points.map(({ x }) => x);
      const ys = shape.points.map(({ y }) => y);
      return [{ x: Math.min(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.max(...ys) }];
    }
    return [{ x: .05, y: .05 }, { x: .95, y: .95 }];
  }
  if (shape.points?.length) return shape.points;
  if (shape.shapeKind === "triangle") return [{ x: .5, y: .05 }, { x: .95, y: .95 }, { x: .05, y: .95 }];
  if (shape.shapeKind === "cross") {
    return [{ x: .35, y: .05 }, { x: .65, y: .05 }, { x: .65, y: .35 }, { x: .85, y: .35 }, { x: .85, y: .65 }, { x: .65, y: .65 }, { x: .65, y: .95 }, { x: .35, y: .95 }, { x: .35, y: .65 }, { x: .15, y: .65 }, { x: .15, y: .35 }, { x: .35, y: .35 }];
  }
  return [];
}

export function renderedShapeVertices(shapeKind: ShapeObject["shapeKind"], vertices: Array<{ x: number; y: number }>) {
  if (shapeKind !== "rectangle" || vertices.length !== 2) return vertices;
  const [first, second] = vertices;
  if (!first || !second) return vertices;
  return [first, { x: second.x, y: first.y }, second, { x: first.x, y: second.y }];
}

export function shapeBoundaryVertices(shape: ShapeObject) {
  return renderedShapeVertices(shape.shapeKind, shapeVertices(shape));
}
