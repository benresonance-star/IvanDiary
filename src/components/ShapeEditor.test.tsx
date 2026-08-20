import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ShapeObject } from "../domain/models";
import { ShapeEditor } from "./ShapeEditor";

const shape: ShapeObject = {
  id: "shape-1", pageId: "page-1", type: "shape", shapeKind: "triangle",
  position: { x: 0.2, y: 0.2 }, frame: { width: 0.24, height: 0.24 },
  fillColor: "#d9a441", outlineColor: "#3f3528", outlineWidth: 3,
  rotationDegrees: 0, revision: 0, createdAt: "2026-08-19T00:00:00.000Z",
};

function renderEditor(value: ShapeObject = shape, snapShapes: ShapeObject[] = []) {
  const page = document.createElement("div");
  vi.spyOn(page, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON: () => ({}) });
  const props = {
    arrange: true, canMoveDown: true, canMoveUp: true, onDelete: vi.fn(), onDeselect: vi.fn(), onDuplicate: vi.fn(),
    onMoveDown: vi.fn(), onMoveUp: vi.fn(), onSelect: vi.fn(), onUpdate: vi.fn(),
    pageRef: { current: page }, selected: true, shape: value, snapShapes, stackIndex: 2,
  };
  const view = render(<ShapeEditor {...props} />);
  return { ...props, rerenderEditor: (next: ShapeObject) => view.rerender(<ShapeEditor {...props} shape={next} />) };
}

