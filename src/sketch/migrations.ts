import type { SketchDocument, SketchStroke } from "./types";

export const DEFAULT_PEN_COLOR = "#171410";
export const DEFAULT_PEN_WIDTH = 4.2;

export function safeStrokeColor(stroke: SketchStroke): string {
  return typeof stroke.color === "string" &&
    /^#[0-9a-f]{6}$/i.test(stroke.color)
    ? stroke.color
    : DEFAULT_PEN_COLOR;
}

export function safeStrokeWidth(stroke: SketchStroke): number {
  return typeof stroke.width === "number" && Number.isFinite(stroke.width)
    ? Math.min(14, Math.max(1, stroke.width))
    : DEFAULT_PEN_WIDTH;
}

export function migrateSketchDocument(document: SketchDocument): {
  changed: boolean;
  document: SketchDocument;
} {
  let changed = false;
  const strokes = document.strokes.map((stroke) => {
    const color = safeStrokeColor(stroke);
    const width = safeStrokeWidth(stroke);
    if (color === stroke.color && width === stroke.width) {
      return stroke;
    }
    changed = true;
    return { ...stroke, color, width };
  });

  return {
    changed,
    document: changed ? { ...document, strokes } : document,
  };
}
