import { strokeWidth, visibleDotWidth } from "./geometry";
import { safeStrokeColor, safeStrokeWidth } from "./migrations";
import type { SketchDocument, SketchStroke } from "./types";

function drawDot(
  context: CanvasRenderingContext2D,
  stroke: SketchStroke,
): void {
  const point = stroke.points[0];
  if (!point) {
    return;
  }

  context.beginPath();
  context.fillStyle = safeStrokeColor(stroke);
  context.arc(
    point.x,
    point.y,
    visibleDotWidth(safeStrokeWidth(stroke), point.pressure) / 2,
    0,
    Math.PI * 2,
  );
  context.fill();
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

  context.strokeStyle = safeStrokeColor(stroke);
  context.lineCap = "round";
  context.lineJoin = "round";

  for (let index = 1; index < stroke.points.length; index += 1) {
    const previous = stroke.points[index - 1];
    const current = stroke.points[index];
    if (!previous || !current) {
      continue;
    }

    context.lineWidth = strokeWidth(
      safeStrokeWidth(stroke),
      (previous.pressure + current.pressure) / 2,
    );
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(current.x, current.y);
    context.stroke();
  }
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
