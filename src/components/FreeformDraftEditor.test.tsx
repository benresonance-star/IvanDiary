import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FreeformDraftEditor } from "./FreeformDraftEditor";

describe("FreeformDraftEditor", () => {
  it("turns one continuous outline into a small anchor set on release", () => {
    const page = document.createElement("div");
    vi.spyOn(page, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON: () => ({}) });
    const pageRef = createRef<HTMLDivElement>();
    pageRef.current = page;
    const onFinish = vi.fn();
    render(<FreeformDraftEditor color="#335577" onCancel={vi.fn()} onFinish={onFinish} onInvalid={vi.fn()} pageRef={pageRef} />);
    const surface = screen.getByRole("application", { name: /Draw a freeform shape outline/ });
    fireEvent.pointerDown(surface, { button: 0, pointerId: 40, clientX: 800, clientY: 400 });
    for (let index = 1; index < 40; index += 1) {
      const angle = index / 40 * Math.PI * 2;
      fireEvent.pointerMove(surface, { pointerId: 40, clientX: 500 + Math.cos(angle) * 300, clientY: 400 + Math.sin(angle) * 240 });
    }
    fireEvent.pointerUp(surface, { pointerId: 40, clientX: 800, clientY: 400 });
    expect(onFinish).toHaveBeenCalledOnce();
    expect(onFinish.mock.calls[0]?.[0].length).toBeGreaterThanOrEqual(6);
    expect(onFinish.mock.calls[0]?.[0].length).toBeLessThanOrEqual(12);
  });

  it("offers a keyboard starter shape", () => {
    const onFinish = vi.fn();
    render(<FreeformDraftEditor color="#335577" onCancel={vi.fn()} onFinish={onFinish} onInvalid={vi.fn()} pageRef={{ current: null }} />);
    fireEvent.keyDown(screen.getByRole("application"), { key: "Enter" });
    expect(onFinish.mock.calls[0]?.[0]).toHaveLength(8);
  });
});
