import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ShapeObject } from "../domain/models";
import { ARRANGEABLE_LAYOUT_EVENT } from "./ArrangeablePageObject";
import { ShapeEditor } from "./ShapeEditor";

const shape: ShapeObject = {
  id: "shape-1", pageId: "page-1", type: "shape", shapeKind: "triangle",
  position: { x: 0.2, y: 0.2 }, frame: { width: 0.24, height: 0.24 },
  fillColor: "#d9a441", outlineColor: "#3f3528", outlineWidth: 3,
  rotationDegrees: 0, revision: 0, createdAt: "2026-08-19T00:00:00.000Z",
};

function renderEditor(value: ShapeObject = shape, snapShapes: ShapeObject[] = [], openAdjust = true) {
  const page = document.createElement("div");
  vi.spyOn(page, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON: () => ({}) });
  const props = {
    arrange: true, canMoveDown: true, canMoveUp: true, onDelete: vi.fn(), onDeselect: vi.fn(), onDuplicate: vi.fn(),
    onMoveDown: vi.fn(), onMoveUp: vi.fn(), onSelect: vi.fn(), onUpdate: vi.fn(),
    pageRef: { current: page }, selected: true, shape: value, snapShapes, stackIndex: 2,
  };
  const view = render(<ShapeEditor {...props} />);
  if (openAdjust) {
    const adjust = screen.getByRole("button", { name: "Adjust" });
    if (adjust.getAttribute("aria-pressed") !== "true") fireEvent.click(adjust);
    const move = screen.getByRole("button", { name: "Move" });
    if (move.getAttribute("aria-pressed") !== "true") fireEvent.click(move);
  }
  return { ...props, page, rerenderEditor: (next: ShapeObject) => view.rerender(<ShapeEditor {...props} shape={next} />) };
}

