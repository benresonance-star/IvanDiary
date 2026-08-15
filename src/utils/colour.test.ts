import { describe, expect, it } from "vitest";

import {
  colourWithOpacity,
  colourContrastRatio,
  hexToHsl,
  hslToHex,
  isHexColor,
  readableTextColour,
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

  it("keeps readable text colours and corrects low contrast choices", () => {
    expect(readableTextColour("#171410", "#fffaf0")).toBe("#171410");
    expect(readableTextColour("#fffaf0", "#fffaf0")).toBe("#000000");
    expect(readableTextColour("#171410", "#171410")).toBe("#ffffff");
    expect(colourContrastRatio("#000000", "#ffffff")).toBe(21);
  });
});
