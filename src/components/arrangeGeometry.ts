import type { PageObject, Position, Size } from "../domain/models";

export const PAGE_LAYOUT_BOUNDS = {
  left: 0.03,
  right: 0.97,
  top: 0.04,
  bottom: 0.96,
} as const;

export const MINIMUM_FRAME = { width: 0.18, height: 0.12 } as const;
export const MINIMUM_SHAPE_FRAME = { width: 0.08, height: 0.08 } as const;
export const VOICE_FRAME = MINIMUM_FRAME;
export const MAXIMUM_FRAME = { width: 0.6, height: 0.55 } as const;

/** Matches `--active-canvas-aspect` in styles.css. */
export const CANVAS_ASPECT_RATIO = 16 / 9;

export const MAXIMUM_PHOTO_FRAME = {
  width: PAGE_LAYOUT_BOUNDS.right - PAGE_LAYOUT_BOUNDS.left,
  height: PAGE_LAYOUT_BOUNDS.bottom - PAGE_LAYOUT_BOUNDS.top,
} as const;
export const MAXIMUM_SHAPE_FRAME = MAXIMUM_PHOTO_FRAME;

export type AlignmentGuides = {
  horizontal: boolean;
  vertical: boolean;
};

export type PageLayout = {
  position: Position;
  frame: Size;
};

export type ResizeOptions = {
  aspectRatio?: number;
  maximum?: Size;
  minimum?: Size;
};

export type LayoutEdges = {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
};

export type ResizeAnchor = {
  horizontal: "left" | "right";
  vertical: "top" | "bottom";
};

export const ADAPTIVE_CONTROL_EDGE_MARGIN = 0.04;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function pageAspectFromImage(image: Size): number {
  const imageAspect = Math.max(image.width, 1) / Math.max(image.height, 1);
  return imageAspect / CANVAS_ASPECT_RATIO;
}

export function fitFrameToAspect(image: Size, limit: Size): Size {
  const aspect = pageAspectFromImage(image);
  const maxWidth = Math.max(limit.width, MINIMUM_FRAME.width);
  const maxHeight = Math.max(limit.height, MINIMUM_FRAME.height);
  let width = maxWidth;
  let height = width / aspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }
  return {
    width: clamp(width, MINIMUM_FRAME.width, maxWidth),
    height: clamp(height, MINIMUM_FRAME.height, maxHeight),
  };
}

export function containFrameInAspect(frame: Size, aspectRatio: number): Size {
  if (frame.width / frame.height > aspectRatio) {
    return {
      width: frame.height * aspectRatio,
      height: frame.height,
    };
  }
  return {
    width: frame.width,
    height: frame.width / aspectRatio,
  };
}

export function defaultPhotoFrame(image: Size): Size {
  return fitFrameToAspect(image, MAXIMUM_PHOTO_FRAME);
}

export function defaultPhotoPosition(frame: Size): Position {
  return clampPosition(
    {
      x: 0.5 - frame.width / 2,
      y: PAGE_LAYOUT_BOUNDS.top,
    },
    frame,
  );
}

