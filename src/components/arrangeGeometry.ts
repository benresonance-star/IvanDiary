import type { PageObject, Position, Size } from "../domain/models";

export const PAGE_LAYOUT_BOUNDS = {
  left: 0.03,
  right: 0.97,
  top: 0.16,
  bottom: 0.92,
} as const;

export const MINIMUM_FRAME = { width: 0.18, height: 0.12 } as const;
export const MAXIMUM_FRAME = { width: 0.6, height: 0.55 } as const;

export type AlignmentGuides = {
  horizontal: boolean;
  vertical: boolean;
};

export type PageLayout = {
  position: Position;
  frame: Size;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function defaultObjectFrame(object: PageObject): Size {
  if (object.frame) {
    return object.frame;
  }

  switch (object.type) {
    case "voice":
      return { width: 0.28, height: 0.23 };
    case "text":
      return { width: 0.26, height: 0.18 };
    case "link":
      return { width: 0.26, height: 0.1 };
    case "photo":
      return { width: 0.22, height: 0.3 };
    case "transcript":
      return { width: 0.28, height: 0.16 };
    default: {
      const exhaustiveObject: never = object;
      throw new Error(`Unsupported page object: ${exhaustiveObject}`);
    }
  }
}

export function clampPosition(position: Position, frame: Size): Position {
  return {
    x: clamp(
      position.x,
      PAGE_LAYOUT_BOUNDS.left,
      PAGE_LAYOUT_BOUNDS.right - frame.width,
    ),
    y: clamp(
      position.y,
      PAGE_LAYOUT_BOUNDS.top,
      PAGE_LAYOUT_BOUNDS.bottom - frame.height,
    ),
  };
}

export function moveLayout(
  start: PageLayout,
  delta: Position,
): PageLayout & { guides: AlignmentGuides } {
  let position = clampPosition(
    {
      x: start.position.x + delta.x,
      y: start.position.y + delta.y,
    },
    start.frame,
  );
  const centreX = position.x + start.frame.width / 2;
  const centreY = position.y + start.frame.height / 2;
  const vertical = Math.abs(centreX - 0.5) <= 0.015;
  const horizontal = Math.abs(centreY - 0.54) <= 0.015;

  if (vertical) {
    position = { ...position, x: 0.5 - start.frame.width / 2 };
  }
  if (horizontal) {
    position = { ...position, y: 0.54 - start.frame.height / 2 };
  }

  return {
    position,
    frame: start.frame,
    guides: { horizontal, vertical },
  };
}

export function resizeLayout(
  start: PageLayout,
  delta: Size,
): PageLayout {
  const maximumWidth = Math.min(
    MAXIMUM_FRAME.width,
    PAGE_LAYOUT_BOUNDS.right - start.position.x,
  );
  const maximumHeight = Math.min(
    MAXIMUM_FRAME.height,
    PAGE_LAYOUT_BOUNDS.bottom - start.position.y,
  );

  return {
    position: start.position,
    frame: {
      width: clamp(
        start.frame.width + delta.width,
        MINIMUM_FRAME.width,
        maximumWidth,
      ),
      height: clamp(
        start.frame.height + delta.height,
        MINIMUM_FRAME.height,
        maximumHeight,
      ),
    },
  };
}
