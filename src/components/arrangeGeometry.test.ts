import { describe, expect, it } from "vitest";

import {
  clampPosition,
  defaultPhotoFrame,
  MAXIMUM_FRAME,
  MAXIMUM_PHOTO_FRAME,
  moveLayout,
  pageAspectFromImage,
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
    ).toEqual({ x: 0.03, y: 0.76 });
  });

  it("shows and snaps to the vertical alignment guide", () => {
    const moved = moveLayout(START, { x: 0.16, y: 0 });
    expect(moved.guides.vertical).toBe(true);
    expect(moved.position.x + moved.frame.width / 2).toBeCloseTo(0.5);
  });

  it("centres blocks within equal canvas margins", () => {
    const moved = moveLayout(START, { x: 0, y: 0.1 });
    expect(moved.guides.horizontal).toBe(true);
    expect(moved.position.y + moved.frame.height / 2).toBeCloseTo(0.5);
  });

  it("enforces minimum and maximum frame dimensions", () => {
    expect(
      resizeLayout(START, { width: -1, height: -1 }).frame,
    ).toEqual({ width: 0.18, height: 0.12 });
    expect(
      resizeLayout(START, { width: 2, height: 2 }).frame,
    ).toEqual({ width: 0.6, height: 0.55 });
  });

  it("lets a 16:9 photograph cover the drawable canvas without cropping", () => {
    const frame = defaultPhotoFrame({ width: 1920, height: 1080 });
    expect(frame.width).toBeCloseTo(MAXIMUM_PHOTO_FRAME.height);
    expect(frame.height).toBeCloseTo(MAXIMUM_PHOTO_FRAME.height);
    expect(frame.width).toBeGreaterThan(MAXIMUM_FRAME.width);
    expect(frame.width / frame.height).toBeCloseTo(
      pageAspectFromImage({ width: 16, height: 9 }),
    );
  });

  it("keeps source proportions while scaling up to the photo limit", () => {
    const start: PageLayout = {
      position: { x: 0.1, y: 0.2 },
      frame: { width: 0.3, height: 0.3 },
    };
    const resized = resizeLayout(
      start,
      { width: 1, height: 0 },
      {
        aspectRatio: 1,
        maximum: MAXIMUM_PHOTO_FRAME,
      },
    );
    expect(resized.frame.width).toBeCloseTo(resized.frame.height);
    expect(resized.frame.width).toBeGreaterThan(MAXIMUM_FRAME.width);
    expect(resized.frame.width).toBeLessThanOrEqual(MAXIMUM_PHOTO_FRAME.width);
  });
});
