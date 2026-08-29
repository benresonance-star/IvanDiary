export type InkStackItem = {
  id: string;
  type?: string;
  inFrontOfSketch?: boolean;
};

export type InkStackMove =
  | { kind: "promote" }
  | { kind: "demote" }
  | { kind: "reorder"; neighborId: string }
  | { kind: "noop" };

export function isInFrontOfSketch(
  object: { inFrontOfSketch?: boolean },
): boolean {
  return object.inFrontOfSketch === true;
}

export function withInFrontOfSketch<T extends { inFrontOfSketch?: boolean }>(
  object: T,
  inFront: boolean,
): T {
  if (inFront) {
    return { ...object, inFrontOfSketch: true };
  }
  if (!("inFrontOfSketch" in object)) {
    return object;
  }
  const { inFrontOfSketch: _removed, ...rest } = object;
  return rest as T;
}

function isRenderable(item: InkStackItem): boolean {
  return item.type !== "transcript";
}

export function resolveInkStackMove(
  items: readonly InkStackItem[],
  objectId: string,
  direction: -1 | 1,
): InkStackMove {
  const index = items.findIndex((item) => item.id === objectId);
  if (index < 0) {
    return { kind: "noop" };
  }
  const current = items[index];
  if (!current || !isRenderable(current)) {
    return { kind: "noop" };
  }
  const front = isInFrontOfSketch(current);
  const sameBand = (item: InkStackItem) =>
    isRenderable(item) && isInFrontOfSketch(item) === front;

  let neighbor = index + direction;
  while (neighbor >= 0 && neighbor < items.length) {
    const candidate = items[neighbor];
    if (candidate && sameBand(candidate)) {
      return { kind: "reorder", neighborId: candidate.id };
    }
    neighbor += direction;
  }
  if (direction === 1 && !front) {
    return { kind: "promote" };
  }
  if (direction === -1 && front) {
    return { kind: "demote" };
  }
  return { kind: "noop" };
}

export function canMoveInkStack(
  items: readonly InkStackItem[],
  objectId: string,
  direction: -1 | 1,
): boolean {
  return resolveInkStackMove(items, objectId, direction).kind !== "noop";
}
