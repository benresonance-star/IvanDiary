import type { DrawingGridSettings } from "../domain/models";
import type { PencilSample } from "./types";

export const DEFAULT_DRAWING_GRID: DrawingGridSettings = {
  enabled: false,
  spacing: 60,
  rotationDegrees: 0,
};

export function snapSampleToGrid(
  sample: PencilSample,
  start: PencilSample,
  grid: DrawingGridSettings,
  axis?: "horizontal" | "vertical",
): PencilSample {
  if (!grid.enabled) return sample;
  const angle = (grid.rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const local = (point: PencilSample) => ({
    x: point.x * cos + point.y * sin,
    y: -point.x * sin + point.y * cos,
  });
  const origin = local(start);
  const point = local(sample);
  const horizontal = axis
    ? axis === "horizontal"
    : Math.abs(point.x - origin.x) >= Math.abs(point.y - origin.y);
  const snappedX = horizontal
    ? point.x
    : Math.round(origin.x / grid.spacing) * grid.spacing;
  const snappedY = horizontal
    ? Math.round(origin.y / grid.spacing) * grid.spacing
    : point.y;
  return {
    ...sample,
    x: snappedX * cos - snappedY * sin,
    y: snappedX * sin + snappedY * cos,
  };
}

export function gridAxisForSample(
  sample: PencilSample,
  start: PencilSample,
  rotationDegrees: number,
): "horizontal" | "vertical" {
  const angle = (rotationDegrees * Math.PI) / 180;
  const dx = sample.x - start.x;
  const dy = sample.y - start.y;
  const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
  const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
  return Math.abs(localX) >= Math.abs(localY) ? "horizontal" : "vertical";
}

/** Grid guide lines and snapping must share zero as their lattice origin. */
export function gridLineOffsets(extent: number, spacing: number): number[] {
  if (!Number.isFinite(extent) || !Number.isFinite(spacing) || spacing <= 0) {
    return [];
  }
  const first = Math.floor(-extent / spacing) * spacing;
  const offsets: number[] = [];
  for (let offset = first; offset <= extent; offset += spacing) {
    offsets.push(offset);
  }
  return offsets;
}

export function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  grid: DrawingGridSettings,
): void {
  if (!grid.enabled) return;
  const diagonal = Math.hypot(width, height);
  context.save();
  context.rotate((grid.rotationDegrees * Math.PI) / 180);
  context.beginPath();
  for (const offset of gridLineOffsets(diagonal, grid.spacing)) {
    context.moveTo(-diagonal, offset);
    context.lineTo(diagonal, offset);
    context.moveTo(offset, -diagonal);
    context.lineTo(offset, diagonal);
  }
  context.strokeStyle = "rgba(67, 91, 112, 0.28)";
  context.lineWidth = 1.5;
  context.stroke();
  context.restore();
}
