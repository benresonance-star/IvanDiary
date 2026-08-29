export type OverlayRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DrawingOverlayLayout = {
  contentInsetTop: number;
  overlayRect: OverlayRect;
  paperRect: OverlayRect;
};

/** Match PencilKit overlay geometry: drawable area sits below overlapping tools. */
export function measureDrawingOverlayLayout(
  paper: HTMLElement,
  toolPalette?: HTMLElement | null,
  protectedHeader?: HTMLElement | null,
): DrawingOverlayLayout {
  const paperBounds = paper.getBoundingClientRect();
  const paperRect = {
    x: paperBounds.left,
    y: paperBounds.top,
    width: paperBounds.width,
    height: paperBounds.height,
  };

  let overlayTop = paperBounds.top;
  if (toolPalette) {
    const tools = toolPalette.getBoundingClientRect();
    if (tools.bottom > paperBounds.top && tools.top < paperBounds.bottom) {
      overlayTop = Math.max(overlayTop, tools.bottom + 8);
    }
  }
  if (protectedHeader) {
    const header = protectedHeader.getBoundingClientRect();
    if (header.bottom > paperBounds.top && header.top < paperBounds.bottom) {
      overlayTop = Math.max(overlayTop, header.bottom + 8);
    }
  }

  const contentInsetTop = Math.max(0, overlayTop - paperBounds.top);
  return {
    contentInsetTop,
    paperRect,
    overlayRect: {
      x: paperBounds.left,
      y: overlayTop,
      width: paperBounds.width,
      height: Math.max(0, paperBounds.bottom - overlayTop),
    },
  };
}
