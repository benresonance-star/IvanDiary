import type { PencilSample } from "./types";

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function strokeWidth(baseWidth: number, pressure: number): number {
  return baseWidth * (0.22 + clamp(pressure, 0, 1) * 0.78);
}

export function distance(
  first: Pick<PencilSample, "x" | "y">,
  second: Pick<PencilSample, "x" | "y">,
): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export function shouldAppendSample(
  previous: PencilSample | undefined,
  next: PencilSample,
  minimumDistance = 0.35,
  maximumIntervalMs = 20,
): boolean {
  if (!previous) {
    return true;
  }

  return (
    distance(previous, next) >= minimumDistance ||
    next.timestamp - previous.timestamp >= maximumIntervalMs
  );
}

export function distanceToSegment(
  point: Pick<PencilSample, "x" | "y">,
  start: Pick<PencilSample, "x" | "y">,
  end: Pick<PencilSample, "x" | "y">,
): number {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (lengthSquared === 0) {
    return distance(point, start);
  }

  const projection = clamp(
    ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) /
      lengthSquared,
    0,
    1,
  );
  const projected = {
    x: start.x + projection * segmentX,
    y: start.y + projection * segmentY,
  };

  return distance(point, projected);
}
