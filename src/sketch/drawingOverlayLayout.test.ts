import { describe, expect, it } from "vitest";

import { measureDrawingOverlayLayout } from "./drawingOverlayLayout";

function fakeElement(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): HTMLElement {
  return {
    getBoundingClientRect: () => ({
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => rect,
    }),
  } as HTMLElement;
}

describe("measureDrawingOverlayLayout", () => {
  it("insets the drawable area below overlapping tools", () => {
    const paper = fakeElement({
      left: 40,
      top: 100,
      width: 800,
      height: 1000,
    });
    const tools = fakeElement({
      left: 100,
      top: 80,
      width: 600,
      height: 70,
    });

    const layout = measureDrawingOverlayLayout(paper, tools);
    expect(layout.contentInsetTop).toBe(58);
    expect(layout.overlayRect).toEqual({
      x: 40,
      y: 158,
      width: 800,
      height: 942,
    });
  });

  it("uses the full paper when tools do not overlap", () => {
    const paper = fakeElement({
      left: 0,
      top: 200,
      width: 500,
      height: 700,
    });
    const tools = fakeElement({
      left: 0,
      top: 0,
      width: 500,
      height: 40,
    });

    const layout = measureDrawingOverlayLayout(paper, tools);
    expect(layout.contentInsetTop).toBe(0);
    expect(layout.overlayRect.height).toBe(700);
  });
});