describe("ShapeEditor", () => {
  it("shows the plain-English command stack without the legacy edit handles", () => {
    renderEditor();
    const palette = screen.getByRole("complementary", { name: "Shape editing commands" });
    expect(within(palette).getByRole("button", { name: "Move" })).toHaveAttribute("aria-pressed", "true");
    expect(within(palette).getByRole("button", { name: "Rotate" })).toBeVisible();
    expect(within(palette).getByRole("button", { name: "Scale" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Drag to resize/ })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: /triangle shape/ })).toHaveStyle({ zIndex: 3 });
    expect(screen.getByRole("button", { name: "Vertex 1" }).closest(".shape-controller-overlay")).toHaveStyle({ zIndex: 850 });
    expect(within(palette).getByRole("button", { name: "Move" }).parentElement).toHaveClass("shape-edit-mode-group");
    expect(within(palette).getByRole("button", { name: "Add a vertex" }).parentElement).toHaveClass("shape-point-actions");
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

  it("keeps the compact primary rail stable across section changes", () => {
    renderEditor();
    const palette = screen.getByRole("complementary", { name: "Shape editing commands" });
    const rail = screen.getByRole("toolbar", { name: "Shape editing toolbar" });
    const before = { left: palette.style.left, top: palette.style.top };

    expect(within(rail).getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent)).toEqual([
      "Adjust",
      "Look",
      "Make a copy",
      "Delete",
    ]);
    expect(screen.getByLabelText("Shape adjust options")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Move shape editing palette" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Look" }));

    expect(screen.getByLabelText("Shape look options")).toBeVisible();
    expect({ left: palette.style.left, top: palette.style.top }).toEqual(before);
  });

  it("starts collapsed, positions the rail without a panel, and toggles closed", async () => {
    const { page } = renderEditor(shape, [], false);
    const adjust = screen.getByRole("button", { name: "Adjust" });
    const look = screen.getByRole("button", { name: "Look" });
    const shapeElement = screen.getByRole("group", { name: /triangle shape/ });
    const rail = screen.getByRole("toolbar", { name: "Shape editing toolbar" });
    expect(adjust).toHaveAttribute("aria-pressed", "false");
    expect(look).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByLabelText(/Shape (adjust|look) options/)).not.toBeInTheDocument();
    vi.spyOn(shapeElement, "getBoundingClientRect").mockReturnValue({
      bottom: 340, height: 140, left: 200, right: 440, top: 200, width: 240, x: 200, y: 200, toJSON: () => ({}),
    });
    vi.spyOn(rail, "getBoundingClientRect").mockReturnValue({
      bottom: 368, height: 168, left: 452, right: 568, top: 200, width: 116, x: 452, y: 200, toJSON: () => ({}),
    });
    vi.spyOn(page, "getBoundingClientRect").mockReturnValue({
      bottom: 760, height: 720, left: 20, right: 980, top: 40, width: 960, x: 20, y: 40, toJSON: () => ({}),
    });
    fireEvent.resize(window);
    const palette = screen.getByRole("complementary", { name: "Shape editing commands" });
    await waitFor(() => expect(palette.style.left).toBe("452px"));

    fireEvent.click(adjust);
    expect(screen.getByLabelText("Shape adjust options")).toBeVisible();
    expect(palette.style.left).toBe("452px");
    fireEvent.click(adjust);
    expect(screen.queryByLabelText("Shape adjust options")).not.toBeInTheDocument();
    expect(palette.style.left).toBe("452px");
  });

  it("keeps a behind-sketch shape in the same object stack as other shapes", () => {
    renderEditor({ ...shape, layer: "behind-sketch" });
    const editor = screen.getByRole("group", { name: /triangle shape/ });
    expect(editor).toHaveClass("behind-sketch");
    expect(editor).toHaveStyle({ zIndex: 3 });
  });

  it("places the rail and panel beside the shape inside the visible canvas", async () => {
    const { page } = renderEditor();
    const shapeElement = screen.getByRole("group", { name: /triangle shape/ });
    const rail = screen.getByRole("toolbar", { name: "Shape editing toolbar" });
    const panel = screen.getByLabelText("Shape adjust options");
    vi.spyOn(shapeElement, "getBoundingClientRect").mockReturnValue({
      bottom: 340, height: 140, left: 200, right: 440, top: 200, width: 240, x: 200, y: 200, toJSON: () => ({}),
    });
    vi.spyOn(rail, "getBoundingClientRect").mockReturnValue({
      bottom: 320, height: 120, left: 452, right: 568, top: 200, width: 116, x: 452, y: 200, toJSON: () => ({}),
    });
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      bottom: 500, height: 300, left: 575, right: 875, top: 200, width: 300, x: 575, y: 200, toJSON: () => ({}),
    });
    vi.spyOn(page, "getBoundingClientRect").mockReturnValue({
      bottom: 760, height: 720, left: 20, right: 980, top: 40, width: 960, x: 20, y: 40, toJSON: () => ({}),
    });

    fireEvent.resize(window);

    const palette = screen.getByRole("complementary", { name: "Shape editing commands" });
    await waitFor(() => expect(palette.style.left).toBe("452px"));
    await waitFor(() => expect(panel.style.left).toBe("575px"));
    expect(Number.parseFloat(panel.style.maxHeight)).toBe(390);
    expect(Number.parseFloat(panel.style.top) + Number.parseFloat(panel.style.maxHeight)).toBeLessThanOrEqual(748);
  });

  it("temporarily hides editing UI when arrange interaction is suspended", () => {
    const page = document.createElement("div");
    const props = {
      arrange: true, canMoveDown: true, canMoveUp: true, onDelete: vi.fn(), onDeselect: vi.fn(), onDuplicate: vi.fn(),
      onMoveDown: vi.fn(), onMoveUp: vi.fn(), onSelect: vi.fn(), onUpdate: vi.fn(), pageRef: { current: page }, selected: true, shape, snapShapes: [], stackIndex: 1,
    };
    const view = render(<ShapeEditor {...props} />);
    expect(screen.getByRole("complementary", { name: "Shape editing commands" })).toBeInTheDocument();

    view.rerender(<ShapeEditor {...props} arrange={false} />);
    expect(screen.queryByRole("complementary", { name: "Shape editing commands" })).not.toBeInTheDocument();

    view.rerender(<ShapeEditor {...props} />);
    expect(screen.getByRole("complementary", { name: "Shape editing commands" })).toBeInTheDocument();
  });

  it("follows live layout events, changes sides, and caps the scrolling panel", async () => {
    const { page } = renderEditor();
    const shapeElement = screen.getByRole("group", { name: /triangle shape/ });
    const rail = screen.getByRole("toolbar", { name: "Shape editing toolbar" });
    const panel = screen.getByLabelText("Shape adjust options");
    let shapeLeft = 100;
    vi.spyOn(shapeElement, "getBoundingClientRect").mockImplementation(() => ({
      bottom: 300, height: 100, left: shapeLeft, right: shapeLeft + 200,
      top: 200, width: 200, x: shapeLeft, y: 200, toJSON: () => ({}),
    }));
    vi.spyOn(rail, "getBoundingClientRect").mockImplementation(() => {
      const left = shapeLeft === 700 ? 572 : 312;
      return {
        bottom: 320, height: 120, left, right: left + 116,
        top: 200, width: 116, x: left, y: 200, toJSON: () => ({}),
      };
    });
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      bottom: 500, height: 300, left: 435, right: 735, top: 200, width: 300, x: 435, y: 200, toJSON: () => ({}),
    });
    Object.defineProperty(panel, "scrollHeight", { configurable: true, value: 600 });
    vi.spyOn(page, "getBoundingClientRect").mockReturnValue({
      bottom: 800, height: 760, left: 20, right: 1000, top: 40, width: 980, x: 20, y: 40, toJSON: () => ({}),
    });

    fireEvent.resize(window);
    const palette = screen.getByRole("complementary", { name: "Shape editing commands" });
    await waitFor(() => expect(palette.style.left).toBe("312px"));
    await waitFor(() => expect(panel.style.maxHeight).toBe("390px"));

    shapeLeft = 700;
    fireEvent(shapeElement, new Event(ARRANGEABLE_LAYOUT_EVENT));
    expect(palette.style.left).toBe("572px");
    await waitFor(() => expect(panel.style.left).toBe("265px"));
  });

  it("repositions after nested scroll and visual viewport changes", async () => {
    const viewport = Object.assign(new EventTarget(), {
      height: 760,
      offsetLeft: 0,
      offsetTop: 0,
      width: 1000,
    }) as VisualViewport;
    vi.stubGlobal("visualViewport", viewport);
    try {
      renderEditor();
      const shapeElement = screen.getByRole("group", { name: /triangle shape/ });
      const measureShape = vi.spyOn(shapeElement, "getBoundingClientRect");
      const measuredBeforeScroll = measureShape.mock.calls.length;

      fireEvent.scroll(shapeElement);
      await waitFor(() => expect(measureShape.mock.calls.length).toBeGreaterThan(measuredBeforeScroll));

      const measuredBeforeViewport = measureShape.mock.calls.length;
      viewport.dispatchEvent(new Event("scroll"));
      await waitFor(() => expect(measureShape.mock.calls.length).toBeGreaterThan(measuredBeforeViewport));

      const measuredBeforeResize = measureShape.mock.calls.length;
      viewport.dispatchEvent(new Event("resize"));
      await waitFor(() => expect(measureShape.mock.calls.length).toBeGreaterThan(measuredBeforeResize));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("provides help topics for every command", () => {
    renderEditor();
    for (const name of ["Adjust", "Look", "Move", "Rotate", "Scale", "Sort", "Add a vertex", "Delete selected vertex", /Snap/, "Make a copy", "Delete"]) {
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

  it("keeps the look and move panels tall enough when extra controls appear", async () => {
    const { page } = renderEditor({ ...shape, outlineColor: undefined });
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    const panel = screen.getByLabelText("Shape look options");
    const rail = screen.getByRole("toolbar", { name: "Shape editing toolbar" });
    const shapeElement = screen.getByRole("group", { name: /triangle shape/ });
    vi.spyOn(shapeElement, "getBoundingClientRect").mockReturnValue({
      bottom: 340, height: 140, left: 200, right: 440, top: 200, width: 240, x: 200, y: 200, toJSON: () => ({}),
    });
    vi.spyOn(rail, "getBoundingClientRect").mockReturnValue({
      bottom: 320, height: 120, left: 452, right: 568, top: 200, width: 116, x: 452, y: 200, toJSON: () => ({}),
    });
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      bottom: 348, height: 148, left: 575, right: 875, top: 200, width: 300, x: 575, y: 200, toJSON: () => ({}),
    });
    Object.defineProperty(panel, "scrollHeight", { configurable: true, value: 148 });
    vi.spyOn(page, "getBoundingClientRect").mockReturnValue({
      bottom: 760, height: 720, left: 20, right: 980, top: 40, width: 960, x: 20, y: 40, toJSON: () => ({}),
    });

    fireEvent.resize(window);
    await waitFor(() => expect(panel.style.maxHeight).toBe("390px"));

    fireEvent.click(screen.getByRole("checkbox", { name: "Shape outline" }));
    expect(screen.getByRole("slider", { name: "Outline Thickness" })).toBeVisible();
    expect(panel.style.maxHeight).toBe("390px");

    fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
    fireEvent.click(screen.getByRole("button", { name: "Scale" }));
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(screen.getByRole("button", { name: "Move shape up" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Snap/ })).toBeVisible();
    expect(screen.getByLabelText("Shape adjust options").style.maxHeight).toBe("390px");
  });

  it("uses accessible Look switches and conditional circular colour pickers", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    const fillPicker = screen.getByLabelText("Shape fill colour");
    const outlinePicker = screen.getByLabelText("Shape outline colour");
    expect(fillPicker).toHaveAttribute("type", "color");
    expect(outlinePicker).toHaveAttribute("type", "color");
    expect(screen.getByRole("checkbox", { name: "Shape fill" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Shape outline" })).toBeChecked();
    expect(screen.getByRole("slider", { name: "Outline Thickness" }).closest("label"))
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

  it("shows separate width and height controllers for circles in Scale mode", () => {
    const { onUpdate } = renderEditor({ ...shape, shapeKind: "circle" });
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(screen.queryByRole("button", { name: "Add a vertex" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete selected vertex" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Vertex 1/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Change circle/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scale" }));
    expect(screen.getByRole("button", { name: "Change circle width" })).toHaveClass(
      "shape-vertex-handle",
      "shape-scale-horizontal",
    );
    expect(screen.getByRole("button", { name: "Change circle height" })).toHaveClass(
      "shape-vertex-handle",
      "shape-scale-vertical",
    );
    const widthHandle = screen.getByRole("button", { name: "Change circle width" });
    fireEvent.pointerDown(widthHandle, {
      button: 0,
      pointerId: 41,
      clientX: 440,
      clientY: 256,
    });
    fireEvent.pointerMove(widthHandle, {
      pointerId: 41,
      clientX: 500,
      clientY: 256,
    });
    fireEvent.pointerUp(widthHandle, { pointerId: 41 });
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        frame: { width: 0.36, height: shape.frame!.height },
      }),
      expect.anything(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Make shape larger" }));
    expect(onUpdate.mock.lastCall?.[0].frame.width).toBeGreaterThan(shape.frame!.width);
    expect(onUpdate.mock.lastCall?.[0].frame.height).toBeGreaterThan(shape.frame!.height);
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
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    expect(screen.getByRole("slider", { name: "Outline Thickness" })).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: "Shape outline" }));
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

  it("keeps the last remaining fill or outline so the shape stays visible", () => {
    const outlineOnly = { ...shape, fillColor: undefined, outlineColor: "#97531f" };
    const props = renderEditor(outlineOnly);
    fireEvent.click(screen.getByRole("button", { name: "Look" }));

    const outlineSwitch = screen.getByRole("checkbox", { name: "Shape outline" });
    expect(outlineSwitch).toBeDisabled();
    fireEvent.click(outlineSwitch);
    expect(props.onUpdate).not.toHaveBeenCalled();
    expect(outlineSwitch).toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: "Shape fill" }));
    const withBoth = props.onUpdate.mock.lastCall?.[0] as ShapeObject;
    props.rerenderEditor(withBoth);
    fireEvent.click(screen.getByRole("checkbox", { name: "Shape outline" }));
    const fillOnly = props.onUpdate.mock.lastCall?.[0] as ShapeObject;
    expect(fillOnly.outlineColor).toBeUndefined();
    props.rerenderEditor(fillOnly);

    const fillSwitch = screen.getByRole("checkbox", { name: "Shape fill" });
    const callsAfterLock = props.onUpdate.mock.calls.length;
    expect(fillSwitch).toBeDisabled();
    fireEvent.click(fillSwitch);
    expect(props.onUpdate).toHaveBeenCalledTimes(callsAfterLock);
    expect(fillSwitch).toBeChecked();
  });

  it("restores the selected fill and outline colours after toggling them off", () => {
    const customised = { ...shape, fillColor: "#2468ac", outlineColor: "#97531f" };
    const props = renderEditor(customised);
    fireEvent.click(screen.getByRole("button", { name: "Look" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "Shape fill" }));
    const withoutFill = props.onUpdate.mock.lastCall?.[0] as ShapeObject;
    props.rerenderEditor(withoutFill);
    expect(screen.queryByLabelText("Shape fill colour")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Shape fill" }));
    expect(props.onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ fillColor: "#2468ac" }),
      withoutFill,
    );

    const restoredFill = props.onUpdate.mock.lastCall?.[0] as ShapeObject;
    props.rerenderEditor(restoredFill);
    fireEvent.click(screen.getByRole("checkbox", { name: "Shape outline" }));
    const withoutOutline = props.onUpdate.mock.lastCall?.[0] as ShapeObject;
    props.rerenderEditor(withoutOutline);
    expect(screen.queryByLabelText("Shape outline colour")).not.toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "Outline Thickness" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Shape outline" }));
    expect(props.onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ outlineColor: "#97531f" }),
      withoutOutline,
    );
  });

  it("keeps Adjust and Look mutually exclusive", () => {
    renderEditor();
    const adjust = screen.getByRole("button", { name: "Adjust" });
    const look = screen.getByRole("button", { name: "Look" });
    expect(adjust).toHaveAttribute("aria-pressed", "true");
    expect(look).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Move" })).toBeVisible();

    fireEvent.click(look);
    expect(look).toHaveAttribute("aria-pressed", "true");
    expect(adjust).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("slider", { name: "Outline Thickness" })).toBeVisible();

    fireEvent.click(adjust);
    expect(adjust).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("slider", { name: "Outline Thickness" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Snap/ })).toBeVisible();
  });

  it("retains the adjustment mode but collapses the section when selection changes", () => {
    const page = document.createElement("div");
    const common = {
      arrange: true, canMoveDown: true, canMoveUp: true, onDelete: vi.fn(), onDeselect: vi.fn(), onDuplicate: vi.fn(),
      onMoveDown: vi.fn(), onMoveUp: vi.fn(), onSelect: vi.fn(), onUpdate: vi.fn(), pageRef: { current: page }, snapShapes: [], stackIndex: 1,
    };
    const second = { ...shape, id: "shape-2" };
    const view = render(<><ShapeEditor {...common} key="first" selected shape={shape} /><ShapeEditor {...common} key="second" selected={false} shape={second} /></>);
    fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));

    view.rerender(<><ShapeEditor {...common} key="first" selected={false} shape={shape} /><ShapeEditor {...common} key="second" selected shape={second} /></>);
    expect(screen.getByRole("button", { name: "Look" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByLabelText("Shape adjust options")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Shape look options")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
    expect(screen.getByRole("button", { name: "Rotate" })).toHaveAttribute("aria-pressed", "true");
  });
});
