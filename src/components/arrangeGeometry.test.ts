import { describe, expect, it } from "vitest";

import {
  clampPosition,
  defaultPhotoFrame,
  inwardResizeAnchor,
  layoutEdges,
  MAXIMUM_FRAME,
  MAXIMUM_PHOTO_FRAME,
  MAXIMUM_SHAPE_FRAME,
  MINIMUM_SHAPE_FRAME,
  moveLayout,
  pageAspectFromImage,
  resizeLayout,
  resizeLayoutFromAnchor,
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

  it("snaps unlocked image width and height to nearby peer dimensions", () => {
    const resized = resizeLayout(
      START,
      { width: 0.115, height: 0.095 },
      {
        snapPeerFrames: [{ width: 0.4, height: 0.3 }],
      },
    );
    expect(resized.frame).toEqual({ width: 0.4, height: 0.3 });
  });

  it("preserves image proportions when snapping to a peer width", () => {
    const resized = resizeLayout(
      START,
      { width: 0.115, height: 0 },
      {
        aspectRatio: 2,
        maximum: MAXIMUM_PHOTO_FRAME,
        snapPeerFrames: [{ width: 0.4, height: 0.4 }],
      },
    );
    expect(resized.frame.width).toBeCloseTo(0.4);
    expect(resized.frame.height).toBeCloseTo(0.2);
  });

  it("does not snap image dimensions outside the alignment threshold", () => {
    const resized = resizeLayout(
      START,
      { width: 0.09, height: 0.06 },
      {
        snapPeerFrames: [{ width: 0.4, height: 0.3 }],
      },
    );
    expect(resized.frame).toEqual({ width: 0.37, height: 0.26 });
  });

  it("detects proximity to each safe canvas edge", () => {
    expect(layoutEdges({
      position: { x: 0.03, y: 0.04 },
      frame: { width: 0.3, height: 0.2 },
    })).toEqual({ top: true, right: false, bottom: false, left: true });
    expect(layoutEdges({
      position: { x: 0.67, y: 0.76 },
      frame: { width: 0.3, height: 0.2 },
    })).toEqual({ top: false, right: true, bottom: true, left: false });
    expect(layoutEdges({
      position: { x: 0.67, y: 0.04 },
      frame: { width: 0.3, height: 0.2 },
    })).toEqual({ top: true, right: true, bottom: false, left: false });
    expect(layoutEdges({
      position: { x: 0.03, y: 0.76 },
      frame: { width: 0.3, height: 0.2 },
    })).toEqual({ top: false, right: false, bottom: true, left: true });
  });

  it("chooses inward resize anchors at the right and bottom edges", () => {
    expect(inwardResizeAnchor({
      position: { x: 0.67, y: 0.76 },
      frame: { width: 0.3, height: 0.2 },
    })).toEqual({ horizontal: "left", vertical: "top" });
    expect(inwardResizeAnchor({
      position: { x: 0.03, y: 0.04 },
      frame: { width: 0.3, height: 0.2 },
    })).toEqual({ horizontal: "right", vertical: "bottom" });
  });

  it("expands left and upward while preserving right and bottom edges", () => {
    const start = {
      position: { x: 0.67, y: 0.76 },
      frame: { width: 0.3, height: 0.2 },
    };
    const resized = resizeLayoutFromAnchor(
      start,
      { width: -0.1, height: -0.1 },
      { horizontal: "left", vertical: "top" },
    );
    expect(resized.position.x).toBeCloseTo(0.57);
    expect(resized.position.y).toBeCloseTo(0.66);
    expect(resized.frame.width).toBeCloseTo(0.4);
    expect(resized.frame.height).toBeCloseTo(0.3);
    expect(resized.position.x + resized.frame.width).toBeCloseTo(0.97);
    expect(resized.position.y + resized.frame.height).toBeCloseTo(0.96);
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

  it("allows shapes to use the full editable size range", () => {
    const start: PageLayout = {
      position: { x: 0.03, y: 0.04 },
      frame: { width: 0.24, height: 0.24 },
    };
    expect(resizeLayout(start, { width: -1, height: -1 }, {
      maximum: MAXIMUM_SHAPE_FRAME,
      minimum: MINIMUM_SHAPE_FRAME,
    }).frame).toEqual(MINIMUM_SHAPE_FRAME);
    expect(resizeLayout(start, { width: 2, height: 2 }, {
      maximum: MAXIMUM_SHAPE_FRAME,
      minimum: MINIMUM_SHAPE_FRAME,
    }).frame).toEqual(MAXIMUM_SHAPE_FRAME);
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
