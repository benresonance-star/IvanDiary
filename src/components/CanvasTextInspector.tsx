import {
  ArrowDown,
  ArrowUp,
  BringToFront,
  Edit3,
  GripHorizontal,
  List,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";

import type { TextObject } from "../domain/models";
import {
  adjustCanvasTextScale,
  CANVAS_TEXT_SCALE_MAX,
  CANVAS_TEXT_SCALE_MIN,
} from "./canvasTextScale";
import { ConfirmDialog } from "./ConfirmDialog";

type PalettePosition = { left: number; top: number };
type PaletteDrag = {
  frame?: number;
  latest: PalettePosition;
  maxLeft: number;
  maxTop: number;
  minLeft: number;
  minTop: number;
  offsetX: number;
  offsetY: number;
  origin: PalettePosition;
  pointerId: number;
};

let retainedTextPalettePosition: PalettePosition | undefined;

export function CanvasTextInspector({
  canMoveEarlier,
  canMoveLater,
  object,
  onDelete,
  onEdit,
  onMoveEarlier,
  onMoveLater,
  onToggleStack,
  onUpdate,
  stacked,
}: {
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  object: TextObject;
  onDelete: () => void;
  onEdit: () => void;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
  onToggleStack: () => void;
  onUpdate: (next: TextObject) => void;
  stacked: boolean;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const paletteRef = useRef<HTMLElement>(null);
  const dragRef = useRef<PaletteDrag | undefined>(undefined);
  const widthCommittedRef = useRef(true);
  const [outlineWidthDraft, setOutlineWidthDraft] = useState(
    object.outlineWidth ?? 2,
  );
  const [palettePosition, setPalettePosition] = useState<PalettePosition>(
    retainedTextPalettePosition ?? {
      left: Math.max(12, (globalThis.innerWidth || 1024) - 270),
      top: 84,
    },
  );
  const textScale = object.textScale ?? 1;

  const movePalette = (left: number, top: number) => {
    const palette = paletteRef.current?.getBoundingClientRect();
    if (!palette) return;
    const viewport = globalThis.visualViewport;
    const margin = 12;
    const minLeft = (viewport?.offsetLeft ?? 0) + margin;
    const minTop = (viewport?.offsetTop ?? 0) + margin;
    const maxLeft =
      (viewport?.offsetLeft ?? 0) +
      (viewport?.width ?? globalThis.innerWidth) -
      palette.width -
      margin;
    const maxTop =
      (viewport?.offsetTop ?? 0) +
      (viewport?.height ?? globalThis.innerHeight) -
      palette.height -
      margin;
    const next = {
      left: Math.max(minLeft, Math.min(left, maxLeft)),
      top: Math.max(minTop, Math.min(top, maxTop)),
    };
    retainedTextPalettePosition = next;
    setPalettePosition(next);
  };

  const beginPaletteMove = (event: PointerEvent<HTMLButtonElement>) => {
    const palette = paletteRef.current?.getBoundingClientRect();
    if (!palette || event.button !== 0) return;
    event.preventDefault();
    const viewport = globalThis.visualViewport;
    const margin = 12;
    const origin = { left: palette.left, top: palette.top };
    dragRef.current = {
      latest: origin,
      maxLeft:
        (viewport?.offsetLeft ?? 0) +
        (viewport?.width ?? globalThis.innerWidth) -
        palette.width -
        margin,
      maxTop:
        (viewport?.offsetTop ?? 0) +
        (viewport?.height ?? globalThis.innerHeight) -
        palette.height -
        margin,
      minLeft: (viewport?.offsetLeft ?? 0) + margin,
      minTop: (viewport?.offsetTop ?? 0) + margin,
      offsetX: event.clientX - palette.left,
      offsetY: event.clientY - palette.top,
      origin,
      pointerId: event.pointerId,
    };
    paletteRef.current?.classList.add("dragging");
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updatePaletteMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    drag.latest = {
      left: Math.max(
        drag.minLeft,
        Math.min(event.clientX - drag.offsetX, drag.maxLeft),
      ),
      top: Math.max(
        drag.minTop,
        Math.min(event.clientY - drag.offsetY, drag.maxTop),
      ),
    };
    if (drag.frame !== undefined) return;
    drag.frame = requestAnimationFrame(() => {
      drag.frame = undefined;
      const palette = paletteRef.current;
      if (!palette || dragRef.current !== drag) return;
      palette.style.transform = `translate3d(${drag.latest.left - drag.origin.left}px, ${drag.latest.top - drag.origin.top}px, 0)`;
    });
  };

  const finishPaletteMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    const drag = dragRef.current;
    if (drag.frame !== undefined) cancelAnimationFrame(drag.frame);
    dragRef.current = undefined;
    if (paletteRef.current) {
      paletteRef.current.style.transform = "";
      paletteRef.current.classList.remove("dragging");
    }
    retainedTextPalettePosition = drag.latest;
    setPalettePosition(drag.latest);
  };

  const cancelPaletteMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.frame !== undefined) cancelAnimationFrame(drag.frame);
    dragRef.current = undefined;
    if (paletteRef.current) {
      paletteRef.current.style.transform = "";
      paletteRef.current.classList.remove("dragging");
    }
  };

  const keyboardPaletteMove = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const step = event.shiftKey ? 40 : 10;
    movePalette(
      palettePosition.left +
        (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
      palettePosition.top +
        (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
    );
  };

  useEffect(() => {
    const clamp = () => movePalette(palettePosition.left, palettePosition.top);
    globalThis.addEventListener("resize", clamp);
    globalThis.visualViewport?.addEventListener("resize", clamp);
    return () => {
      globalThis.removeEventListener("resize", clamp);
      globalThis.visualViewport?.removeEventListener("resize", clamp);
    };
  }, [object.outlineColor, palettePosition.left, palettePosition.top]);

  const commitOutlineWidth = () => {
    if (widthCommittedRef.current) return;
    widthCommittedRef.current = true;
    onUpdate({
      ...object,
      outlineWidth: outlineWidthDraft,
      revision: object.revision + 1,
    });
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <aside
        aria-label="Text editing commands"
        className="canvas-text-inspector"
        ref={paletteRef}
        style={{
          bottom: "auto",
          left: palettePosition.left,
          right: "auto",
          top: palettePosition.top,
        } as CSSProperties}
      >
        <button
          aria-label="Move text palette"
          className="canvas-text-inspector-handle"
          onKeyDown={keyboardPaletteMove}
          onLostPointerCapture={finishPaletteMove}
          onPointerCancel={cancelPaletteMove}
          onPointerDown={beginPaletteMove}
          onPointerMove={updatePaletteMove}
          onPointerUp={finishPaletteMove}
          type="button"
        >
          <GripHorizontal aria-hidden="true" />
          <strong>Text</strong>
        </button>
        <button className="canvas-text-edit" onClick={onEdit} type="button">
          <Edit3 aria-hidden="true" />Edit text
        </button>
        <button className="canvas-text-membership" data-help-topic="canvas-text-membership" onClick={onToggleStack} type="button">
          {stacked ? <BringToFront aria-hidden="true" /> : <List aria-hidden="true" />}
          {stacked ? "Move to canvas" : "Move to text stack"}
        </button>
        <div aria-label="Text size" className="canvas-text-size-control" role="group">
          <strong>Text Size</strong>
          <button
            aria-label="Decrease text size"
            disabled={textScale <= CANVAS_TEXT_SCALE_MIN}
            onClick={() => onUpdate({
              ...object,
              textScale: adjustCanvasTextScale(textScale, -1),
              revision: object.revision + 1,
            })}
            type="button"
          >
            <Minus aria-hidden="true" />
          </button>
          <output aria-label="Current text size">{Math.round(textScale * 100)}%</output>
          <button
            aria-label="Increase text size"
            disabled={textScale >= CANVAS_TEXT_SCALE_MAX}
            onClick={() => onUpdate({
              ...object,
              textScale: adjustCanvasTextScale(textScale, 1),
              revision: object.revision + 1,
            })}
            type="button"
          >
            <Plus aria-hidden="true" />
          </button>
        </div>
        <fieldset className="canvas-text-appearance-controls">
          <legend>Colours</legend>
        <label className="canvas-text-colour-control" data-help-topic="canvas-text-style">
          <input
            aria-label="Text colour"
            onChange={(event) => onUpdate({ ...object, color: event.target.value, revision: object.revision + 1 })}
            type="color"
            value={object.color ?? "#201c17"}
          />
          <span>Text Colour</span>
        </label>
        <div className="canvas-text-colour-row">
          <label data-help-topic="canvas-text-style">
            {object.outlineColor ? <input
              aria-label="Text outline colour"
              onChange={(event) => onUpdate({
                ...object,
                outlineColor: event.target.value,
                revision: object.revision + 1,
              })}
              type="color"
              value={object.outlineColor}
            /> : null}
            <span>Outline</span>
          </label>
          <button
            aria-label="Toggle text outline"
            aria-pressed={Boolean(object.outlineColor)}
            className="canvas-text-toggle"
            onClick={() => onUpdate({
              ...object,
              outlineColor: object.outlineColor ? undefined : "#3f3528",
              outlineWidth: object.outlineWidth ?? 2,
              revision: object.revision + 1,
            })}
            type="button"
          >
            {object.outlineColor ? "On" : "Off"}
          </button>
        </div>
        {object.outlineColor ? <label className="canvas-text-outline-width">
          Outline thickness
          <output>{outlineWidthDraft}</output>
          <input
            aria-label="Text outline thickness"
            max="12"
            min="1"
            onBlur={commitOutlineWidth}
            onChange={(event) => {
              widthCommittedRef.current = false;
              setOutlineWidthDraft(Number(event.target.value));
            }}
            onKeyUp={commitOutlineWidth}
            onPointerUp={commitOutlineWidth}
            type="range"
            value={outlineWidthDraft}
          />
        </label> : null}
        <div className="canvas-text-colour-row">
          <label data-help-topic="canvas-text-style">
            {object.backgroundColor ? <input
              aria-label="Text background colour"
              onChange={(event) => onUpdate({
                ...object,
                backgroundColor: event.target.value,
                revision: object.revision + 1,
              })}
              type="color"
              value={object.backgroundColor}
            /> : null}
            <span>Background</span>
          </label>
          <button
            aria-label="Toggle text background"
            aria-pressed={Boolean(object.backgroundColor)}
            className="canvas-text-toggle"
            onClick={() => onUpdate({
              ...object,
              backgroundColor: object.backgroundColor ? undefined : "#fffaf0",
              revision: object.revision + 1,
            })}
            type="button"
          >
            {object.backgroundColor ? "On" : "Off"}
          </button>
        </div>
        </fieldset>
        {stacked ? (
          <div aria-label="Text reading order" className="canvas-text-order-group" data-help-topic="canvas-text-order" role="group">
            <button disabled={!canMoveEarlier} onClick={onMoveEarlier} type="button"><ArrowUp aria-hidden="true" />Earlier</button>
            <button disabled={!canMoveLater} onClick={onMoveLater} type="button"><ArrowDown aria-hidden="true" />Later</button>
          </div>
        ) : null}
        <div className="canvas-text-inspector-actions">
          <button className="canvas-text-delete" onClick={() => setDeleteOpen(true)} type="button"><Trash2 aria-hidden="true" />Delete</button>
        </div>
        <span aria-live="polite" className="visually-hidden">
          {stacked ? "Text is in the reading stack" : "Text is free on the canvas"}
        </span>
      </aside>
      {deleteOpen ? (
        <ConfirmDialog
          cancelLabel="Keep it"
          confirmClassName="confirm-delete"
          confirmLabel="Delete"
          icon={<Trash2 aria-hidden="true" />}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => {
            setDeleteOpen(false);
            onDelete();
          }}
          title="Delete text?"
        >
          <p>Do you want to delete “{object.text.trim() || "Empty text block"}”?</p>
        </ConfirmDialog>
      ) : null}
    </>,
    document.body,
  );
}
