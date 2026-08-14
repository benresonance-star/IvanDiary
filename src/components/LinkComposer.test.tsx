import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LinkComposer } from "./JournalPage";

describe("LinkComposer", () => {
  it("edits an existing link name and address", () => {
    const onSave = vi.fn();
    render(
      <LinkComposer
        initialTitle="Family photos"
        initialUrl="https://example.com/old"
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Edit web link" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Holiday photos" },
    });
    fireEvent.change(screen.getByLabelText("Web address"), {
      target: { value: "https://example.com/new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith(
      "https://example.com/new",
      "Holiday photos",
    );
  });

  it("renders as a modal above the canvas and blocks canvas interaction", () => {
    const onClose = vi.fn();
    render(
      <LinkComposer
        onClose={onClose}
        onSave={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Add a web link" });
    expect(dialog.parentElement).toHaveClass("link-composer-backdrop");
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
