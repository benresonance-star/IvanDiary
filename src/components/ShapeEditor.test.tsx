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
  const adjust = screen.getByRole("button", { name: "Adjust" });
  if (adjust.getAttribute("aria-pressed") !== "true") fireEvent.click(adjust);
  const move = screen.getByRole("button", { name: "Move" });
  if (move.getAttribute("aria-pressed") !== "true") fireEvent.click(move);
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
    expect(within(toolbar).getByRole("button", { name: "Add a vertex" }).parentElement).toHaveClass("shape-point-actions");
  });

  it.each(["Move", "Rotate", "Scale", "Sort"] as const)("connects %s mode to its semantic adaptive controller", (mode) => {
    renderEditor();
    const modeButton = screen.getByRole("button", { name: mode });
    fireEvent.click(modeButton);

    const controller = screen.getByRole("group", { name: `${mode} controls` });
    expect(modeButton).toHaveAttribute("aria-pressed", "true");
    expect(modeButton.closest(".shape-adjust-workspace")).toContainElement(controller);
    expect(controller).toHaveClass(`shape-adjustment-${mode.toLowerCase()}`);
    expect(controller.querySelector(".shape-active-mode-label")).not.toBeInTheDocument();
  });

  it("switches modes without synchronously remeasuring the palette", () => {
    renderEditor();
    const toolbar = screen.getByRole("toolbar", { name: "Shape editing commands" });
    const measurePalette = vi.spyOn(toolbar, "getBoundingClientRect");

    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));

    expect(screen.getByRole("group", { name: "Rotate controls" })).toBeVisible();
    expect(measurePalette).not.toHaveBeenCalled();
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

  it("uses the compact title area as the move handle", () => {
    renderEditor();
    const toolbar = screen.getByRole("toolbar", { name: "Shape editing commands" });
    const titleHandle = screen.getByRole("button", { name: "Move shape editing palette" });

    expect(titleHandle).toHaveClass("shape-palette-heading-drag");
    expect(titleHandle).toHaveTextContent("triangle");
    expect(titleHandle).not.toHaveTextContent("shape selected");
    expect(screen.queryByRole("button", { name: "Finish editing shape" })).not.toBeInTheDocument();
    expect(toolbar).toContainElement(titleHandle);
  });

  it("moves the palette with a transform and commits its position on release", () => {
    renderEditor();
    const toolbar = screen.getByRole("toolbar", { name: "Shape editing commands" });
    const handle = screen.getByRole("button", { name: "Move shape editing palette" });
    vi.spyOn(toolbar, "getBoundingClientRect").mockReturnValue({
      x: 100, y: 100, left: 100, top: 100, right: 368, bottom: 500,
      width: 268, height: 400, toJSON: () => ({}),
    });
    const animationFrame = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });

    fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: 120, clientY: 120 });
    const leftBeforeMove = toolbar.style.left;
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 180, clientY: 155 });
    expect(toolbar.style.left).toBe(leftBeforeMove);
    expect(toolbar.style.transform).toBe("translate3d(60px, 35px, 0)");
    fireEvent.pointerUp(handle, { pointerId: 7, clientX: 180, clientY: 155 });
    expect(toolbar.style.transform).toBe("");
    expect(toolbar.style.left).toBe("160px");
    expect(toolbar.style.top).toBe("135px");
    animationFrame.mockRestore();
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

  it("moves the Style palette upward to keep its bottom visible", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Style" }));
    expect(Number(toolbar.style.top.replace("px", ""))).toBeLessThan(collapsedTop);
    expect(Number(toolbar.style.top.replace("px", "")) + paletteHeight).toBeLessThanOrEqual(globalThis.innerHeight - 12);
  });

  it("provides help topics for every command", () => {
    renderEditor();
    for (const name of ["Adjust", "Style", "Move", "Rotate", "Scale", "Sort", "Add a vertex", "Delete selected vertex", /Snap/, "Make a copy", "Delete"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("data-help-topic");
    }
    fireEvent.click(screen.getByRole("button", { name: "Sort" }));
    for (const name of ["Move shape up one layer", "Move shape down one layer"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("data-help-topic");
    }
  });

  it("snaps a dragged vertex to a nearby node on another shape", () => {
    const target = { ...shape, id: "target-shape", shapeKind: "rectangle" as const, position: { x: .5, y: .2 } };
    const { onUpdate } = renderEditor(shape, [target]);
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
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

  it("uses arrow keys to move the canvas shape even when Rotate is selected", () => {
    const { onUpdate } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    fireEvent.keyDown(screen.getByRole("group", { name: /triangle shape/ }), { key: "ArrowRight" });
    const updated = onUpdate.mock.calls[0]?.[0] as ShapeObject;
    expect(updated.position.x).toBeCloseTo(.215);
    expect(updated.position.y).toBeCloseTo(.2);
    expect(updated.rotationDegrees).toBe(0);
    expect(updated.frame).toEqual(shape.frame);
  });

  it("offers large on-screen adjustments without requiring a drag", () => {
    const { onUpdate } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    fireEvent.click(screen.getByRole("button", { name: "Move shape right" }));
    expect(onUpdate.mock.calls[0]?.[0].position.x).toBeCloseTo(.215);
    expect(onUpdate.mock.calls[0]?.[0].position.y).toBeCloseTo(.2);

    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate shape clockwise" }));
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ rotationDegrees: 5 }), shape);
  });

  it("keeps each Style colour and its toggle in a compact row", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Style" }));
    const fillPicker = screen.getByLabelText("Shape fill colour");
    const outlinePicker = screen.getByLabelText("Shape outline colour");
    expect(fillPicker.closest(".shape-colour-row")).toContainElement(
      screen.getByRole("button", { name: "No Fill" }),
    );
    expect(outlinePicker.closest(".shape-colour-row")).toContainElement(
      screen.getByRole("button", { name: "No Outline" }),
    );
    expect(screen.getByLabelText("Shape outline thickness").closest("label"))
      .toHaveClass("shape-thickness-control");
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

  it.each(["Rotate", "Scale", "Sort"])("keeps canvas dragging as Move while %s controls are selected", (mode) => {
    const { onUpdate } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: mode }));
    const editor = screen.getByRole("group", { name: /triangle shape/ });
    fireEvent.pointerDown(editor, { button: 0, pointerId: 40, clientX: 250, clientY: 250 });
    fireEvent.pointerMove(editor, { pointerId: 40, clientX: 300, clientY: 290 });
    fireEvent.pointerUp(editor, { pointerId: 40, clientX: 300, clientY: 290 });

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      position: { x: .25, y: .25 },
      frame: shape.frame,
      rotationDegrees: 0,
    }), shape);
  });

  it("does not let an earlier save acknowledgement reset a newer drag", () => {
    const props = renderEditor({ ...shape, id: "duplicated-shape", revision: 0 });
    const editor = screen.getByRole("group", { name: /triangle shape/ });

    fireEvent.pointerDown(editor, { button: 0, pointerId: 20, clientX: 250, clientY: 250 });
    fireEvent.pointerMove(editor, { pointerId: 20, clientX: 300, clientY: 250 });
    fireEvent.pointerUp(editor, { pointerId: 20, clientX: 300, clientY: 250 });
    const firstSaved = props.onUpdate.mock.calls[0]?.[0] as ShapeObject;

    fireEvent.pointerDown(editor, { button: 0, pointerId: 21, clientX: 300, clientY: 250 });
    fireEvent.pointerMove(editor, { pointerId: 21, clientX: 380, clientY: 290 });
    props.rerenderEditor(firstSaved);
    expect(screen.getByRole("group", { name: /triangle shape/ })).toHaveStyle({
      left: "33%",
      top: "25%",
    });
    fireEvent.pointerUp(screen.getByRole("group", { name: /triangle shape/ }), {
      pointerId: 21,
      clientX: 380,
      clientY: 290,
    });

    const secondSaved = props.onUpdate.mock.calls[1]?.[0] as ShapeObject;
    expect(secondSaved.position.x).toBeCloseTo(.33);
    expect(secondSaved.position.y).toBeCloseTo(.25);
    expect(secondSaved.revision).toBeGreaterThan(firstSaved.revision);
  });

  it.each(["Move", "Rotate", "Scale", "Sort"])("moves only the vertex while %s mode is selected", (mode) => {
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

  it("scales circles only from the palette and hides vertex controls", () => {
    const { onUpdate } = renderEditor({ ...shape, shapeKind: "circle" });
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(screen.queryByRole("button", { name: "Add a vertex" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete selected vertex" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Vertex 1/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Stretch circle horizontally/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scale" }));
    expect(screen.queryByRole("button", { name: /Stretch circle/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make shape larger" }));
    expect(onUpdate.mock.calls[0]?.[0].frame.width).toBeGreaterThan(shape.frame!.width);
    expect(onUpdate.mock.calls[0]?.[0].frame.height).toBeGreaterThan(shape.frame!.height);
  });

  it("uses two opposite corners to resize a rectangle without converting it to a polygon", () => {
    const rectangle = { ...shape, shapeKind: "rectangle" as const };
    const { onUpdate } = renderEditor(rectangle);
    expect(screen.getAllByRole("button", { name: /Vertex \d/ })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Add a vertex" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "Vertex 1" }), { key: "ArrowLeft" });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ shapeKind: "rectangle", points: expect.any(Array) }), rectangle);
    expect(onUpdate.mock.calls[0]?.[0].points).toHaveLength(2);
    expect(onUpdate.mock.calls[0]?.[0].frame.width).toBeLessThan(rectangle.frame!.width);
    expect(onUpdate.mock.calls[0]?.[0].points).toEqual(expect.arrayContaining([
      expect.objectContaining({ x: 0, y: 0 }),
      expect.objectContaining({ x: 1, y: 1 }),
    ]));
  });

  it("switches sections and delegates ordering, copying, and confirmed deletion", () => {
    const props = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Style" }));
    expect(screen.getByRole("slider", { name: "Shape outline thickness" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "No Outline" }));
    expect(props.onUpdate).toHaveBeenCalledWith(expect.objectContaining({ outlineColor: undefined }), shape);
    fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
    fireEvent.click(screen.getByRole("button", { name: "Sort" }));
    fireEvent.click(screen.getByRole("button", { name: "Move shape up one layer" }));
    fireEvent.click(screen.getByRole("button", { name: "Make a copy" }));
    expect(props.onMoveUp).toHaveBeenCalledOnce();
    expect(props.onDuplicate).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Move" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("alertdialog", { name: /Delete triangle shape/ });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalledOnce();
  });

  it("keeps Adjust and Style mutually exclusive", () => {
    renderEditor();
    const adjust = screen.getByRole("button", { name: "Adjust" });
    const style = screen.getByRole("button", { name: "Style" });
    expect(adjust).toHaveAttribute("aria-pressed", "true");
    expect(style).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Move" })).toBeVisible();

    fireEvent.click(style);
    expect(style).toHaveAttribute("aria-pressed", "true");
    expect(adjust).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("slider", { name: "Shape outline thickness" })).toBeVisible();

    fireEvent.click(adjust);
    expect(adjust).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("slider", { name: "Shape outline thickness" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Snap/ })).toBeVisible();
  });

  it("retains mode and Style visibility when selecting another mounted shape", () => {
    const page = document.createElement("div");
    const common = {
      arrange: true, canMoveDown: true, canMoveUp: true, onDelete: vi.fn(), onDeselect: vi.fn(), onDuplicate: vi.fn(),
      onMoveDown: vi.fn(), onMoveUp: vi.fn(), onSelect: vi.fn(), onUpdate: vi.fn(), pageRef: { current: page }, snapShapes: [], stackIndex: 1,
    };
    const second = { ...shape, id: "shape-2" };
    const view = render(<><ShapeEditor {...common} key="first" selected shape={shape} /><ShapeEditor {...common} key="second" selected={false} shape={second} /></>);
    fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    fireEvent.click(screen.getByRole("button", { name: "Style" }));

    view.rerender(<><ShapeEditor {...common} key="first" selected={false} shape={shape} /><ShapeEditor {...common} key="second" selected shape={second} /></>);
    expect(screen.getByRole("button", { name: "Style" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("slider", { name: "Shape outline thickness" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
    expect(screen.getByRole("button", { name: "Rotate" })).toHaveAttribute("aria-pressed", "true");
  });
});
