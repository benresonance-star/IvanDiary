import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./ConfirmDialog";

function DialogHarness({ onConfirm = vi.fn() }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Remove item
      </button>
      {open ? (
        <ConfirmDialog
          cancelLabel="Keep item"
          confirmClassName="confirm-delete"
          confirmLabel="Delete item"
          onCancel={() => setOpen(false)}
          onConfirm={onConfirm}
          title="Delete this item?"
        >
          <p>This cannot be undone.</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

describe("ConfirmDialog", () => {
  it("portals a labelled alertdialog and initially focuses cancel", () => {
    const { container } = render(<DialogHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Remove item" }));

    const dialog = screen.getByRole("alertdialog", {
      name: "Delete this item?",
      description: "This cannot be undone.",
    });
    expect(document.body).toContainElement(dialog);
    expect(container).not.toContainElement(dialog);
    expect(screen.getByRole("button", { name: "Keep item" })).toHaveFocus();
  });

  it("traps forward and reverse Tab navigation", () => {
    render(<DialogHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Remove item" }));

    const cancel = screen.getByRole("button", { name: "Keep item" });
    const confirm = screen.getByRole("button", { name: "Delete item" });
    confirm.focus();
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(cancel).toHaveFocus();

    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();
  });

  it("closes on Escape and restores focus to the invoking control", () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Remove item" });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes only when the backdrop itself is clicked", () => {
    render(<DialogHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Remove item" }));

    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(dialog);
    expect(dialog).toBeInTheDocument();

    fireEvent.click(document.querySelector(".delete-dialog-backdrop")!);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
