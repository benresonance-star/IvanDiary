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
});
