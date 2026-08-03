import { describe, expect, it } from "vitest";

import {
  clampPosition,
  moveLayout,
  resizeLayout,
  type PageLayout,
} from "./arrangeGeometry";

const START: PageLayout = {
  position: { x: 0.2, y: 0.3 },
  frame: { width: 0.28, height: 0.2 },
};

describe("arrange geometry", () => {
  it("keeps blocks inside the safe paper area", () => {
    expect(
      clampPosition({ x: -1, y: 2 }, { width: 0.3, height: 0.2 }),
    ).toEqual({ x: 0.03, y: 0.72 });
  });

  it("shows and snaps to the vertical alignment guide", () => {
    const moved = moveLayout(START, { x: 0.16, y: 0 });
    expect(moved.guides.vertical).toBe(true);
    expect(moved.position.x + moved.frame.width / 2).toBeCloseTo(0.5);
  });

  it("enforces minimum and maximum frame dimensions", () => {
    expect(
      resizeLayout(START, { width: -1, height: -1 }).frame,
    ).toEqual({ width: 0.18, height: 0.12 });
    expect(
      resizeLayout(START, { width: 2, height: 2 }).frame,
    ).toEqual({ width: 0.6, height: 0.55 });
  });
});
