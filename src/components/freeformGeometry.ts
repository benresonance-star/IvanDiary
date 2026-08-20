import type { Position } from "../domain/models";

const distance = (first: Position, second: Position, width: number, height: number) =>
  Math.hypot((second.x - first.x) * width, (second.y - first.y) * height);

export function simplifyFreeformStroke(points: Position[], width: number, height: number): Position[] {
  const filtered: Position[] = [];
  for (const point of points) {
    const previous = filtered.at(-1);
    if (!previous || distance(previous, point, width, height) >= 3) filtered.push(point);
  }
  if (filtered.length < 3) return [];
  const perimeter = filtered.reduce((total, point, index) => total + distance(point, filtered[(index + 1) % filtered.length]!, width, height), 0);
  if (perimeter < 48) return [];
  const count = Math.max(6, Math.min(12, Math.round(perimeter / 64)));
  const closed = [...filtered, filtered[0]!];
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
    const segment = Math.max(segments[segmentIndex]!, 0.001);
    const ratio = (target - travelled) / segment;
    sampled.push({ x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio });
  }
  return sampled.map((point, index) => {
    const previous = sampled[(index - 1 + sampled.length) % sampled.length]!;
    const next = sampled[(index + 1) % sampled.length]!;
    return { x: previous.x * .18 + point.x * .64 + next.x * .18, y: previous.y * .18 + point.y * .64 + next.y * .18 };
  });
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
