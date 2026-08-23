import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createInitialJournalSnapshot } from "../domain/initialState";
import type { Page } from "../domain/models";
import { DiaryPageStrip, PagePreview } from "./DiaryPageStrip";

function pages(): Page[] {
  const first = createInitialJournalSnapshot(
    new Date("2026-08-03T09:00:00.000Z"),
  ).pages[0]!;
  return [
    first,
    {
      ...first,
      id: "page-two",
      drawingDocumentId: "drawing-two",
      objects: [],
    },
  ];
}

describe("DiaryPageStrip", () => {
  it("preserves object placement, shape geometry, rotation, and sketch layering in previews", () => {
    const page = pages()[0]!;
    const previewPage: Page = { ...page, objects: [{
      id: "shape", pageId: page.id, type: "shape", shapeKind: "triangle", position: { x: .12, y: .18 },
      frame: { width: .22, height: .3 }, fillColor: "#abcdef", outlineColor: "#123456", outlineWidth: 4,
      rotationDegrees: 45, layer: "behind-sketch", revision: 0, createdAt: page.createdAt,
    }, {
      id: "text", pageId: page.id, type: "text", text: "Canvas words", textScale: 1, position: { x: .4, y: .5 },
      frame: { width: .3, height: .2 }, layer: "above-sketch", revision: 0, createdAt: page.createdAt,
    }] };
    const { container } = render(<PagePreview page={previewPage} />);
    expect(screen.getByText("Canvas words")).toBeInTheDocument();
    expect(container.querySelector(".preview-shape")).toHaveStyle({ left: "12%", top: "18%", width: "22%", height: "30%", transform: "rotate(45deg)", zIndex: 0 });
    expect(container.querySelector(".preview-shape polygon")).toHaveAttribute("fill", "#abcdef");
    expect(container.querySelector(".preview-text")).toHaveStyle({ zIndex: 11 });
  });

  it("shows a page's selected background colour in its preview", () => {
    const page = { ...pages()[0]!, backgroundColor: "#aabbcc" };
    const { container } = render(<PagePreview page={page} />);
    expect(container.querySelector(".diary-page-preview")).toHaveStyle({
      backgroundColor: "#aabbcc",
    });
  });

  it("shows ordered visual pages and exposes the current page", () => {
    const { container } = render(
      <DiaryPageStrip
        activePageId="page-two"
        arrange={false}
        displayName="Ivan"
        onAddPage={vi.fn()}
        onDeletePage={vi.fn()}
        onReorderPages={vi.fn()}
        onSelectPage={vi.fn()}
        pages={pages()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Page 1" }),
    ).not.toHaveAttribute("aria-current");
    expect(
      screen.getByRole("button", { name: "Page 2" }),
    ).toHaveAttribute("aria-current", "page");
    expect(container.querySelectorAll(".story-page-item")).toHaveLength(2);
    expect(container.querySelector(".page-strip")).toHaveClass("story-page-strip");
    expect(container.querySelector(".page-preview-object")).not.toBeInTheDocument();
    expect(container.querySelector(".sketch-thumbnail")).not.toBeInTheDocument();
  });

  it("limits a journal or sketchbook strip to ten pages", () => {
    const onAddPage = vi.fn();
    const first = pages()[0]!;
    const tenPages = Array.from({ length: 10 }, (_, index) => ({
      ...first,
      id: `page-${index + 1}`,
      drawingDocumentId: `drawing-${index + 1}`,
    }));

    render(
      <DiaryPageStrip
        activePageId="page-1"
        arrange={false}
        displayName="Ivan"
        onAddPage={onAddPage}
        onDeletePage={vi.fn()}
        onReorderPages={vi.fn()}
        onSelectPage={vi.fn()}
        pages={tenPages}
      />,
    );

    const addButton = screen.getByRole("button", {
      name: "Maximum of 10 pages reached",
    });
    expect(addButton).toBeDisabled();
    fireEvent.click(addButton);
    expect(onAddPage).not.toHaveBeenCalled();
  });

  it("selects pages and requests another page", () => {
    const onAddPage = vi.fn().mockResolvedValue(true);
    const onSelectPage = vi.fn();
    render(
      <DiaryPageStrip
        activePageId={pages()[0]!.id}
        arrange={false}
        displayName="Ivan"
        onAddPage={onAddPage}
        onDeletePage={vi.fn()}
        onReorderPages={vi.fn()}
        onSelectPage={onSelectPage}
        pages={pages()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(onSelectPage).toHaveBeenCalledWith("page-two");

    fireEvent.click(
      screen.getByRole("button", { name: "Add another diary page" }),
    );
    expect(onAddPage).toHaveBeenCalledOnce();
  });

  it("warns by name when the tenth page is added", async () => {
    const first = pages()[0]!;
    const ninePages = Array.from({ length: 9 }, (_, index) => ({
      ...first,
      id: `page-${index + 1}`,
      drawingDocumentId: `drawing-${index + 1}`,
    }));

    render(
      <DiaryPageStrip
        activePageId="page-1"
        arrange={false}
        collectionType="sketchbook"
        displayName="Ivan"
        onAddPage={vi.fn().mockResolvedValue(true)}
        onDeletePage={vi.fn()}
        onReorderPages={vi.fn()}
        onSelectPage={vi.fn()}
        pages={ninePages}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add another diary page" }));

    expect(await screen.findByRole("alertdialog", { name: "Last page" })).toHaveTextContent(
      "Hey Ivan this is the last page we can fit on this sketchbook",
    );
  });

  it("reorders thumbnails with accessible controls in Edit mode", () => {
    const onReorderPages = vi.fn().mockResolvedValue(true);
    const journalPages = pages();
    render(
      <DiaryPageStrip
        activePageId={journalPages[0]!.id}
        arrange
        displayName="Ivan"
        onAddPage={vi.fn()}
        onDeletePage={vi.fn()}
        onReorderPages={onReorderPages}
        onSelectPage={vi.fn()}
        pages={journalPages}
      />,
    );

    const secondPage = screen.getByRole("button", {
      name: /Page 2\. Drag to reorder/i,
    });
    expect(secondPage.closest(".page-strip")).toHaveClass("diary-page-strip");
    fireEvent.keyDown(secondPage, {
      key: "ArrowLeft",
      shiftKey: true,
    });

    expect(onReorderPages).toHaveBeenCalledWith([
      "page-two",
      journalPages[0]!.id,
    ]);
    const reorderedButtons = screen.getAllByRole("button", {
      name: /Drag to reorder/i,
    });
    expect(reorderedButtons[0]).not.toHaveAttribute("aria-current");
    expect(reorderedButtons[1]).toHaveAttribute("aria-current", "page");
  });

  it("commits a dragged thumbnail order", () => {
    const onReorderPages = vi.fn().mockResolvedValue(true);
    const journalPages = pages();
    render(
      <DiaryPageStrip
        activePageId={journalPages[0]!.id}
        arrange
        displayName="Ivan"
        onAddPage={vi.fn()}
        onDeletePage={vi.fn()}
        onReorderPages={onReorderPages}
        onSelectPage={vi.fn()}
        pages={journalPages}
      />,
    );
    const firstPage = screen.getByRole("button", {
      name: /Page 1\. Drag to reorder/i,
    });
    const secondPage = screen.getByRole("button", {
      name: /Page 2\. Drag to reorder/i,
    });
    const dataTransfer = {
      dropEffect: "move",
      effectAllowed: "move",
      setData: vi.fn(),
    };

    fireEvent.dragStart(secondPage, { dataTransfer });
    fireEvent.dragOver(firstPage, { dataTransfer });
    fireEvent.dragEnd(secondPage, { dataTransfer });

    expect(onReorderPages).toHaveBeenCalledWith([
      "page-two",
      journalPages[0]!.id,
    ]);
  });

  it("confirms page deletion from the bottom-left Edit control", () => {
    const onDeletePage = vi.fn().mockResolvedValue(true);
    render(
      <DiaryPageStrip
        activePageId={pages()[0]!.id}
        arrange
        displayName="Ivan"
        onAddPage={vi.fn()}
        onDeletePage={onDeletePage}
        onReorderPages={vi.fn()}
        onSelectPage={vi.fn()}
        pages={pages()}
      />,
    );

    const deleteTrigger = screen.getByRole("button", { name: "Delete page 2" });
    deleteTrigger.focus();
    fireEvent.click(deleteTrigger);
    expect(screen.getByRole("alertdialog", { name: "Delete this page?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep it" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(deleteTrigger).toHaveFocus();

    fireEvent.click(deleteTrigger);
    fireEvent.click(screen.getByRole("button", { name: "Delete page" }));
    expect(onDeletePage).toHaveBeenCalledWith("page-two");
  });
});
