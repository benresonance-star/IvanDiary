import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ShapeObject } from "../domain/models";
import { ShapeCard } from "./ShapeCard";

const shape: ShapeObject = {
  id: "shape-1", pageId: "page-1", type: "shape", shapeKind: "triangle",
  position: { x: 0.2, y: 0.2 }, frame: { width: 0.24, height: 0.24 },
  fillColor: "#d9a441", outlineColor: "#3f3528", outlineWidth: 3,
  layer: "above-sketch", revision: 0, createdAt: "2026-08-19T00:00:00.000Z",
};

describe("ShapeCard", () => {
  it("renders an editable vector shape with fill and outline controls", () => {
    const onUpdate = vi.fn();
    render(<ShapeCard arrange onUpdate={onUpdate} selected shape={shape} />);
    expect(screen.getByRole("img", { name: "triangle shape" }).querySelector("polygon")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change shape fill and outline" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove fill" }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ fillColor: undefined, revision: 1 }));
    expect(screen.getByRole("button", { name: "Change shape fill and outline" })).toHaveAttribute("data-help-topic", "arrange-shape-appearance");
  });

  it("keeps the fixed-size appearance palette inside the visible canvas and away from the shape", () => {
    const { container } = render(<div className="paper-page"><div data-object-id="shape-1"><ShapeCard arrange onUpdate={vi.fn()} selected shape={shape} /></div></div>);
    const paper = container.querySelector<HTMLElement>(".paper-page")!;
    const object = container.querySelector<HTMLElement>("[data-object-id]")!;
    vi.spyOn(paper, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 700, width: 800, height: 700, toJSON: () => ({}) });
    vi.spyOn(object, "getBoundingClientRect").mockReturnValue({ x: 80, y: 100, left: 80, top: 100, right: 280, bottom: 300, width: 200, height: 200, toJSON: () => ({}) });

    fireEvent.click(screen.getByRole("button", { name: "Change shape fill and outline" }));

    const palette = screen.getByRole("dialog", { name: "Shape fill and outline" });
    expect(palette).toHaveStyle({ left: "524px", top: "100px" });
    expect(palette.parentElement).toBe(document.body);
  });

  it("renders custom polygon vertices", () => {
    render(<ShapeCard arrange={false} onUpdate={vi.fn()} selected={false} shape={{ ...shape, shapeKind: "polygon", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }] }} />);
    expect(screen.getByRole("img", { name: "polygon shape" }).querySelector("polygon")).toHaveAttribute("points", "0,0 100,0 50,100");
  });

  it("previews outline thickness locally and saves once when adjustment ends", () => {
    const onUpdate = vi.fn();
    render(<ShapeCard arrange onUpdate={onUpdate} selected shape={shape} />);
    fireEvent.click(screen.getByRole("button", { name: "Change shape fill and outline" }));
    const slider = screen.getByRole("slider", { name: "Shape outline thickness" });
    fireEvent.change(slider, { target: { value: "8" } });
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ outlineWidth: 8 }));
  });

  it("lets Edit mode reposition triangle vertices", () => {
    const onUpdate = vi.fn();
    const { container } = render(<div data-object-id="shape-1"><ShapeCard arrange onUpdate={onUpdate} selected shape={shape} /></div>);
    vi.spyOn(container.querySelector<HTMLElement>("[data-object-id]")!, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100, toJSON: () => ({}) });
    const vertex = screen.getByRole("button", { name: "Move vertex 1" });
    fireEvent.pointerDown(vertex, { pointerId: 1, clientX: 100, clientY: 5 });
    fireEvent.pointerMove(vertex, { pointerId: 1, clientX: 140, clientY: 20 });
    fireEvent.pointerUp(vertex, { pointerId: 1, clientX: 140, clientY: 20 });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ points: expect.arrayContaining([expect.objectContaining({ x: .7, y: .2 })]) }));
  });
});
