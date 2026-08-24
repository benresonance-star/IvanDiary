import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TextObject } from "../domain/models";
import { TextCard } from "./TextCard";

const object: TextObject = {
  id: "text-1",
  type: "text",
  pageId: "page-1",
  position: { x: 0.2, y: 0.3 },
  frame: { width: 0.42, height: 0.24 },
  createdAt: "2026-08-14T09:00:00.000Z",
  revision: 2,
  text: "Original words",
  textScale: 1,
  textAlign: "left",
  layer: "above-sketch",
};

describe("TextCard", () => {
  it("opens the native editor without mutating text inline", () => {
    const onEdit = vi.fn();
    const onSave = vi.fn();
    render(
      <TextCard
        object={object}
        onEdit={onEdit}
        onSave={onSave}
        readOnly={false}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Edit journal text" }),
    );
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("retains inline editing as the browser fallback", () => {
    const onSave = vi.fn();
    render(<TextCard object={object} onSave={onSave} readOnly={false} />);
    const editor = screen.getByRole("textbox", { name: "Journal text" });

    fireEvent.change(editor, { target: { value: "Browser words" } });
    fireEvent.blur(editor);

    expect(onSave).toHaveBeenCalledWith({
      ...object,
      text: "Browser words",
      revision: 3,
    });
  });

  it("renders text as read-only in View mode", () => {
    const onEdit = vi.fn();
    render(
      <TextCard
        object={object}
        onEdit={onEdit}
        onSave={vi.fn()}
        readOnly
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Edit journal text" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Original words")).toHaveRole("paragraph");
  });

  it("preserves line returns between editing and viewing", () => {
    const multiline = "First line\n\nSecond paragraph\nThird line";
    const onSave = vi.fn();
    const { rerender } = render(
      <TextCard object={object} onSave={onSave} readOnly={false} />,
    );
    const editor = screen.getByRole("textbox", { name: "Journal text" });

    fireEvent.change(editor, { target: { value: multiline } });
    fireEvent.blur(editor);
    expect(onSave).toHaveBeenCalledWith({
      ...object,
      text: multiline,
      revision: 3,
    });

    rerender(
      <TextCard
        object={{ ...object, text: multiline }}
        onSave={onSave}
        readOnly
      />,
    );
    const viewed = screen.getByRole("paragraph");
    expect(viewed.textContent).toBe(multiline);
    expect(globalThis.getComputedStyle(viewed).whiteSpace).toBe("pre-wrap");
  });

  it("renders the selected text colour without replacing it", () => {
    render(
      <TextCard
        object={{ ...object, color: "#d02020" }}
        onSave={vi.fn()}
        readOnly
      />,
    );

    expect(screen.getByRole("paragraph")).toHaveStyle({ color: "#d02020" });
  });
});
