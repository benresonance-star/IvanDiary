import { describe, expect, it } from "vitest";
import { freeformPath, simplifyFreeformStroke } from "./freeformGeometry";

describe("freeform geometry", () => {
  it("reduces a dense outline to a small editable anchor set", () => {
    const points = Array.from({ length: 80 }, (_, index) => {
      const angle = index / 80 * Math.PI * 2;
      return { x: .5 + Math.cos(angle) * .3, y: .5 + Math.sin(angle) * .3 };
    });
    const anchors = simplifyFreeformStroke(points, 1000, 800);
    expect(anchors.length).toBeGreaterThanOrEqual(6);
    expect(anchors.length).toBeLessThanOrEqual(12);
  });

  it("creates a closed smooth path through the editable anchors", () => {
    const path = freeformPath([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: .5, y: 1 }]);
    expect(path).toMatch(/^M /);
    expect(path).toContain(" C ");
    expect(path).toMatch(/ Z$/);
  });

  it("rejects a tiny accidental gesture", () => {
    expect(simplifyFreeformStroke([{ x: .5, y: .5 }, { x: .501, y: .501 }, { x: .502, y: .502 }], 1000, 800)).toEqual([]);
  });

  it("retains a distinctive corner without increasing the node limit", () => {
    const points = [
      ...Array.from({ length: 30 }, (_, index) => ({ x: .2 + index * .02, y: .2 })),
      { x: .82, y: .5 },
      ...Array.from({ length: 30 }, (_, index) => ({ x: .78 - index * .02, y: .8 })),
      { x: .18, y: .5 },
    ];
    const anchors = simplifyFreeformStroke(points, 1000, 800);
    expect(anchors.length).toBeLessThanOrEqual(12);
    expect(anchors.some(({ x, y }) => x > .8 && Math.abs(y - .5) < .02)).toBe(true);
  });
});