export function defaultObjectFrame(object: PageObject): Size {
  if (object.type === "voice") {
    return VOICE_FRAME;
  }
  if (object.frame) {
    return object.frame;
  }

  switch (object.type) {
    case "text":
      return { width: 0.26, height: 0.18 };
    case "link":
      return { width: 0.26, height: 0.1 };
    case "shape":
      return { width: 0.24, height: 0.24 };
    case "photo":
      return defaultPhotoFrame(object.size);
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

export function layoutEdges(
  layout: PageLayout,
  margin = ADAPTIVE_CONTROL_EDGE_MARGIN,
): LayoutEdges {
  return {
    top: layout.position.y <= PAGE_LAYOUT_BOUNDS.top + margin,
    right:
      layout.position.x + layout.frame.width >=
      PAGE_LAYOUT_BOUNDS.right - margin,
    bottom:
      layout.position.y + layout.frame.height >=
      PAGE_LAYOUT_BOUNDS.bottom - margin,
    left: layout.position.x <= PAGE_LAYOUT_BOUNDS.left + margin,
  };
}

export function inwardResizeAnchor(layout: PageLayout): ResizeAnchor {
  const edges = layoutEdges(layout);
  return {
    horizontal: edges.right ? "left" : "right",
    vertical: edges.bottom ? "top" : "bottom",
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
  const horizontal = Math.abs(centreY - 0.5) <= 0.015;

  if (vertical) {
    position = { ...position, x: 0.5 - start.frame.width / 2 };
  }
  if (horizontal) {
    position = { ...position, y: 0.5 - start.frame.height / 2 };
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
  options: ResizeOptions = {},
): PageLayout {
  const maximum = options.maximum ?? MAXIMUM_FRAME;
  const minimum = options.minimum ?? MINIMUM_FRAME;
  const maximumWidth = Math.min(
    maximum.width,
    PAGE_LAYOUT_BOUNDS.right - start.position.x,
  );
  const maximumHeight = Math.min(
    maximum.height,
    PAGE_LAYOUT_BOUNDS.bottom - start.position.y,
  );
  const aspectRatio = options.aspectRatio;

  if (aspectRatio && aspectRatio > 0) {
    const widthLed = Math.abs(delta.width) >= Math.abs(delta.height);
    let width: number;
    let height: number;
    if (widthLed) {
      width = clamp(
        start.frame.width + delta.width,
        minimum.width,
        maximumWidth,
      );
      height = width / aspectRatio;
      if (height > maximumHeight) {
        height = maximumHeight;
        width = height * aspectRatio;
      } else if (height < minimum.height) {
        height = minimum.height;
        width = height * aspectRatio;
      }
    } else {
      height = clamp(
        start.frame.height + delta.height,
        minimum.height,
        maximumHeight,
      );
      width = height * aspectRatio;
      if (width > maximumWidth) {
        width = maximumWidth;
        height = width / aspectRatio;
      } else if (width < minimum.width) {
        width = minimum.width;
        height = width / aspectRatio;
      }
    }
    return {
      position: start.position,
      frame: {
        width: clamp(width, minimum.width, maximumWidth),
        height: clamp(height, minimum.height, maximumHeight),
      },
    };
  }

  return {
    position: start.position,
    frame: {
      width: clamp(
        start.frame.width + delta.width,
        minimum.width,
        maximumWidth,
      ),
      height: clamp(
        start.frame.height + delta.height,
        minimum.height,
        maximumHeight,
      ),
    },
  };
}

export function resizeLayoutFromAnchor(
  start: PageLayout,
  delta: Size,
  anchor: ResizeAnchor,
  options: ResizeOptions = {},
): PageLayout {
  const fixedRight = start.position.x + start.frame.width;
  const fixedBottom = start.position.y + start.frame.height;
  const maximum = options.maximum ?? MAXIMUM_FRAME;
  const availableWidth = anchor.horizontal === "left"
    ? fixedRight - PAGE_LAYOUT_BOUNDS.left
    : PAGE_LAYOUT_BOUNDS.right - start.position.x;
  const availableHeight = anchor.vertical === "top"
    ? fixedBottom - PAGE_LAYOUT_BOUNDS.top
    : PAGE_LAYOUT_BOUNDS.bottom - start.position.y;
  const resizeStart = {
    position: {
      x: anchor.horizontal === "left"
        ? PAGE_LAYOUT_BOUNDS.left
        : start.position.x,
      y: anchor.vertical === "top"
        ? PAGE_LAYOUT_BOUNDS.top
        : start.position.y,
    },
    frame: start.frame,
  };
  const resized = resizeLayout(
    resizeStart,
    {
      width: anchor.horizontal === "left" ? -delta.width : delta.width,
      height: anchor.vertical === "top" ? -delta.height : delta.height,
    },
    {
      ...options,
      maximum: {
        width: Math.min(maximum.width, availableWidth),
        height: Math.min(maximum.height, availableHeight),
      },
    },
  );
  return {
    position: {
      x: anchor.horizontal === "left"
        ? fixedRight - resized.frame.width
        : start.position.x,
      y: anchor.vertical === "top"
        ? fixedBottom - resized.frame.height
        : start.position.y,
    },
    frame: resized.frame,
  };
}
