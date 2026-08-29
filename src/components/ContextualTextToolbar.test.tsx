import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import type { TextObject } from "../domain/models";
import { ARRANGEABLE_LAYOUT_EVENT } from "./ArrangeablePageObject";
import { ContextualTextEditor } from "./ContextualTextToolbar";

const object: TextObject = {
  id: "text-1",
  type: "text",
  pageId: "page-1",
  position: { x: 0.2, y: 0.2 },
  frame: { width: 0.4, height: 0.2 },
  createdAt: "2026-08-28T10:00:00.000Z",
  revision: 2,
  text: "Visible words",
  textScale: 1,
  role: "body",
  color: "#171410",
};

function renderToolbar(overrides: Partial<ComponentProps<typeof ContextualTextEditor>> = {}) {
  const props: ComponentProps<typeof ContextualTextEditor> = {
    object,
    onEdit: vi.fn(),
    onPreview: vi.fn(),
    onUpdate: vi.fn(),
    ...overrides,
  };
  const view = render(<><div className="paper-page"><div data-object-id={object.id}>Visible words</div></div><ContextualTextEditor {...props} /></>);
  return {
    ...props,
    rerenderToolbar: (next: TextObject) => view.rerender(<><div className="paper-page"><div data-object-id={next.id}>Visible words</div></div><ContextualTextEditor {...props} object={next} /></>),
  };
}

