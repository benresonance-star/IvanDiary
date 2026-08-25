import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  GripHorizontal,
  Layers2,
  Maximize2,
  Ratio,
  StepBack,
  StepForward,
  Trash2,
} from "lucide-react";
import { createPortal } from "react-dom";

import type { Position, Size } from "../domain/models";
import {
  inwardResizeAnchor,
  layoutEdges,
  moveLayout,
  resizeLayout,
  resizeLayoutFromAnchor,
  type AlignmentGuides,
  type PageLayout,
  type ResizeAnchor,
} from "./arrangeGeometry";
import { ConfirmDialog } from "./ConfirmDialog";

export type LayoutChange = {
  kind: "move" | "resize";
  before: PageLayout;
  after: PageLayout;
};

type ActiveInteraction = {
  pointerId: number;
  kind: LayoutChange["kind"];
  clientX: number;
  clientY: number;
  start: PageLayout;
  resizeAnchor?: ResizeAnchor;
};

const EMPTY_GUIDES: AlignmentGuides = {
  horizontal: false,
  vertical: false,
};

function layoutsEqual(first: PageLayout, second: PageLayout): boolean {
  return (
    Math.abs(first.position.x - second.position.x) < 0.0001 &&
    Math.abs(first.position.y - second.position.y) < 0.0001 &&
    Math.abs(first.frame.width - second.frame.width) < 0.0001 &&
    Math.abs(first.frame.height - second.frame.height) < 0.0001
  );
}

