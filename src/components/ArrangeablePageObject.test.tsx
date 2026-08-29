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
    expect(moveControl.closest(".arrange-controller-overlay")).not.toHaveClass(
      "controls-near-top",
      "controls-near-right",
      "controls-near-bottom",
      "controls-near-left",
    );
  });

  it("keeps an optimistic drag position through stale and intermediate parent rerenders", () => {
    const pageRef = createRef<HTMLDivElement>();
    const onCommit = vi.fn();
    const object = (position = { x: 0.2, y: 0.3 }) => (
      <div ref={pageRef}>
        <ArrangeablePageObject
          arrange
          className="page-object"
          frame={{ width: 0.3, height: 0.2 }}
          layer="above-sketch"
          objectLabel="text block"
          objectId="text-drag"
          onCommit={onCommit}
          onSelect={vi.fn()}
          pageRef={pageRef}
          position={position}
          selected
          showShortcuts={false}
        >
          <p>Move me</p>
        </ArrangeablePageObject>
      </div>
    );
    const view = render(object());
    vi.spyOn(pageRef.current!, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800,
      width: 1000, height: 800, toJSON: () => ({}),
    });
    const move = screen.getByRole("button", { name: "Drag to move text block" });
    fireEvent.pointerDown(move, {
      button: 0, pointerId: 9, clientX: 200, clientY: 240,
    });
    fireEvent.pointerMove(move, {
      pointerId: 9, clientX: 300, clientY: 320,
    });
    fireEvent.pointerUp(move, { pointerId: 9 });

    const frame = document.querySelector<HTMLElement>('[data-object-id="text-drag"]')!;
    expect(Number.parseFloat(frame.style.left)).toBeCloseTo(30);
    view.rerender(object({ x: 0.21, y: 0.31 }));
    expect(Number.parseFloat(frame.style.left)).toBeCloseTo(30);
    view.rerender(object({ x: 0.3, y: 0.4 }));
    expect(Number.parseFloat(frame.style.left)).toBeCloseTo(30);
    expect(onCommit).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Move left" })).not.toBeInTheDocument();
  });

  it("flips docked text controls inward and expands from fixed edges", () => {
    const pageRef = createRef<HTMLDivElement>();
    const onCommit = vi.fn();
    render(
      <div ref={pageRef}>
        <ArrangeablePageObject
          adaptiveEdgeControls
          arrange
          className="page-object canvas-text-stack"
          frame={{ width: 0.3, height: 0.2 }}
          layer="above-sketch"
          objectLabel="text block"
          objectId="text-1"
          onCommit={onCommit}
          onSelect={vi.fn()}
          pageRef={pageRef}
          position={{ x: 0.67, y: 0.76 }}
          selected
          showShortcuts={false}
        >
          <p>Edge words</p>
        </ArrangeablePageObject>
      </div>,
    );
    vi.spyOn(pageRef.current!, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800,
      width: 1000, height: 800, toJSON: () => ({}),
    });

    const resize = screen.getByRole("button", {
      name: "Drag to resize text block",
    });
    const overlay = resize.closest(".arrange-controller-overlay");
    expect(overlay).toHaveClass("controls-near-right", "controls-near-bottom");
    expect(overlay).toHaveAttribute("data-resize-horizontal", "left");
    expect(overlay).toHaveAttribute("data-resize-vertical", "top");

    fireEvent.pointerDown(resize, {
      button: 0,
      pointerId: 7,
      clientX: 670,
      clientY: 608,
    });
    fireEvent.pointerMove(resize, {
      pointerId: 7,
      clientX: 570,
      clientY: 528,
    });
    fireEvent.pointerUp(resize, { pointerId: 7 });

    expect(onCommit).toHaveBeenCalledOnce();
    const change = onCommit.mock.calls[0]![0];
    expect(change.kind).toBe("resize");
    expect(change.before).toEqual({
      position: { x: 0.67, y: 0.76 },
      frame: { width: 0.3, height: 0.2 },
    });
    expect(change.after.position.x).toBeCloseTo(0.57);
    expect(change.after.position.y).toBeCloseTo(0.66);
    expect(change.after.frame.width).toBeCloseTo(0.4);
    expect(change.after.frame.height).toBeCloseTo(0.3);
  });

  it("keeps adaptive move and resize controls inside a top-edge text block", () => {
    const pageRef = createRef<HTMLDivElement>();
    render(
      <div ref={pageRef}>
        <ArrangeablePageObject
          adaptiveEdgeControls
          arrange
          className="page-object canvas-text-stack"
          frame={{ width: 0.5, height: 0.4 }}
          layer="above-sketch"
          objectLabel="text block"
          objectId="text-1"
          onCommit={vi.fn()}
          onSelect={vi.fn()}
          pageRef={pageRef}
          position={{ x: 0.2, y: 0.04 }}
          selected
          showShortcuts
        >
          <p>Top words</p>
        </ArrangeablePageObject>
      </div>,
    );

    const move = screen.getByRole("button", {
      name: "Drag to move text block",
    });
    const overlay = move.closest(".arrange-controller-overlay");
    expect(overlay).toHaveClass("adaptive-edge-controls", "controls-near-top");
    expect(overlay).toHaveAttribute("data-resize-horizontal", "right");
    expect(overlay).toHaveAttribute("data-resize-vertical", "bottom");
    expect(screen.getByRole("button", {
      name: "Drag to resize text block",
    })).toBeInTheDocument();
    expect(screen.getByLabelText("Adjust text block").closest(
      ".controls-near-top",
    )).toBe(overlay);
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

  it("toggles accessible move controls when the move handle is tapped", () => {
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
          pageRef={pageRef}
          position={{ x: 0.68, y: 0.02 }}
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
    const moveHandle = screen.getByRole("button", { name: "Drag to move image" });
    expect(moveHandle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(moveHandle);
    expect(screen.getByRole("button", { name: "Move left" })).toBeVisible();
    expect(moveHandle.closest(".arrange-controller-overlay")).toHaveClass(
      "nudge-near-top",
      "nudge-near-right",
    );
    expect(moveHandle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(moveHandle);
    expect(screen.queryByRole("button", { name: "Move left" })).not.toBeInTheDocument();
  });

  it("keeps stacked objects under the drawing layer and does not offer a vs-ink toggle", () => {
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
          pageRef={pageRef}
          position={{ x: 0.2, y: 0.3 }}
          selected
          showShortcuts={false}
          stackIndex={3}
        >
          <span>Image</span>
        </ArrangeablePageObject>
        <ArrangeablePageObject
          arrange
          className="page-object canvas-text-stack"
          frame={{ width: 0.8, height: 0.7 }}
          layer="behind-sketch"
          objectLabel="text block"
          objectId="text-1"
          onCommit={vi.fn()}
          onSelect={vi.fn()}
          pageRef={pageRef}
          position={{ x: 0.1, y: 0.12 }}
          selected={false}
          showShortcuts={false}
          stackIndex={3}
        >
          <p>Stacked words</p>
        </ArrangeablePageObject>
      </div>,
    );

    expect(screen.queryByRole("button", { name: /sketch: / })).not.toBeInTheDocument();
    expect(screen.getByText("Image").parentElement).toHaveStyle({ zIndex: 4 });
    expect(screen.getByText("Stacked words").parentElement).toHaveStyle({
      zIndex: 4,
    });
  });

  it("stacks over-ink objects above the drawing preview band", () => {
    const pageRef = createRef<HTMLDivElement>();
    render(
      <div ref={pageRef}>
        <ArrangeablePageObject
          arrange
          className="page-object"
          frame={{ width: 0.3, height: 0.2 }}
          inFrontOfSketch
          layer="above-sketch"
          objectLabel="image"
          objectId="image-front"
          onCommit={vi.fn()}
          onSelect={vi.fn()}
          pageRef={pageRef}
          position={{ x: 0.2, y: 0.3 }}
          selected={false}
          showShortcuts={false}
          stackIndex={1}
        >
          <span>Front image</span>
        </ArrangeablePageObject>
      </div>,
    );
    expect(screen.getByText("Front image").parentElement).toHaveStyle({
      zIndex: 46,
    });
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
