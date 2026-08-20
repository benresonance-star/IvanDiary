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
          layer="above-sketch"
          objectLabel="text block"
          objectId="text-one"
          onCommit={onCommit}
          onDelete={vi.fn()}
          onSelect={vi.fn()}
          onToggleLayer={vi.fn()}
          pageRef={pageRef}
          position={{ x: 0.2, y: 0.3 }}
          selected
          showShortcuts
        >
          <p>Remember this</p>
        </ArrangeablePageObject>
      </div>,
    );

    const moveControl = screen.getByRole("button", { name: "Drag to move text block" });
    expect(moveControl).toBeInTheDocument();
    expect(moveControl.closest(".arrange-controller-overlay")).toBeInTheDocument();
    expect(moveControl.closest("[data-object-id='text-one']")).toBeNull();
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
          layer="above-sketch"
          objectLabel="text block"
          objectId="text-one"
          onCommit={onCommit}
          onDelete={vi.fn()}
          onSelect={vi.fn()}
          onToggleLayer={vi.fn()}
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

  it("can hide the small shortcut buttons", () => {
    const pageRef = createRef<HTMLDivElement>();
    render(
      <div ref={pageRef}>
        <ArrangeablePageObject
          arrange
          className="page-object"
          deleteDescription="holiday.jpg"
          frame={{ width: 0.3, height: 0.2 }}
          layer="above-sketch"
          objectLabel="image"
          objectId="image-one"
          onCommit={vi.fn()}
          onDelete={vi.fn()}
          onSelect={vi.fn()}
          onToggleLayer={vi.fn()}
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

  it("toggles an object's position in front of or behind the sketch", () => {
    const pageRef = createRef<HTMLDivElement>();
    const onToggleLayer = vi.fn();
    render(
      <div ref={pageRef}>
        <ArrangeablePageObject
          arrange
          className="page-object"
          deleteDescription="holiday.jpg"
          frame={{ width: 0.3, height: 0.2 }}
          layer="above-sketch"
          objectLabel="image"
          objectId="image-one"
          onCommit={vi.fn()}
          onDelete={vi.fn()}
          onSelect={vi.fn()}
          onToggleLayer={onToggleLayer}
          pageRef={pageRef}
          position={{ x: 0.2, y: 0.3 }}
          selected
          showShortcuts={false}
        >
          <span>Image</span>
        </ArrangeablePageObject>
      </div>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Move behind sketch: image" }),
    );
    expect(onToggleLayer).toHaveBeenCalledOnce();
  });

  it("keeps photo proportions from the top-left control by default", () => {
    const pageRef = createRef<HTMLDivElement>();
    const onToggleAspectLock = vi.fn();
    render(
      <div ref={pageRef}>
        <ArrangeablePageObject
          arrange
          aspectLock
          aspectRatio={1}
          className="page-object photo-object"
          deleteDescription="holiday.jpg"
          frame={{ width: 0.4, height: 0.4 }}
          layer="above-sketch"
          maximumFrame={{ width: 0.94, height: 0.76 }}
          objectLabel="image"
          objectId="image-one"
          onCommit={vi.fn()}
          onDelete={vi.fn()}
          onSelect={vi.fn()}
          onToggleAspectLock={onToggleAspectLock}
          onToggleLayer={vi.fn()}
          pageRef={pageRef}
          position={{ x: 0.2, y: 0.3 }}
          selected
          showShortcuts={false}
        >
          <span>Image</span>
        </ArrangeablePageObject>
      </div>,
    );

    const lock = screen.getByRole("button", {
      name: "Keep photo proportions. On",
    });
    expect(lock).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(lock);
    expect(onToggleAspectLock).toHaveBeenCalledOnce();
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
          layer="above-sketch"
          objectLabel="text block"
          objectId="text-one"
          onCommit={vi.fn()}
          onDelete={onDelete}
          onSelect={vi.fn()}
          onToggleLayer={vi.fn()}
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
