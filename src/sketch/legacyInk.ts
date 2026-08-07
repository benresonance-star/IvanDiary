import type { LegacyInkDocument } from "../native/contracts";
import type { SketchDocument } from "./types";

export function toLegacyInkDocument(
  document: SketchDocument,
): LegacyInkDocument | undefined {
  const strokes = document.strokes
    .filter((stroke) => stroke.tool === "pen" && stroke.points.length > 0)
    .map((stroke) => ({
      color: stroke.color,
      width: stroke.width,
      points: stroke.points.map((point) => ({
        x: point.x,
        y: point.y,
        pressure: point.pressure,
        timestamp: point.timestamp,
      })),
    }));
  if (strokes.length === 0) {
    return undefined;
  }
  return {
    width: document.size.width,
    height: document.size.height,
    strokes,
  };
}
