import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type CanvasBackgroundControl = {
  color: string;
  defaultColor: string;
  onChange: (color?: string) => void;
};

export function CanvasBackgroundChooser({
  control,
}: {
  control: CanvasBackgroundControl;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    popoverRef.current
      ?.querySelector<HTMLInputElement>('input[type="color"]')
      ?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    globalThis.addEventListener("keydown", closeOnEscape);
    return () => globalThis.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="canvas-background-control">
      <button
        aria-controls="canvas-background-popover"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Canvas background colour ${control.color}`}
        className="canvas-background-disk"
        data-help-topic="canvas-background"
        onClick={() => setOpen((isOpen) => !isOpen)}
        ref={triggerRef}
        style={{ backgroundColor: control.color }}
        type="button"
      />
      {open ? (
        <>
          <button
            aria-label="Close canvas background colours"
            className="canvas-background-backdrop"
            onClick={close}
            type="button"
          />
          <div
            aria-label="Canvas background colour"
            className="canvas-background-popover"
            id="canvas-background-popover"
            ref={popoverRef}
            role="dialog"
          >
            <header>
              <strong>Canvas background</strong>
              <button aria-label="Close canvas background colours" onClick={close} type="button">
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="canvas-background-current">
              <span aria-hidden="true" style={{ backgroundColor: control.color }} />
              <span>Current colour<strong>{control.color.toUpperCase()}</strong></span>
            </div>
            <label>
              Choose colour
              <input
                aria-label="Choose canvas background colour"
                onChange={(event) => control.onChange(event.target.value)}
                type="color"
                value={control.color}
              />
            </label>
            <button
              disabled={control.color.toLowerCase() === control.defaultColor.toLowerCase()}
              onClick={() => control.onChange(undefined)}
              type="button"
            >
              Restore default colour
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
