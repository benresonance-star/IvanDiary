import { describe, expect, it } from "vitest";

import {
  adjustCanvasTextScale,
  CANVAS_TEXT_SCALE_MAX,
  CANVAS_TEXT_SCALE_MIN,
} from "./canvasTextScale";

describe("canvas text scale", () => {
  it("adjusts text in quarter-size steps", () => {
    expect(adjustCanvasTextScale(1, 1)).toBe(1.25);
    expect(adjustCanvasTextScale(1, -1)).toBe(0.75);
  });

  it("clamps text at the supported limits", () => {
    expect(adjustCanvasTextScale(CANVAS_TEXT_SCALE_MAX, 1)).toBe(
      CANVAS_TEXT_SCALE_MAX,
    );
    expect(adjustCanvasTextScale(CANVAS_TEXT_SCALE_MIN, -1)).toBe(
      CANVAS_TEXT_SCALE_MIN,
    );
  });
});
