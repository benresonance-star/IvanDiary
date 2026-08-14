import { useEffect, useId, useRef, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Mail } from "lucide-react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function ShareChooser({
  hasRecordings,
  onCancel,
  onSharePdf,
  onSharePicture,
}: {
  hasRecordings: boolean;
  onCancel: () => void;
  onSharePdf: () => void;
  onSharePicture: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const pictureRef = useRef<HTMLButtonElement>(null);
  const invokingElementRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const activeElement = document.activeElement;
    invokingElementRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;
    pictureRef.current?.focus();

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ??
          [],
      );
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusableElements[0]!;
      const last = focusableElements[focusableElements.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const invokingElement = invokingElementRef.current;
      if (invokingElement?.isConnected) {
        invokingElement.focus();
      }
    };
  }, []);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  };

  return createPortal(
    <div
      className="delete-dialog-backdrop"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="delete-dialog share-chooser"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <Mail aria-hidden="true" />
        <h2 id={titleId}>Share this page</h2>
        <p id={descriptionId}>
          {hasRecordings
            ? "Send a picture or a PDF. Voice recordings will be sent too, so they can be played."
            : "Send a picture or a PDF in Messages or Mail."}
        </p>
        <div className="share-chooser-actions">
          <button
            aria-label="Send this page as a picture in Messages or Mail"
            onClick={onSharePicture}
            ref={pictureRef}
            type="button"
          >
            Send as picture
          </button>
          <button
            aria-label="Send this page as a PDF document in Messages or Mail"
            onClick={onSharePdf}
            type="button"
          >
            Send as PDF
          </button>
          <button onClick={onCancel} type="button">
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
