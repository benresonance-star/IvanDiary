import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ArrangeablePageObject } from "./ArrangeablePageObject";

describe("ArrangeablePageObject", () => {
  it("provides named move and resize controls", () => {
    const pageRef = createRef<HTMLDivElement>();
    const onCommit = vi.fn();
    render(
      <div ref={pageRef}>
        <ArrangeablePageObject
          arrange
          className="page-object"
          deleteDescription="Remember this"
          frame={{ width: 0.3, height: 0.2 }}
          objectLabel="text block"
          objectId="text-one"
          onCommit={onCommit}
          onDelete={vi.fn()}
          onSelect={vi.fn()}
          pageRef={pageRef}
          position={{ x: 0.2, y: 0.3 }}
          selected
          showShortcuts
        >
          <p>Remember this</p>
        </ArrangeablePageObject>
      </div>,
    );

    expect(
      screen.getByRole("button", { name: "Drag to move text block" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Drag to resize text block" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Make wider" }),
    ).toBeInTheDocument();
  });

  it("supports keyboard movement and resizing", () => {
    const pageRef = createRef<HTMLDivElement>();
    const onCommit = vi.fn();
    render(
      <div ref={pageRef}>
        <ArrangeablePageObject
          arrange
          className="page-object"
          deleteDescription="Remember this"
          frame={{ width: 0.3, height: 0.2 }}
          objectLabel="text block"
          objectId="text-one"
          onCommit={onCommit}
          onDelete={vi.fn()}
          onSelect={vi.fn()}
          pageRef={pageRef}
          position={{ x: 0.2, y: 0.3 }}
          selected
          showShortcuts
        >
          <p>Remember this</p>
        </ArrangeablePageObject>
      </div>,
    );

    const group = screen.getByRole("group", { name: /Arrow keys move/i });
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onCommit).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "move" }),
    );

    fireEvent.keyDown(group, { key: "ArrowDown", shiftKey: true });
    expect(onCommit).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "resize" }),
    );
  });

  it("hides shortcut buttons in simple mode", () => {
    const pageRef = createRef<HTMLDivElement>();
    render(
      <div ref={pageRef}>
        <ArrangeablePageObject
          arrange
          className="page-object"
          deleteDescription="holiday.jpg"
          frame={{ width: 0.3, height: 0.2 }}
          objectLabel="image"
          objectId="image-one"
          onCommit={vi.fn()}
          onDelete={vi.fn()}
          onSelect={vi.fn()}
          pageRef={pageRef}
          position={{ x: 0.2, y: 0.3 }}
          selected
          showShortcuts={false}
        >
          <span>Image</span>
        </ArrangeablePageObject>
      </div>,
    );

    expect(
      screen.queryByRole("button", { name: "Move left" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Drag to move image" }),
    ).toBeInTheDocument();
  });

  it("confirms deletion using the object's content", () => {
    const pageRef = createRef<HTMLDivElement>();
    const onDelete = vi.fn();
    render(
      <div ref={pageRef}>
        <ArrangeablePageObject
          arrange
          className="page-object"
          deleteDescription="A day at the beach"
          frame={{ width: 0.3, height: 0.2 }}
          objectLabel="text block"
          objectId="text-one"
          onCommit={vi.fn()}
          onDelete={onDelete}
          onSelect={vi.fn()}
          pageRef={pageRef}
          position={{ x: 0.2, y: 0.3 }}
          selected
          showShortcuts={false}
        >
          <p>A day at the beach</p>
        </ArrangeablePageObject>
      </div>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Delete text block" }),
    );
    expect(
      screen.getByText("Do you want to delete “A day at the beach”?"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
