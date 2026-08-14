import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
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
  Trash2,
} from "lucide-react";
import { createPortal } from "react-dom";

import type { Position, Size } from "../domain/models";
import {
  moveLayout,
  resizeLayout,
  type AlignmentGuides,
  type PageLayout,
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
  arrange,
  children,
  className,
  deleteDescription,
  frame,
  layer,
  objectLabel,
  objectId,
  onCommit,
  onDelete,
  onSelect,
  onToggleLayer,
  pageRef,
  position,
  selected,
  showShortcuts,
}: {
  arrange: boolean;
  children: ReactNode;
  className: string;
  deleteDescription: string;
  frame: Size;
  layer: "above-sketch" | "behind-sketch";
  objectLabel: string;
  objectId: string;
  onCommit: (change: LayoutChange) => void;
  onDelete: () => void;
  onSelect: () => void;
  onToggleLayer: () => void;
  pageRef: RefObject<HTMLDivElement | null>;
  position: Position;
  selected: boolean;
  showShortcuts: boolean;
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

    updateLayout(
      resizeLayout(active.start, {
        width: deltaX,
        height: deltaY,
      }),
    );
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
    const next = resizeLayout(layout, delta);
    updateLayout(next);
    onCommit({ kind: "resize", before: layout, after: next });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const amount = 0.015;
    let handled = true;
    if (event.shiftKey) {
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
  };

  return (
    <div
      aria-label={
        arrange
          ? `${objectLabel}. Arrow keys move. Shift and arrow keys resize.`
          : undefined
      }
      className={`${className}${layer === "behind-sketch" ? " behind-sketch" : ""}${arrange ? " arrangeable" : ""}${selected ? " selected-object" : ""}`}
      data-object-id={objectId}
      onClick={arrange ? onSelect : undefined}
      onKeyDown={arrange ? handleKeyDown : undefined}
      role={arrange ? "group" : undefined}
      style={style}
      tabIndex={arrange ? 0 : undefined}
    >
      {children}
      {arrange && selected ? (
        <>
          <button
            aria-label={`Drag to move ${objectLabel}`}
            className="arrange-handle move-handle"
            onLostPointerCapture={finishInteraction}
            onPointerCancel={cancelInteraction}
            onPointerDown={(event) => beginInteraction(event, "move")}
            onPointerMove={updateInteraction}
            onPointerUp={finishInteraction}
            type="button"
          >
            <GripHorizontal aria-hidden="true" />
          </button>
          <button
            aria-label={`Drag to resize ${objectLabel}`}
            className="arrange-handle resize-handle"
            onLostPointerCapture={finishInteraction}
            onPointerCancel={cancelInteraction}
            onPointerDown={(event) => beginInteraction(event, "resize")}
            onPointerMove={updateInteraction}
            onPointerUp={finishInteraction}
            type="button"
          >
            <Maximize2 aria-hidden="true" />
          </button>
          <button
            aria-label={`Delete ${objectLabel}`}
            className="arrange-delete"
            onClick={(event) => {
              event.stopPropagation();
              setDeleteDialogOpen(true);
            }}
            type="button"
          >
            <Trash2 aria-hidden="true" />
          </button>
          <button
            aria-label={`${layer === "behind-sketch" ? "Move in front of" : "Move behind"} sketch: ${objectLabel}`}
            className="arrange-layer-toggle"
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
          </button>
          {showShortcuts ? (
            <div
              className="arrange-nudge-controls"
              aria-label={`Adjust ${objectLabel}`}
            >
            <button aria-label="Move left" onClick={() => applyMove({ x: -0.02, y: 0 })} type="button">
              <ArrowLeft aria-hidden="true" />
            </button>
            <button aria-label="Move up" onClick={() => applyMove({ x: 0, y: -0.02 })} type="button">
              <ArrowUp aria-hidden="true" />
            </button>
            <button aria-label="Move down" onClick={() => applyMove({ x: 0, y: 0.02 })} type="button">
              <ArrowDown aria-hidden="true" />
            </button>
            <button aria-label="Move right" onClick={() => applyMove({ x: 0.02, y: 0 })} type="button">
              <ArrowRight aria-hidden="true" />
            </button>
            <button aria-label="Make narrower" onClick={() => applyResize({ width: -0.03, height: 0 })} type="button">
              W−
            </button>
            <button aria-label="Make wider" onClick={() => applyResize({ width: 0.03, height: 0 })} type="button">
              W+
            </button>
            <button aria-label="Make shorter" onClick={() => applyResize({ width: 0, height: -0.03 })} type="button">
              H−
            </button>
            <button aria-label="Make taller" onClick={() => applyResize({ width: 0, height: 0.03 })} type="button">
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
          {deleteDialogOpen ? (
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
        </>
      ) : null}
    </div>
  );
}
