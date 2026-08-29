export const UNDER_INK_OBJECT_Z_INDEX = 1;
export const OVER_INK_OBJECT_Z_INDEX = 45;

export function canvasObjectZIndex(
  stackIndex: number,
  inFrontOfSketch = false,
): number {
  return (inFrontOfSketch ? OVER_INK_OBJECT_Z_INDEX : UNDER_INK_OBJECT_Z_INDEX)
    + stackIndex;
}
