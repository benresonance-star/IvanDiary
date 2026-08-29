import { colourWithOpacity } from "../utils/colour";

import { strokeWidth, visibleDotWidth } from "./geometry";
import {
  safeStrokeColor,
  safeStrokeNib,
  safeStrokeOpacity,
  safeStrokeWidth,
} from "./migrations";
import type { SketchDocument, SketchStroke } from "./types";

function strokePaint(stroke: SketchStroke): string {
  return colourWithOpacity(safeStrokeColor(stroke), safeStrokeOpacity(stroke));
}

function drawDot(
  context: CanvasRenderingContext2D,
  stroke: SketchStroke,
): void {
  const point = stroke.points[0];
  if (!point) {
    return;
  }

  const nib = safeStrokeNib(stroke);
  const width = visibleDotWidth(safeStrokeWidth(stroke), point.pressure);
  context.beginPath();
  context.fillStyle = strokePaint(stroke);
  if (nib === "brush") {
    context.save();
    context.globalAlpha = 0.55;
    context.shadowColor = strokePaint(stroke);
    context.shadowBlur = width * 0.45;
    context.arc(point.x, point.y, width * 0.68, 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  } else {
    context.arc(point.x, point.y, width / 2, 0, Math.PI * 2);
  }
  context.fill();
}

function drawBrushStroke(
  context: CanvasRenderingContext2D,
  stroke: SketchStroke,
): void {
  const baseWidth = safeStrokeWidth(stroke);
  context.save();
  context.strokeStyle = strokePaint(stroke);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalCompositeOperation = "multiply";
  context.shadowColor = strokePaint(stroke);
  context.shadowBlur = Math.max(2, baseWidth * 0.35);

  for (let index = 1; index < stroke.points.length; index += 1) {
    const previous = stroke.points[index - 1];
    const current = stroke.points[index];
    if (!previous || !current) continue;
    const pressure = Math.min(1, Math.max(0, (previous.pressure + current.pressure) / 2));
    const paintedWidth = baseWidth * (0.7 + pressure * 0.75);

    for (const layer of [
      { width: paintedWidth * 1.18, alpha: 0.18 },
      { width: paintedWidth, alpha: 0.32 },
      { width: paintedWidth * 0.7, alpha: 0.2 },
    ]) {
      context.globalAlpha = layer.alpha;
      context.lineWidth = layer.width;
      context.beginPath();
      context.moveTo(previous.x, previous.y);
      context.lineTo(current.x, current.y);
      context.stroke();
    }
  }
  context.restore();
}

export function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: SketchStroke,
): void {
  if (stroke.points.length === 0) {
    return;
  }

  if (stroke.points.length === 1) {
    drawDot(context, stroke);
    return;
  }

  const nib = safeStrokeNib(stroke);
  if (nib === "brush") {
    drawBrushStroke(context, stroke);
    return;
  }
  context.save();
  context.strokeStyle = strokePaint(stroke);
  context.lineCap = nib === "marker" ? "square" : "round";
  context.lineJoin = "round";
  context.globalCompositeOperation = nib === "marker" ? "multiply" : "source-over";

  for (let index = 1; index < stroke.points.length; index += 1) {
    const previous = stroke.points[index - 1];
    const current = stroke.points[index];
    if (!previous || !current) {
      continue;
    }

    const nibWidth = nib === "marker" ? 1.55 : nib === "pencil" ? 0.72 : 1;
    context.lineWidth = nibWidth * strokeWidth(
      safeStrokeWidth(stroke),
      (previous.pressure + current.pressure) / 2,
    );
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(current.x, current.y);
    context.stroke();
  }
  context.restore();
}

export function renderDocument(
  context: CanvasRenderingContext2D,
  document: SketchDocument,
): void {
  context.clearRect(0, 0, document.size.width, document.size.height);

  for (const stroke of document.strokes) {
    drawStroke(context, stroke);
  }
}