export function ArrangeablePageObject({
  adaptiveEdgeControls = false,
  arrange,
  canResize = true,
  aspectLock = false,
  aspectRatio,
  children,
  className,
  deleteDescription = "",
  frame,
  layer,
  maximumFrame,
  minimumFrame,
  objectLabel,
  objectId,
  onCommit,
  onDelete,
  onMoveBackward,
  onMoveForward,
  onNativeDragStart,
  onSelect,
  onToggleAspectLock,
  onToggleLayer,
  pageRef,
  position,
  selected,
  showShortcuts,
  stackIndex,
}: {
  adaptiveEdgeControls?: boolean;
  arrange: boolean;
  canResize?: boolean;
  aspectLock?: boolean;
  aspectRatio?: number;
  children: ReactNode;
  className: string;
  deleteDescription?: string;
  frame: Size;
  layer: "above-sketch" | "behind-sketch";
  maximumFrame?: Size;
  minimumFrame?: Size;
  objectLabel: string;
  objectId: string;
  onCommit: (change: LayoutChange) => void;
  onDelete?: () => void;
  onMoveBackward?: () => void;
  onMoveForward?: () => void;
  onNativeDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onSelect: () => void;
  onToggleAspectLock?: () => void;
  onToggleLayer?: () => void;
  pageRef: RefObject<HTMLDivElement | null>;
  position: Position;
  selected: boolean;
  showShortcuts: boolean;
  stackIndex?: number;
}) {
  const activeRef = useRef<ActiveInteraction | undefined>(undefined);
  const [layout, setLayout] = useState<PageLayout>({ position, frame });
  const layoutRef = useRef<PageLayout>(layout);
  const [guides, setGuides] = useState<AlignmentGuides>(EMPTY_GUIDES);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const updateLayout = (next: PageLayout) => {
    layoutRef.current = next;
    setLayout(next);
  };

  useEffect(() => {
    if (!activeRef.current) {
      const next = { position, frame };
      layoutRef.current = next;
      setLayout(next);
    }
  }, [frame, position]);

  useEffect(() => {
    setPortalTarget(pageRef.current);
  }, [pageRef]);

  const beginInteraction = (
    event: PointerEvent<HTMLButtonElement>,
    kind: LayoutChange["kind"],
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect();
    activeRef.current = {
      pointerId: event.pointerId,
      kind,
      clientX: event.clientX,
      clientY: event.clientY,
      start: layout,
      ...(kind === "resize" && adaptiveEdgeControls
        ? { resizeAnchor: inwardResizeAnchor(layout) }
        : {}),
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Continue while the pointer remains over the handle.
    }
  };

  const updateInteraction = (event: PointerEvent<HTMLButtonElement>) => {
    const active = activeRef.current;
    const page = pageRef.current;
    if (!active || !page || event.pointerId !== active.pointerId) {
      return;
    }
    event.preventDefault();
    const bounds = page.getBoundingClientRect();
    const deltaX = (event.clientX - active.clientX) / bounds.width;
    const deltaY = (event.clientY - active.clientY) / bounds.height;

    if (active.kind === "move") {
      const moved = moveLayout(active.start, { x: deltaX, y: deltaY });
      updateLayout({ position: moved.position, frame: moved.frame });
      setGuides(moved.guides);
      return;
    }

    const resizeOptions = {
      aspectRatio: aspectLock ? aspectRatio : undefined,
      maximum: maximumFrame,
      minimum: minimumFrame,
    };
    updateLayout(active.resizeAnchor
      ? resizeLayoutFromAnchor(
          active.start,
          { width: deltaX, height: deltaY },
          active.resizeAnchor,
          resizeOptions,
        )
      : resizeLayout(
          active.start,
          { width: deltaX, height: deltaY },
          resizeOptions,
        ));
  };

  const finishInteraction = (event: PointerEvent<HTMLButtonElement>) => {
    const active = activeRef.current;
    if (!active || event.pointerId !== active.pointerId) {
      return;
    }
    activeRef.current = undefined;
    setGuides(EMPTY_GUIDES);
    const current = layoutRef.current;
    if (!layoutsEqual(active.start, current)) {
      onCommit({ kind: active.kind, before: active.start, after: current });
    }
  };

  const cancelInteraction = (event: PointerEvent<HTMLButtonElement>) => {
    const active = activeRef.current;
    if (!active || event.pointerId !== active.pointerId) {
      return;
    }
    activeRef.current = undefined;
    updateLayout(active.start);
    setGuides(EMPTY_GUIDES);
  };

  const applyMove = (delta: Position) => {
    const moved = moveLayout(layout, delta);
    const next = { position: moved.position, frame: moved.frame };
    updateLayout(next);
    onCommit({ kind: "move", before: layout, after: next });
  };

  const applyResize = (delta: Size) => {
    const options = {
      aspectRatio: aspectLock ? aspectRatio : undefined,
      maximum: maximumFrame,
      minimum: minimumFrame,
    };
    const anchor = adaptiveEdgeControls
      ? inwardResizeAnchor(layout)
      : undefined;
    const next = anchor
      ? resizeLayoutFromAnchor(layout, {
          width: anchor.horizontal === "left" ? -delta.width : delta.width,
          height: anchor.vertical === "top" ? -delta.height : delta.height,
        }, anchor, options)
      : resizeLayout(layout, delta, options);
    updateLayout(next);
    onCommit({ kind: "resize", before: layout, after: next });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const amount = 0.015;
    let handled = true;
    if (event.shiftKey && canResize) {
      switch (event.key) {
        case "ArrowLeft":
          applyResize({ width: -amount, height: 0 });
          break;
        case "ArrowRight":
          applyResize({ width: amount, height: 0 });
          break;
        case "ArrowUp":
          applyResize({ width: 0, height: -amount });
          break;
        case "ArrowDown":
          applyResize({ width: 0, height: amount });
          break;
        default:
          handled = false;
      }
    } else {
      switch (event.key) {
        case "ArrowLeft":
          applyMove({ x: -amount, y: 0 });
          break;
        case "ArrowRight":
          applyMove({ x: amount, y: 0 });
          break;
        case "ArrowUp":
          applyMove({ x: 0, y: -amount });
          break;
        case "ArrowDown":
          applyMove({ x: 0, y: amount });
          break;
        default:
          handled = false;
      }
    }

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const style: CSSProperties = {
    left: `${layout.position.x * 100}%`,
    top: `${layout.position.y * 100}%`,
    width: `${layout.frame.width * 100}%`,
    height: `${layout.frame.height * 100}%`,
    ...(stackIndex === undefined
      ? {}
      : { zIndex: layer === "behind-sketch" ? 0 : 20 + stackIndex }),
  };
  const adaptiveEdges = adaptiveEdgeControls
    ? layoutEdges(layout)
    : undefined;
  const adaptiveAnchor = adaptiveEdgeControls
    ? inwardResizeAnchor(layout)
    : undefined;
  const controllerClassName = [
    "arrange-controller-overlay",
    adaptiveEdgeControls ? "adaptive-edge-controls" : "",
    adaptiveEdges?.top ? "controls-near-top" : "",
    adaptiveEdges?.right ? "controls-near-right" : "",
    adaptiveEdges?.bottom ? "controls-near-bottom" : "",
    adaptiveEdges?.left ? "controls-near-left" : "",
  ].filter(Boolean).join(" ");

  return (
    // Keyboard movement and resizing are implemented above; `group` is used
    // because the arranged object can contain its own interactive controls.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      aria-label={
        arrange
          ? `${objectLabel}. Arrow keys move.${canResize ? " Shift and arrow keys resize." : ""}`
          : undefined
      }
      className={`${className}${layer === "behind-sketch" ? " behind-sketch" : ""}${arrange ? " arrangeable" : ""}${selected ? " selected-object" : ""}`}
      data-help-body={
        arrange
          ? `This ${objectLabel.toLowerCase()} can be moved${canResize ? ", resized" : ""}, layered, or removed.`
          : undefined
      }
      data-help-title={arrange ? objectLabel : undefined}
      data-help-topic={arrange ? "arrange-object" : undefined}
      data-object-id={objectId}
      draggable={arrange && Boolean(onNativeDragStart)}
      onClick={arrange ? onSelect : undefined}
      onDragStart={onNativeDragStart}
      onKeyDown={arrange ? handleKeyDown : undefined}
      role={arrange ? "group" : undefined}
      style={style}
      tabIndex={arrange ? 0 : undefined}
    >
      {children}
      {arrange && selected && portalTarget ? createPortal(
        <div
          className={controllerClassName}
          data-resize-horizontal={adaptiveAnchor?.horizontal}
          data-resize-vertical={adaptiveAnchor?.vertical}
          style={style}
        >
          {onToggleAspectLock ? (
            <button
              aria-label={
                aspectLock
                  ? "Keep photo proportions. On"
                  : "Keep photo proportions. Off"
              }
              aria-pressed={aspectLock}
              className={`arrange-aspect-lock${aspectLock ? " selected" : ""}`}
              data-help-title={`Keep ${objectLabel.toLowerCase()} shape`}
              data-help-topic="arrange-proportion"
              onClick={(event) => {
                event.stopPropagation();
                onToggleAspectLock();
              }}
              type="button"
            >
              <Ratio aria-hidden="true" />
            </button>
          ) : null}
          <button
            aria-label={`Drag to move ${objectLabel}`}
            className="arrange-handle move-handle"
            data-help-title={`Move ${objectLabel.toLowerCase()}`}
            data-help-topic="arrange-move"
            onLostPointerCapture={finishInteraction}
            onPointerCancel={cancelInteraction}
            onPointerDown={(event) => beginInteraction(event, "move")}
            onPointerMove={updateInteraction}
            onPointerUp={finishInteraction}
            type="button"
          >
            <GripHorizontal aria-hidden="true" />
          </button>
          {canResize ? <button
            aria-label={`Drag to resize ${objectLabel}`}
            className="arrange-handle resize-handle"
            data-help-title={`Resize ${objectLabel.toLowerCase()}`}
            data-help-topic="arrange-resize"
            onLostPointerCapture={finishInteraction}
            onPointerCancel={cancelInteraction}
            onPointerDown={(event) => beginInteraction(event, "resize")}
            onPointerMove={updateInteraction}
            onPointerUp={finishInteraction}
            type="button"
          >
            <Maximize2 aria-hidden="true" />
          </button> : null}
          {onDelete ? <button
            aria-label={`Delete ${objectLabel}`}
            className="arrange-delete"
            data-help-title={`Delete ${objectLabel.toLowerCase()}`}
            data-help-topic="arrange-delete"
            onClick={(event) => {
              event.stopPropagation();
              setDeleteDialogOpen(true);
            }}
            type="button"
          >
            <Trash2 aria-hidden="true" />
          </button> : null}
          {onToggleLayer ? <button
            aria-label={`${layer === "behind-sketch" ? "Move in front of" : "Move behind"} sketch: ${objectLabel}`}
            className="arrange-layer-toggle"
            data-help-title={`Layer ${objectLabel.toLowerCase()}`}
            data-help-topic="arrange-layer"
            onClick={(event) => {
              event.stopPropagation();
              onToggleLayer();
            }}
            type="button"
          >
            <Layers2 aria-hidden="true" className="layer-stack-icon" />
            {layer === "behind-sketch" ? (
              <ArrowUp aria-hidden="true" className="layer-direction-icon" />
            ) : (
              <ArrowDown aria-hidden="true" className="layer-direction-icon" />
            )}
          </button> : null}
          {onMoveForward ? <button aria-label={`Bring ${objectLabel} forward`} className="arrange-order arrange-order-forward" onClick={(event) => { event.stopPropagation(); onMoveForward(); }} type="button"><StepForward aria-hidden="true" /></button> : null}
          {onMoveBackward ? <button aria-label={`Send ${objectLabel} backward`} className="arrange-order arrange-order-backward" onClick={(event) => { event.stopPropagation(); onMoveBackward(); }} type="button"><StepBack aria-hidden="true" /></button> : null}
          {showShortcuts ? (
            <div
              className="arrange-nudge-controls"
              aria-label={`Adjust ${objectLabel}`}
            >
            <button aria-label="Move left" data-help-topic="arrange-move" onClick={() => applyMove({ x: -0.02, y: 0 })} type="button">
              <ArrowLeft aria-hidden="true" />
            </button>
            <button aria-label="Move up" data-help-topic="arrange-move" onClick={() => applyMove({ x: 0, y: -0.02 })} type="button">
              <ArrowUp aria-hidden="true" />
            </button>
            <button aria-label="Move down" data-help-topic="arrange-move" onClick={() => applyMove({ x: 0, y: 0.02 })} type="button">
              <ArrowDown aria-hidden="true" />
            </button>
            <button aria-label="Move right" data-help-topic="arrange-move" onClick={() => applyMove({ x: 0.02, y: 0 })} type="button">
              <ArrowRight aria-hidden="true" />
            </button>
            <button aria-label="Make narrower" data-help-topic="arrange-resize" onClick={() => applyResize({ width: -0.03, height: 0 })} type="button">
              W−
            </button>
            <button aria-label="Make wider" data-help-topic="arrange-resize" onClick={() => applyResize({ width: 0.03, height: 0 })} type="button">
              W+
            </button>
            <button aria-label="Make shorter" data-help-topic="arrange-resize" onClick={() => applyResize({ width: 0, height: -0.03 })} type="button">
              H−
            </button>
            <button aria-label="Make taller" data-help-topic="arrange-resize" onClick={() => applyResize({ width: 0, height: 0.03 })} type="button">
              H+
            </button>
            </div>
          ) : null}
          {portalTarget && guides.vertical
            ? createPortal(
                <div className="alignment-guide vertical-guide" />,
                portalTarget,
              )
            : null}
          {portalTarget && guides.horizontal
            ? createPortal(
                <div className="alignment-guide horizontal-guide" />,
                portalTarget,
              )
            : null}
          {deleteDialogOpen && onDelete ? (
            <ConfirmDialog
              cancelLabel="Keep it"
              confirmClassName="confirm-delete"
              confirmLabel="Delete"
              icon={<Trash2 aria-hidden="true" />}
              onCancel={() => setDeleteDialogOpen(false)}
              onConfirm={() => {
                setDeleteDialogOpen(false);
                onDelete();
              }}
              title={`Delete ${objectLabel}?`}
            >
              <p>Do you want to delete “{deleteDescription}”?</p>
            </ConfirmDialog>
          ) : null}
        </div>,
        portalTarget,
      ) : null}
    </div>
  );
}
