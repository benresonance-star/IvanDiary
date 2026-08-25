export const CANVAS_TEXT_SCALE_MIN = 0.5;
export const CANVAS_TEXT_SCALE_MAX = 2.5;
export const CANVAS_TEXT_SCALE_STEP = 0.25;

export function clampCanvasTextScale(value: number): number {
  return Math.min(
    CANVAS_TEXT_SCALE_MAX,
    Math.max(CANVAS_TEXT_SCALE_MIN, value),
  );
}

export function adjustCanvasTextScale(
  current: number,
  direction: -1 | 1,
): number {
  return clampCanvasTextScale(current + direction * CANVAS_TEXT_SCALE_STEP);
}
