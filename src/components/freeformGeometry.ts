import type { Position } from "../domain/models";

const distance = (first: Position, second: Position, width: number, height: number) =>
  Math.hypot((second.x - first.x) * width, (second.y - first.y) * height);

function pointToSegmentDistance(point: Position, start: Position, end: Position, width: number, height: number) {
  const segmentX = (end.x - start.x) * width;
  const segmentY = (end.y - start.y) * height;
  const pointX = (point.x - start.x) * width;
  const pointY = (point.y - start.y) * height;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (pointX * segmentX + pointY * segmentY) / lengthSquared));
  return Math.hypot(pointX - segmentX * ratio, pointY - segmentY * ratio);
}

function simplifyOpenStroke(points: Position[], tolerance: number, width: number, height: number): Position[] {
  if (points.length <= 2) return points;
  let furthestIndex = 0;
  let furthestDistance = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const deviation = pointToSegmentDistance(points[index]!, points[0]!, points.at(-1)!, width, height);
    if (deviation > furthestDistance) {
      furthestDistance = deviation;
      furthestIndex = index;
    }
  }
  if (furthestDistance <= tolerance) return [points[0]!, points.at(-1)!];
  const left = simplifyOpenStroke(points.slice(0, furthestIndex + 1), tolerance, width, height);
  const right = simplifyOpenStroke(points.slice(furthestIndex), tolerance, width, height);
  return [...left.slice(0, -1), ...right];
}

function uniformlySample(points: Position[], count: number, width: number, height: number): Position[] {
  const closed = [...points, points[0]!];
  const segments = closed.slice(0, -1).map((point, index) => distance(point, closed[index + 1]!, width, height));
  const total = segments.reduce((sum, value) => sum + value, 0);
  const sampled: Position[] = [];
  let segmentIndex = 0;
  let travelled = 0;
  for (let sampleIndex = 0; sampleIndex < count; sampleIndex += 1) {
    const target = total * sampleIndex / count;
    while (segmentIndex < segments.length - 1 && travelled + segments[segmentIndex]! < target) travelled += segments[segmentIndex++]!;
    const start = closed[segmentIndex]!;
    const end = closed[segmentIndex + 1]!;
    const ratio = (target - travelled) / Math.max(segments[segmentIndex]!, 0.001);
    sampled.push({ x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio });
  }
  return sampled;
}

export function simplifyFreeformStroke(points: Position[], width: number, height: number): Position[] {
  const filtered: Position[] = [];
  for (const point of points) {
    const previous = filtered.at(-1);
    if (!previous || distance(previous, point, width, height) >= 3) filtered.push(point);
  }
  if (filtered.length < 3) return [];
  const perimeter = filtered.reduce((total, point, index) => total + distance(point, filtered[(index + 1) % filtered.length]!, width, height), 0);
  if (perimeter < 48) return [];
  const centre = filtered.reduce((total, point) => ({ x: total.x + point.x / filtered.length, y: total.y + point.y / filtered.length }), { x: 0, y: 0 });
  const seam = filtered.reduce((furthest, point, index) =>
    distance(point, centre, width, height) > distance(filtered[furthest]!, centre, width, height) ? index : furthest, 0);
  const rotated = [...filtered.slice(seam), ...filtered.slice(0, seam)];
  const closed = [...rotated, rotated[0]!];
  let tolerance = 1.5;
  let anchors = simplifyOpenStroke(closed, tolerance, width, height).slice(0, -1);
  while (anchors.length > 12 && tolerance < 64) {
    tolerance *= 1.3;
    anchors = simplifyOpenStroke(closed, tolerance, width, height).slice(0, -1);
  }
  return anchors.length >= 6 ? anchors : uniformlySample(filtered, 6, width, height);
}

export function freeformPath(points: Position[]): string {
  if (points.length < 3) return "";
  const format = (value: number) => Number((value * 100).toFixed(3));
  const bounded = (value: number) => Math.min(1, Math.max(0, value));
  const commands = [`M ${format(points[0]!.x)} ${format(points[0]!.y)}`];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]!;
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const after = points[(index + 2) % points.length]!;
    const firstControl = { x: current.x + (next.x - previous.x) / 6, y: current.y + (next.y - previous.y) / 6 };
    const secondControl = { x: next.x - (after.x - current.x) / 6, y: next.y - (after.y - current.y) / 6 };
    commands.push(`C ${format(bounded(firstControl.x))} ${format(bounded(firstControl.y))} ${format(bounded(secondControl.x))} ${format(bounded(secondControl.y))} ${format(next.x)} ${format(next.y)}`);
  }
  return `${commands.join(" ")} Z`;
}
