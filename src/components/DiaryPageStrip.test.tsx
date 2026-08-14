import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createInitialJournalSnapshot } from "../domain/initialState";
import type { Page } from "../domain/models";
import { DiaryPageStrip } from "./DiaryPageStrip";

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
      screen.getByRole("button", { name: "Open page 1" }),
    ).not.toHaveAttribute("aria-current");
    expect(
      screen.getByRole("button", { name: "Open page 2" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
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

    fireEvent.click(screen.getByRole("button", { name: "Open page 2" }));
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

  it("reorders thumbnails with accessible controls in Arrange mode", () => {
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

  it("confirms page deletion from the bottom-left Arrange control", () => {
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
