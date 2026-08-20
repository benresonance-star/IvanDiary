import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ShapeObject } from "../domain/models";
import { ShapeCard } from "./ShapeCard";

const shape: ShapeObject = {
  id: "shape-1", pageId: "page-1", type: "shape", shapeKind: "triangle",
  position: { x: 0.2, y: 0.2 }, frame: { width: 0.24, height: 0.24 },
  fillColor: "#d9a441", outlineColor: "#3f3528", outlineWidth: 3,
  revision: 0, createdAt: "2026-08-19T00:00:00.000Z",
};

describe("ShapeCard", () => {
  it("renders a vector shape with its fill and outline", () => {
    render(<ShapeCard shape={shape} />);
    const polygon = screen.getByRole("img", { name: "triangle shape" }).querySelector("polygon");
    expect(polygon).toHaveAttribute("fill", "#d9a441");
    expect(polygon).toHaveAttribute("stroke", "#3f3528");
    expect(polygon).toHaveAttribute("points", "50,5 95,95 5,95");
    expect(polygon).toHaveAttribute("pointer-events", "visibleFill");
  });

  it("renders custom polygon vertices without distorting the view box", () => {
    render(<ShapeCard shape={{ ...shape, shapeKind: "polygon", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }] }} />);
    const rendered = screen.getByRole("img", { name: "polygon shape" });
    expect(rendered).toHaveAttribute("preserveAspectRatio", "none");
    expect(rendered.querySelector("polygon")).toHaveAttribute("points", "0,0 100,0 50,100");
  });

  it("renders legacy rectangle points as four visible corners", () => {
    render(<ShapeCard shape={{ ...shape, shapeKind: "rectangle", points: [{ x: .2, y: .1 }, { x: .8, y: .1 }, { x: .8, y: .7 }, { x: .2, y: .7 }] }} />);
    expect(screen.getByRole("img", { name: "rectangle shape" }).querySelector("polygon")).toHaveAttribute("points", "20,10 80,10 80,70 20,70");
  });

  it("renders a freeform shape as a closed smooth path", () => {
    render(<ShapeCard shape={{ ...shape, shapeKind: "freeform", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: .5, y: 1 }] }} />);
    const path = screen.getByRole("img", { name: "freeform shape" }).querySelector("path");
    expect(path).toHaveAttribute("d", expect.stringContaining("C"));
    expect(path).toHaveAttribute("fill-rule", "evenodd");
  });

  it("uses no stroke width when the outline is removed", () => {
    render(<ShapeCard shape={{ ...shape, outlineColor: undefined }} />);
    const polygon = screen.getByRole("img", { name: "triangle shape" }).querySelector("polygon");
    expect(polygon).toHaveAttribute("stroke", "none");
    expect(polygon).toHaveAttribute("stroke-width", "0");
  });
});
