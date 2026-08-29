import type { Page, PaperStyle } from "./models";
import { isHexColor } from "../utils/colour";

const DEFAULT_PAPER_COLOURS: Record<PaperStyle, string> = {
  "warm-journal": "#f6f0e3",
  "sketch-paper": "#f5efdf",
  "clean-paper": "#fffdf8",
  "warm-grey": "#ded7c9",
  "dark-paper": "#403c37",
};

export function defaultPaperBackgroundColour(style: PaperStyle): string {
  return DEFAULT_PAPER_COLOURS[style];
}

export function validPaperBackgroundColour(value: unknown): string | undefined {
  return typeof value === "string" && isHexColor(value) ? value.toLowerCase() : undefined;
}

export function effectivePaperBackgroundColour(page: Pick<Page, "paperStyle" | "backgroundColor">): string {
  return validPaperBackgroundColour(page.backgroundColor) ?? defaultPaperBackgroundColour(page.paperStyle);
}