describe("ShapeEditor", () => {
  it("shows the plain-English command stack without the legacy edit handles", () => {
    renderEditor();
    const toolbar = screen.getByRole("toolbar", { name: "Shape editing commands" });
    expect(within(toolbar).getByRole("button", { name: "Move" })).toHaveAttribute("aria-pressed", "true");
    expect(within(toolbar).getByRole("button", { name: "Rotate" })).toBeVisible();
    expect(within(toolbar).getByRole("button", { name: "Scale" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Drag to resize/ })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: /triangle shape/ })).toHaveStyle({ zIndex: 22 });
    expect(screen.getByRole("button", { name: "Vertex 1" }).closest(".shape-controller-overlay")).toHaveStyle({ zIndex: 850 });
    expect(within(toolbar).getByRole("button", { name: "Move" }).parentElement).toHaveClass("shape-edit-mode-group");
    expect(within(toolbar).getByRole("button", { name: "Add a vertex" }).parentElement).toHaveClass("shape-edit-grid");
  });

  it("renders a behind-sketch shape below the drawing surface", () => {
    renderEditor({ ...shape, layer: "behind-sketch" });
    const editor = screen.getByRole("group", { name: /triangle shape/ });
    expect(editor).toHaveClass("behind-sketch");
    expect(editor).toHaveStyle({ zIndex: 0 });
  });

  it("lets keyboard users place the palette and keeps that fixed position", () => {
    renderEditor();
    const toolbar = screen.getByRole("toolbar", { name: "Shape editing commands" });
    const handle = screen.getByRole("button", { name: "Move shape editing palette" });
    const before = Number(toolbar.style.left.replace("px", ""));
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(Number(toolbar.style.left.replace("px", ""))).toBeGreaterThan(before);
  });

  it("uses the user-set palette position when switching between mounted shapes", () => {
    const page = document.createElement("div");
    vi.spyOn(page, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON: () => ({}) });
    const common = {
      arrange: true, canMoveDown: true, canMoveUp: true, onDelete: vi.fn(), onDeselect: vi.fn(), onDuplicate: vi.fn(),
      onMoveDown: vi.fn(), onMoveUp: vi.fn(), onSelect: vi.fn(), onUpdate: vi.fn(), pageRef: { current: page }, snapShapes: [], stackIndex: 1,
    };
    const second = { ...shape, id: "shape-2", position: { x: .65, y: .55 } };
    const view = render(<><ShapeEditor {...common} key="shape-1" selected shape={shape} /><ShapeEditor {...common} key="shape-2" selected={false} shape={second} /></>);
    fireEvent.keyDown(screen.getByRole("button", { name: "Move shape editing palette" }), { key: "ArrowRight", shiftKey: true });
    const placed = screen.getByRole("toolbar", { name: "Shape editing commands" }).getAttribute("style");

    view.rerender(<><ShapeEditor {...common} key="shape-1" selected={false} shape={shape} /><ShapeEditor {...common} key="shape-2" selected shape={second} /></>);
    expect(screen.getByRole("toolbar", { name: "Shape editing commands" })).toHaveAttribute("style", placed);
  });

  it("temporarily hides editing UI when arrange interaction is suspended", () => {
    const page = document.createElement("div");
    const props = {
      arrange: true, canMoveDown: true, canMoveUp: true, onDelete: vi.fn(), onDeselect: vi.fn(), onDuplicate: vi.fn(),
      onMoveDown: vi.fn(), onMoveUp: vi.fn(), onSelect: vi.fn(), onUpdate: vi.fn(), pageRef: { current: page }, selected: true, shape, snapShapes: [], stackIndex: 1,
    };
    const view = render(<ShapeEditor {...props} />);
    expect(screen.getByRole("toolbar", { name: "Shape editing commands" })).toBeInTheDocument();

    view.rerender(<ShapeEditor {...props} arrange={false} />);
    expect(screen.queryByRole("toolbar", { name: "Shape editing commands" })).not.toBeInTheDocument();

    view.rerender(<ShapeEditor {...props} />);
    expect(screen.getByRole("toolbar", { name: "Shape editing commands" })).toBeInTheDocument();
  });

  it("moves an expanded colour palette upward to keep its bottom visible", () => {
    renderEditor();
    const toolbar = screen.getByRole("toolbar", { name: "Shape editing commands" });
    let paletteHeight = 200;
    vi.spyOn(toolbar, "getBoundingClientRect").mockImplementation(() => ({
      x: 0, y: 0, left: 0, top: 0, right: 174, bottom: paletteHeight,
      width: 174, height: paletteHeight, toJSON: () => ({}),
    }));
    const handle = screen.getByRole("button", { name: "Move shape editing palette" });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 22, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(handle, { pointerId: 22, clientX: 100, clientY: globalThis.innerHeight - 10 });
    fireEvent.pointerUp(handle, { pointerId: 22 });
    const collapsedTop = Number(toolbar.style.top.replace("px", ""));

    paletteHeight = 500;
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    expect(Number(toolbar.style.top.replace("px", ""))).toBeLessThan(collapsedTop);
    expect(Number(toolbar.style.top.replace("px", "")) + paletteHeight).toBeLessThanOrEqual(globalThis.innerHeight - 12);
  });

  it("provides help topics for every command", () => {
    renderEditor();
    for (const name of ["Move", "Rotate", "Scale", "Look", "Add a vertex", "Delete selected vertex", "Move shape up one layer", "Move shape down one layer", /Snap/, "Duplicate", "Delete"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("data-help-topic");
    }
  });

  it("snaps a dragged vertex to a nearby node on another shape", () => {
    const target = { ...shape, id: "target-shape", shapeKind: "rectangle" as const, position: { x: .5, y: .2 } };
    const { onUpdate } = renderEditor(shape, [target]);
    const snapButton = screen.getByRole("button", { name: /Snap (On|Off)/ });
    if (snapButton.textContent === "Snap Off") fireEvent.click(snapButton);
    const firstVertex = screen.getByRole("button", { name: "Vertex 1" });
    fireEvent.pointerDown(firstVertex, { button: 0, pointerId: 30, clientX: 320, clientY: 170 });
    fireEvent.pointerMove(firstVertex, { pointerId: 30, clientX: 500, clientY: 170 });
    fireEvent.pointerUp(firstVertex, { pointerId: 30, clientX: 500, clientY: 170 });
    const updated = onUpdate.mock.calls[0]?.[0] as ShapeObject;
    const snapped = updated.points![0]!;
    expect(updated.position.x + updated.frame!.width * snapped.x).toBeCloseTo(.512);
    expect(updated.position.y + updated.frame!.height * snapped.y).toBeCloseTo(.212);
  });

  it("rotates by keyboard without resizing the frame", () => {
    const { onUpdate } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    fireEvent.keyDown(screen.getByRole("group", { name: /triangle shape/ }), { key: "ArrowRight" });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ rotationDegrees: 5, frame: shape.frame }), shape);
  });

  it("commits the latest drag position even when pointer-up follows immediately", () => {
    const { onUpdate } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    const editor = screen.getByRole("group", { name: /triangle shape/ });
    fireEvent.pointerDown(editor, { button: 0, pointerId: 4, clientX: 250, clientY: 250 });
    fireEvent.pointerMove(editor, { pointerId: 4, clientX: 350, clientY: 290 });
    fireEvent.pointerUp(editor, { pointerId: 4, clientX: 350, clientY: 290 });
    const updated = onUpdate.mock.calls[0]?.[0];
    expect(updated?.position.x).toBeCloseTo(.3);
    expect(updated?.position.y).toBeCloseTo(.25);
  });

  it.each(["Move", "Rotate", "Scale"])("moves only the vertex while %s mode is selected", (mode) => {
    const { onUpdate } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: mode }));
    const firstVertex = screen.getByRole("button", { name: "Vertex 1" });
    fireEvent.pointerDown(firstVertex, { button: 0, pointerId: 16, clientX: 320, clientY: 170 });
    fireEvent.pointerMove(firstVertex, { pointerId: 16, clientX: 340, clientY: 180 });
    fireEvent.pointerUp(firstVertex, { pointerId: 16, clientX: 340, clientY: 180 });

    const updated = onUpdate.mock.calls[0]?.[0] as ShapeObject;
    expect(updated.points?.[0]).not.toEqual(shape.points?.[0]);
    expect(updated.position).toEqual(shape.position);
    expect(updated.frame).toEqual(shape.frame);
    expect(updated.rotationDegrees).toBe(shape.rotationDegrees);
  });

  it("keeps a moved vertex in place until the asynchronous saved revision arrives", () => {
    const editorProps = renderEditor();
    const firstVertex = screen.getByRole("button", { name: "Vertex 1" });
    fireEvent.pointerDown(firstVertex, { button: 0, pointerId: 7, clientX: 320, clientY: 176 });
    fireEvent.pointerMove(firstVertex, { pointerId: 7, clientX: 368, clientY: 208 });
    fireEvent.pointerUp(firstVertex, { pointerId: 7, clientX: 368, clientY: 208 });

    const committed = editorProps.onUpdate.mock.calls[0]?.[0] as ShapeObject;
    expect(committed.points?.[0]).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));

    editorProps.rerenderEditor(shape);
    expect(screen.getByRole("button", { name: "Vertex 1" })).toHaveStyle({
      left: `${committed.points![0]!.x * 100}%`,
      top: `${committed.points![0]!.y * 100}%`,
    });

    editorProps.rerenderEditor(committed);
    expect(screen.getByRole("button", { name: "Vertex 1" })).toHaveStyle({
      left: `${committed.points![0]!.x * 100}%`,
      top: `${committed.points![0]!.y * 100}%`,
    });
  });

  it("expands the shape frame when a vertex moves beyond its original bounds", () => {
    const { onUpdate } = renderEditor();
    const firstVertex = screen.getByRole("button", { name: "Vertex 1" });
    fireEvent.pointerDown(firstVertex, { button: 0, pointerId: 9, clientX: 320, clientY: 176 });
    fireEvent.pointerMove(firstVertex, { pointerId: 9, clientX: -500, clientY: -500 });
    fireEvent.pointerUp(firstVertex, { pointerId: 9, clientX: -500, clientY: -500 });
    const updated = onUpdate.mock.calls[0]?.[0] as ShapeObject;
    expect(updated.frame!.width).toBeGreaterThan(shape.frame!.width);
    expect(updated.frame!.height).toBeGreaterThan(shape.frame!.height);
    expect(updated.position.x).toBeLessThan(shape.position.x);
    expect(updated.position.y).toBeLessThan(shape.position.y);
    expect(updated.position.x).toBeCloseTo(.03);
    expect(updated.position.y).toBeCloseTo(.04);
  });

  it("keeps the current delete target visibly selected", () => {
    renderEditor({ ...shape, shapeKind: "cross" });
    const secondVertex = screen.getByRole("button", { name: "Vertex 2" });
    fireEvent.click(secondVertex);
    expect(secondVertex).toHaveClass("selected");
    expect(secondVertex).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Delete selected vertex" })).toBeEnabled();
  });

  it("adds an edge vertex and converts a fixed shape to a polygon", () => {
    const { onUpdate } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Add a vertex" }));
    fireEvent.click(screen.getByRole("button", { name: "Add vertex on edge 1" }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ shapeKind: "polygon", points: expect.arrayContaining([expect.objectContaining({ x: .725, y: .5 })]) }), shape);
  });

  it("disables vertex controls for circles", () => {
    const { onUpdate } = renderEditor({ ...shape, shapeKind: "circle" });
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(screen.getByRole("button", { name: "Add a vertex" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete selected vertex" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Vertex 1/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scale circle" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scale" }));
    const scale = screen.getByRole("button", { name: "Scale circle" });
    fireEvent.pointerDown(scale, { button: 0, pointerId: 12, clientX: 430, clientY: 256 });
    fireEvent.pointerMove(scale, { pointerId: 12, clientX: 540, clientY: 256 });
    fireEvent.pointerUp(scale, { pointerId: 12, clientX: 540, clientY: 256 });
    expect(onUpdate.mock.calls[0]?.[0].frame.width).toBeGreaterThan(shape.frame!.width);
  });

  it("uses two opposite corners to resize a rectangle without converting it to a polygon", () => {
    const rectangle = { ...shape, shapeKind: "rectangle" as const };
    const { onUpdate } = renderEditor(rectangle);
    expect(screen.getAllByRole("button", { name: /Vertex \d/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Add a vertex" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("button", { name: "Vertex 1" }), { key: "ArrowLeft" });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ shapeKind: "rectangle", points: expect.any(Array) }), rectangle);
    expect(onUpdate.mock.calls[0]?.[0].points).toHaveLength(2);
    expect(onUpdate.mock.calls[0]?.[0].frame.width).toBeLessThan(rectangle.frame!.width);
    expect(onUpdate.mock.calls[0]?.[0].points).toEqual(expect.arrayContaining([
      expect.objectContaining({ x: 0, y: 0 }),
      expect.objectContaining({ x: 1, y: 1 }),
    ]));
  });

  it("expands colour controls and delegates ordering, duplication, and confirmed deletion", () => {
    const props = renderEditor();
    const look = screen.getByRole("button", { name: "Look" });
    if (look.getAttribute("aria-expanded") !== "true") fireEvent.click(look);
    expect(screen.getByRole("slider", { name: "Shape outline thickness" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "No Outline" }));
    expect(props.onUpdate).toHaveBeenCalledWith(expect.objectContaining({ outlineColor: undefined }), shape);
    fireEvent.click(screen.getByRole("button", { name: "Move shape up one layer" }));
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(props.onMoveUp).toHaveBeenCalledOnce();
    expect(props.onDuplicate).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("alertdialog", { name: /Delete triangle shape/ });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalledOnce();
  });

  it("retains mode and Look visibility when selecting another mounted shape", () => {
    const page = document.createElement("div");
    const common = {
      arrange: true, canMoveDown: true, canMoveUp: true, onDelete: vi.fn(), onDeselect: vi.fn(), onDuplicate: vi.fn(),
      onMoveDown: vi.fn(), onMoveUp: vi.fn(), onSelect: vi.fn(), onUpdate: vi.fn(), pageRef: { current: page }, snapShapes: [], stackIndex: 1,
    };
    const second = { ...shape, id: "shape-2" };
    const view = render(<><ShapeEditor {...common} key="first" selected shape={shape} /><ShapeEditor {...common} key="second" selected={false} shape={second} /></>);
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    const look = screen.getByRole("button", { name: "Look" });
    if (look.getAttribute("aria-expanded") !== "true") fireEvent.click(look);

    view.rerender(<><ShapeEditor {...common} key="first" selected={false} shape={shape} /><ShapeEditor {...common} key="second" selected shape={second} /></>);
    expect(screen.getByRole("button", { name: "Rotate" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Look" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("slider", { name: "Shape outline thickness" })).toBeVisible();
  });
});
