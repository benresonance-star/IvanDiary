import { describe, expect, it } from "vitest";

import {
  distanceToSegment,
  shouldAppendSample,
  strokeWidth,
} from "./geometry";
import type { PencilSample } from "./types";

function sample(
  x: number,
  y: number,
  timestamp: number,
  pressure = 0.5,
): PencilSample {
  return { x, y, timestamp, pressure };
}

describe("stroke geometry", () => {
  it("maps zero and full pressure to visible stroke widths", () => {
    expect(strokeWidth(10, 0)).toBeCloseTo(2.2);
    expect(strokeWidth(10, 1)).toBeCloseTo(10);
  });

  it("keeps stationary samples when enough time has elapsed", () => {
    const previous = sample(10, 10, 100);
    expect(shouldAppendSample(previous, sample(10.1, 10.1, 105))).toBe(false);
    expect(shouldAppendSample(previous, sample(10.1, 10.1, 125))).toBe(true);
  });

  it("measures a point against the nearest place on a segment", () => {
    expect(
      distanceToSegment(sample(5, 4, 0), sample(0, 0, 0), sample(10, 0, 0)),
    ).toBeCloseTo(4);
  });
});
