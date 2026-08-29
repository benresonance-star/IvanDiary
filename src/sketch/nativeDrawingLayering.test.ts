import { describe, expect, it } from "vitest";

import type { ShapeObject } from "../domain/models";
import { nativeOverlayShapes } from "./nativeDrawingLayering";

function shape(layer?: ShapeObject["layer"]): ShapeObject {
  return {
    id: "shape-one",
    pageId: "page-one",
    type: "shape",
    shapeKind: "circle",
    position: { x: 0.2, y: 0.2 },
    frame: { width: 0.2, height: 0.2 },
    layer,
    outlineWidth: 2,
    revision: 0,
    createdAt: "2026-08-20T00:00:00.000Z",
  };
}

describe("nativeOverlayShapes", () => {
  it("mirrors only above-sketch shapes into the native overlay", () => {
    const mirrored = nativeOverlayShapes([
      shape("behind-sketch"),
      { ...shape("above-sketch"), id: "shape-two" },
    ]);
    expect(mirrored).toHaveLength(1);
    expect(mirrored[0]).toMatchObject({ kind: "circle", fillColor: undefined });
  });
});
