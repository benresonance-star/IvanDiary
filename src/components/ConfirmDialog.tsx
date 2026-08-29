import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function ConfirmDialog({
  cancelLabel,
  children,
  confirmClassName,
  confirmLabel,
  dialogClassName,
  icon,
  onCancel,
  onConfirm,
  title,
}: {
  cancelLabel: string;
  children: ReactNode;
  confirmClassName?: string;
  confirmLabel: string;
  dialogClassName?: string;
  icon?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  title: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const invokingElementRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const activeElement = document.activeElement;
    invokingElementRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;
    cancelRef.current?.focus();

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
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
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
        className={`delete-dialog${dialogClassName ? ` ${dialogClassName}` : ""}`}
        ref={dialogRef}
        role="alertdialog"
        tabIndex={-1}
      >
        {icon}
        <h2 id={titleId}>{title}</h2>
        <div id={descriptionId}>{children}</div>
        <div className="delete-dialog-actions">
          <button onClick={onCancel} ref={cancelRef} type="button">
            {cancelLabel}
          </button>
          <button
            className={confirmClassName}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
