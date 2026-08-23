import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { PolygonDraftEditor } from "./PolygonDraftEditor";

describe("PolygonDraftEditor", () => {
  it("groups left-aligned guidance and actions without a second canvas notice", () => {
    const finish = vi.fn();
    const { container, rerender } = render(
      <PolygonDraftEditor
        color="#244A60"
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onFinish={finish}
        pageRef={createRef<HTMLDivElement>()}
        points={[]}
      />,
    );

    const actions = container.querySelector(".polygon-draft-actions");
    expect(actions).toHaveTextContent("Tap at least three points");
    expect(actions).toContainElement(screen.getByRole("button", { name: "Finish polygon" }));
    expect(screen.getByRole("button", { name: "Finish polygon" })).toBeDisabled();

    rerender(
      <PolygonDraftEditor
        color="#244A60"
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onFinish={finish}
        pageRef={createRef<HTMLDivElement>()}
        points={[{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.4, y: 0.6 }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish polygon" }));
    expect(finish).toHaveBeenCalledOnce();
  });
});
