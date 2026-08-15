import {
  DEFAULT_GRID_COLOR,
  GRID_ROTATION_MAX,
  GRID_ROTATION_STEP,
  type DrawingGridSettings,
} from "../domain/models";
import { colourWithOpacity } from "../utils/colour";
import type { PencilSample } from "./types";

export const DEFAULT_DRAWING_GRID: DrawingGridSettings = {
  enabled: false,
  snapToGrid: true,
  spacing: 60,
  rotationDegrees: 0,
  type: "lines",
  color: DEFAULT_GRID_COLOR,
};

export function clampGridRotation(degrees: number): number {
  const snapped = Math.round(degrees / GRID_ROTATION_STEP) * GRID_ROTATION_STEP;
  return Math.min(GRID_ROTATION_MAX, Math.max(-GRID_ROTATION_MAX, snapped));
}

export function snapSampleToGrid(
  sample: PencilSample,
  start: PencilSample,
  grid: DrawingGridSettings,
  axis?: "horizontal" | "vertical",
  center: { x: number; y: number } = { x: 0, y: 0 },
): PencilSample {
  if (!grid.enabled || !grid.snapToGrid) return sample;
  const angle = (grid.rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const local = (point: PencilSample) => ({
    x: (point.x - center.x) * cos + (point.y - center.y) * sin,
    y: -(point.x - center.x) * sin + (point.y - center.y) * cos,
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
    x: snappedX * cos - snappedY * sin + center.x,
    y: snappedX * sin + snappedY * cos + center.y,
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
  const offsets = gridLineOffsets(diagonal, grid.spacing);
  context.save();
  context.translate(width / 2, height / 2);
  context.rotate((grid.rotationDegrees * Math.PI) / 180);
  context.beginPath();
  if (grid.type === "dots") {
    const radius = Math.max(2.2, Math.min(3.5, grid.spacing / 20));
    for (const x of offsets) {
      for (const y of offsets) {
        context.moveTo(x + radius, y);
        context.arc(x, y, radius, 0, Math.PI * 2);
      }
    }
    context.fillStyle = colourWithOpacity(grid.color, 0.48);
    context.fill();
  } else {
    for (const offset of offsets) {
      context.moveTo(-diagonal, offset);
      context.lineTo(diagonal, offset);
      context.moveTo(offset, -diagonal);
      context.lineTo(offset, diagonal);
    }
    context.strokeStyle = colourWithOpacity(grid.color, 0.34);
    context.lineWidth = 1.5;
    context.stroke();
  }
  context.restore();
}
