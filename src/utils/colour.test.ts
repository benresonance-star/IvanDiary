import { describe, expect, it } from "vitest";

import {
  colourWithOpacity,
  hexToHsl,
  hslToHex,
  isHexColor,
} from "./colour";

describe("colour utils", () => {
  it("round-trips common hex colours through HSL", () => {
    const original = "#245b8a";
    const hsl = hexToHsl(original);
    expect(hslToHex(hsl.h, hsl.s, hsl.l).toLowerCase()).toBe(original);
  });

  it("builds rgba paint from hex and opacity", () => {
    expect(isHexColor("#171410")).toBe(true);
    expect(colourWithOpacity("#171410", 0.5)).toBe("rgba(23, 20, 16, 0.5)");
  });
});
