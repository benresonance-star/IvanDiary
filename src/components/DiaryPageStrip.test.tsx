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
    render(
      <DiaryPageStrip
        activePageId="page-two"
        arrange={false}
        onAddPage={vi.fn()}
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
  });

  it("selects pages and requests another page", () => {
    const onAddPage = vi.fn();
    const onSelectPage = vi.fn();
    render(
      <DiaryPageStrip
        activePageId={pages()[0]!.id}
        arrange={false}
        onAddPage={onAddPage}
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

  it("reorders thumbnails with accessible controls in Arrange mode", () => {
    const onReorderPages = vi.fn().mockResolvedValue(true);
    const journalPages = pages();
    render(
      <DiaryPageStrip
        activePageId={journalPages[0]!.id}
        arrange
        onAddPage={vi.fn()}
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
        onAddPage={vi.fn()}
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
});
