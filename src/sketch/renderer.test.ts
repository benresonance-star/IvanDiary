import { describe, expect, it, vi } from "vitest";

import { drawStroke, renderDocument } from "./renderer";
import type { SketchStroke } from "./types";

function context() {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function stroke(nib: SketchStroke["nib"], points = [
  { x: 10, y: 12, pressure: 0.4, timestamp: 1 },
  { x: 20, y: 24, pressure: 0.8, timestamp: 2 },
]): SketchStroke {
  return {
    id: `stroke-${nib ?? "pen"}`,
    tool: "pen",
    nib,
    points,
    color: "#244A60",
    width: 4,
    opacity: 0.7,
    createdAt: "2026-08-23T10:00:00.000Z",
  };
}

describe("sketch renderer", () => {
  it.each(["pen", "marker", "pencil", "brush"] as const)(
    "renders a pressure-aware %s stroke",
    (nib) => {
      const target = context();
      drawStroke(target, stroke(nib));
      expect(target.beginPath).toHaveBeenCalled();
      expect(target.stroke).toHaveBeenCalled();
      expect(target.save).toHaveBeenCalledOnce();
      expect(target.restore).toHaveBeenCalledOnce();
    },
  );

  it("renders single-point pen and brush dots", () => {
    for (const nib of ["pen", "brush"] as const) {
      const target = context();
      drawStroke(target, stroke(nib, [{ x: 4, y: 5, pressure: 1, timestamp: 1 }]));
      expect(target.arc).toHaveBeenCalledOnce();
      expect(target.fill).toHaveBeenCalledOnce();
    }
  });

  it("clears the document and ignores an empty stroke", () => {
    const target = context();
    renderDocument(target, {
      schemaVersion: 1,
      id: "render-document",
      size: { width: 1200, height: 820 },
      strokes: [stroke("pen", [])],
      revision: 0,
    });
    expect(target.clearRect).toHaveBeenCalledWith(0, 0, 1200, 820);
    expect(target.beginPath).not.toHaveBeenCalled();
  });
});