describe("ContextualTextEditor", () => {
  it("keeps the primary row stable and exposes only one secondary section", () => {
    renderToolbar();

    const toolbar = screen.getByRole("toolbar", { name: "Text editing toolbar" });
    const inspector = screen.getByRole("complementary", { name: "Text editing commands" });
    expect(toolbar).toHaveTextContent("Edit textLook");
    expect(screen.queryByRole("button", { name: "Arrange" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New Entry" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Text look options")).not.toBeInTheDocument();
    const compactPosition = { left: inspector.style.left, top: inspector.style.top };

    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    const lookOptions = screen.getByLabelText("Text look options");
    expect(lookOptions).toBeVisible();
    expect(lookOptions).toHaveTextContent(/Text colour.*Scripture Gold.*Text size/);
    expect({ left: inspector.style.left, top: inspector.style.top }).toEqual(compactPosition);
    expect(screen.getByRole("group", { name: "Text size" })).toBeVisible();
    expect(screen.getByLabelText("Text colour")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    expect(screen.queryByLabelText("Text look options")).not.toBeInTheDocument();
    expect(toolbar).toHaveTextContent("Edit textLook");
  });

  it("keeps the control rail stable while opening Look", async () => {
    renderToolbar();
    const anchor = document.querySelector<HTMLElement>('[data-object-id="text-1"]')!;
    const canvas = document.querySelector<HTMLElement>(".paper-page")!;
    const primary = screen.getByRole("toolbar", { name: "Text editing toolbar" });
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({
      bottom: 760, height: 100, left: 100, right: 300, top: 660, width: 200, x: 100, y: 660, toJSON: () => ({}),
    });
    vi.spyOn(primary, "getBoundingClientRect").mockReturnValue({
      bottom: 728, height: 132, left: 100, right: 232, top: 596, width: 132, x: 100, y: 596, toJSON: () => ({}),
    });
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      bottom: 800, height: 760, left: 20, right: 1000, top: 40, width: 980, x: 20, y: 40, toJSON: () => ({}),
    });

    fireEvent.resize(window);
    const inspector = screen.getByRole("complementary", { name: "Text editing commands" });
    await waitFor(() => expect(
      Number.parseFloat(inspector.style.left),
    ).toBeGreaterThanOrEqual(336));
    const stablePosition = { left: inspector.style.left, top: inspector.style.top };
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    expect({ left: inspector.style.left, top: inspector.style.top }).toEqual(stablePosition);
    const lookOptions = screen.getByLabelText("Text look options");
    Object.defineProperty(lookOptions, "scrollHeight", {
      configurable: true,
      value: 330,
    });
    vi.spyOn(lookOptions, "getBoundingClientRect").mockReturnValue({
      bottom: 684, height: 88, left: 239, right: 619, top: 596, width: 380, x: 239, y: 596, toJSON: () => ({}),
    });
    fireEvent.resize(window);
    await waitFor(() => expect(lookOptions.style.maxHeight).toBe("330px"));
    expect(Number.parseFloat(lookOptions.style.top) + Number.parseFloat(lookOptions.style.maxHeight)).toBeLessThanOrEqual(756);
  });

  it("follows live arrangeable layout changes without waiting for persistence", async () => {
    renderToolbar();
    const anchor = document.querySelector<HTMLElement>('[data-object-id="text-1"]')!;
    const canvas = document.querySelector<HTMLElement>(".paper-page")!;
    const primary = screen.getByRole("toolbar", { name: "Text editing toolbar" });
    let anchorLeft = 100;
    vi.spyOn(anchor, "getBoundingClientRect").mockImplementation(() => ({
      bottom: 300, height: 100, left: anchorLeft, right: anchorLeft + 300,
      top: 200, width: 300, x: anchorLeft, y: 200, toJSON: () => ({}),
    }));
    vi.spyOn(primary, "getBoundingClientRect").mockReturnValue({
      bottom: 332, height: 132, left: 412, right: 544,
      top: 200, width: 132, x: 412, y: 200, toJSON: () => ({}),
    });
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      bottom: 800, height: 760, left: 20, right: 1000,
      top: 40, width: 980, x: 20, y: 40, toJSON: () => ({}),
    });

    fireEvent.resize(window);
    const inspector = screen.getByRole("complementary", { name: "Text editing commands" });
    await waitFor(() => expect(Number.parseFloat(inspector.style.left)).toBeCloseTo(436));

    anchorLeft = 300;
    fireEvent(anchor, new Event(ARRANGEABLE_LAYOUT_EVENT));
    expect(Number.parseFloat(inspector.style.left)).toBeCloseTo(156);
  });

  it("moves right as soon as that side can keep the palette clear of the text", async () => {
    renderToolbar();
    const anchor = document.querySelector<HTMLElement>('[data-object-id="text-1"]')!;
    const canvas = document.querySelector<HTMLElement>(".paper-page")!;
    const primary = screen.getByRole("toolbar", { name: "Text editing toolbar" });
    let anchorLeft = 700;
    vi.spyOn(anchor, "getBoundingClientRect").mockImplementation(() => ({
      bottom: 300, height: 100, left: anchorLeft, right: anchorLeft + 200,
      top: 200, width: 200, x: anchorLeft, y: 200, toJSON: () => ({}),
    }));
    vi.spyOn(primary, "getBoundingClientRect").mockReturnValue({
      bottom: 332, height: 132, left: 556, right: 688,
      top: 200, width: 132, x: 556, y: 200, toJSON: () => ({}),
    });
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      bottom: 800, height: 760, left: 20, right: 1000,
      top: 40, width: 980, x: 20, y: 40, toJSON: () => ({}),
    });

    fireEvent.resize(window);
    const inspector = screen.getByRole("complementary", { name: "Text editing commands" });
    await waitFor(() => expect(Number.parseFloat(inspector.style.left)).toBeCloseTo(556));

    anchorLeft = 200;
    fireEvent(anchor, new Event(ARRANGEABLE_LAYOUT_EVENT));
    expect(Number.parseFloat(inspector.style.left)).toBeCloseTo(436);
  });

  it("previews colour immediately and defers its durable update", async () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Edit text" }));
    expect(props.onEdit).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase text size" }));
    expect(props.onUpdate).toHaveBeenLastCalledWith({ ...object, textScale: 1.25, revision: 3 });

    fireEvent.change(screen.getByLabelText("Text colour"), {
      target: { value: "#245b8a" },
    });
    expect(props.onPreview).toHaveBeenLastCalledWith({ ...object, color: "#245b8a", revision: 3 });
    await waitFor(() => expect(props.onUpdate).toHaveBeenLastCalledWith({
      ...object,
      color: "#245b8a",
      revision: 3,
    }));
    expect(screen.queryByRole("button", { name: "Blue" })).not.toBeInTheDocument();
  });

  it("flushes a pending appearance change before opening the text editor", () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    fireEvent.change(screen.getByLabelText("Text colour"), {
      target: { value: "#245b8a" },
    });
    expect(props.onUpdate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Edit text" }));
    expect(props.onUpdate).toHaveBeenCalledWith({
      ...object,
      color: "#245b8a",
      revision: 3,
    });
    expect(props.onEdit).toHaveBeenCalledOnce();
  });

  it("keeps appearance controls progressively disclosed", () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    expect(screen.getByRole("group", { name: "Text structure" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Title" }));
    expect(props.onUpdate).toHaveBeenLastCalledWith({ ...object, role: "title", revision: 3 });

    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    expect(screen.queryByRole("group", { name: "Text structure" })).not.toBeInTheDocument();
  });

  it("does not expose arrangement or column controls", () => {
    renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    expect(screen.queryByText("Text column appearance")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arrange" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Left" })).not.toBeInTheDocument();
  });

  it("shows enabled colours and previews background changes immediately", async () => {
    const props = renderToolbar({
      object: {
        ...object,
        backgroundColor: "#fffaf0",
        outlineColor: "#3f3528",
        outlineWidth: 2,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    expect(screen.getByLabelText("Text background colour")).toBeVisible();
    expect(screen.getByLabelText("Text outline colour")).toBeVisible();
    expect(screen.getByRole("checkbox", {
      name: "Text background",
    })).toBeChecked();
    expect(screen.getByRole("checkbox", {
      name: "Text outline",
    })).toBeChecked();
    fireEvent.change(screen.getByLabelText("Text background colour"), {
      target: { value: "#ffffff" },
    });
    expect(props.onPreview).toHaveBeenLastCalledWith({
      ...object,
      backgroundColor: "#ffffff",
      outlineColor: "#3f3528",
      outlineWidth: 2,
      revision: 3,
    });
    await waitFor(() => expect(props.onUpdate).toHaveBeenCalled());
  });

  it("restores selected background and outline colours after toggling them off", () => {
    const customised = {
      ...object,
      backgroundColor: "#2468ac",
      outlineColor: "#97531f",
      outlineWidth: 2,
    };
    const props = renderToolbar({ object: customised });
    fireEvent.click(screen.getByRole("button", { name: "Look" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "Text background" }));
    const withoutBackground = vi.mocked(props.onUpdate).mock.lastCall?.[0] as TextObject;
    props.rerenderToolbar(withoutBackground);
    fireEvent.click(screen.getByRole("checkbox", { name: "Text background" }));
    expect(props.onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ backgroundColor: "#2468ac" }),
    );

    const restoredBackground = vi.mocked(props.onUpdate).mock.lastCall?.[0] as TextObject;
    props.rerenderToolbar(restoredBackground);
    fireEvent.click(screen.getByRole("checkbox", { name: "Text outline" }));
    const withoutOutline = vi.mocked(props.onUpdate).mock.lastCall?.[0] as TextObject;
    props.rerenderToolbar(withoutOutline);
    fireEvent.click(screen.getByRole("checkbox", { name: "Text outline" }));
    expect(props.onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ outlineColor: "#97531f" }),
    );
  });

  it("collapses the active section with Escape", () => {
    renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    fireEvent.keyDown(screen.getByRole("complementary", { name: "Text editing commands" }), { key: "Escape" });
    expect(screen.queryByLabelText("Text look options")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Look" })).toHaveAttribute("aria-expanded", "false");
  });
});
