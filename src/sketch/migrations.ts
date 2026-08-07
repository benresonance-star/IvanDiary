import { clampOpacity } from "../utils/colour";

import type { SketchDocument, SketchStroke } from "./types";

export const DEFAULT_PEN_COLOR = "#171410";
export const DEFAULT_PEN_WIDTH = 4.2;
export const DEFAULT_PEN_OPACITY = 1;

export function safeStrokeColor(stroke: SketchStroke): string {
  return typeof stroke.color === "string" &&
    /^#[0-9a-f]{6}$/i.test(stroke.color)
    ? stroke.color
    : DEFAULT_PEN_COLOR;
}

export function safeStrokeWidth(stroke: SketchStroke): number {
  return typeof stroke.width === "number" && Number.isFinite(stroke.width)
    ? Math.min(28, Math.max(1, stroke.width))
    : DEFAULT_PEN_WIDTH;
}

export function safeStrokeOpacity(stroke: SketchStroke): number {
  return typeof stroke.opacity === "number" && Number.isFinite(stroke.opacity)
    ? clampOpacity(stroke.opacity)
    : DEFAULT_PEN_OPACITY;
}

export function migrateSketchDocument(document: SketchDocument): {
  changed: boolean;
  document: SketchDocument;
} {
  let changed = false;
  const strokes = document.strokes.map((stroke) => {
    const color = safeStrokeColor(stroke);
    const width = safeStrokeWidth(stroke);
    const opacity = safeStrokeOpacity(stroke);
    if (
      color === stroke.color &&
      width === stroke.width &&
      opacity === (stroke.opacity ?? DEFAULT_PEN_OPACITY)
    ) {
      return stroke;
    }
    changed = true;
    return { ...stroke, color, width, opacity };
  });

  return {
    changed,
    document: changed ? { ...document, strokes } : document,
  };
}
