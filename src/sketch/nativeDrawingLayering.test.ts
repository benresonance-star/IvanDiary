import { describe, expect, it } from "vitest";

import type { ShapeObject } from "../domain/models";
import { nativeDrawingPreservesShapeStack } from "./nativeDrawingLayering";

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

describe("nativeDrawingPreservesShapeStack", () => {
  it("allows native drawing when there are no shapes", () => {
    expect(nativeDrawingPreservesShapeStack([])).toBe(true);
  });

  it("allows native drawing when every shape is behind the sketch", () => {
    expect(
      nativeDrawingPreservesShapeStack([shape("behind-sketch")]),
    ).toBe(true);
  });

  it("uses web drawing for explicit and default above-sketch shapes", () => {
    expect(nativeDrawingPreservesShapeStack([shape("above-sketch")])).toBe(
      false,
    );
    expect(nativeDrawingPreservesShapeStack([shape()])).toBe(false);
  });
});
