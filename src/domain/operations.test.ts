import { describe, expect, it } from "vitest";

import { createInitialJournalSnapshot } from "./initialState";
import {
  applyDocumentOperation,
  OperationConflictError,
} from "./operations";
import {
  DOCUMENT_SCHEMA_VERSION,
  type DocumentOperation,
  type Page,
  type Sketchbook,
  type TextObject,
} from "./models";

function textOperation(
  snapshotRevision: number,
  id = "operation-add-text",
): DocumentOperation {
  const object: TextObject = {
    id: "test-text",
    type: "text",
    pageId: "page-2026-08-03-1",
    position: { x: 0.1, y: 0.4 },
    createdAt: "2026-08-03T10:00:00.000Z",
    revision: 0,
    text: "A durable thought",
    textScale: 1,
  };
  return {
    id,
    type: "page-object-add",
    journalId: "ivan-journal",
    baseRevision: snapshotRevision,
    resultingRevision: snapshotRevision + 1,
    createdAt: "2026-08-03T10:00:00.000Z",
    pageId: object.pageId,
    object,
  };
}

function emptyPage(journalDayId: string): Page {
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: "page-2026-08-03-2",
    journalDayId,
    paperStyle: "warm-journal",
    drawingDocumentId: "drawing-2026-08-03-2",
    objects: [],
    revision: 0,
    createdAt: "2026-08-03T10:00:00.000Z",
    updatedAt: "2026-08-03T10:00:00.000Z",
  };
}

function sketchbookPage(sketchbookId: string, id = "sketch-page-one"): Page {
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id,
    sketchbookId,
    paperStyle: "sketch-paper",
    drawingDocumentId: `drawing-${id}`,
    objects: [],
    revision: 0,
    createdAt: "2026-08-03T10:00:00.000Z",
    updatedAt: "2026-08-03T10:00:00.000Z",
  };
}

function sketchbookWithPage(page: Page): Sketchbook {
  return {
    id: page.sketchbookId!,
    name: "Animals",
    pageIds: [page.id],
    favourite: false,
    revision: 0,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}

describe("document operations", () => {
  const initial = createInitialJournalSnapshot(
    new Date("2026-08-03T09:00:00.000Z"),
  );

  it("applies a page change and records its operation id", () => {
    const next = applyDocumentOperation(initial, textOperation(0));
    expect(next.revision).toBe(1);
    expect(next.pages[0]?.objects).toContainEqual(
      expect.objectContaining({ id: "test-text" }),
    );
    expect(next.appliedOperationIds).toContain("operation-add-text");
  });

  it("is idempotent when the same operation is replayed", () => {
    const operation = textOperation(0);
    const once = applyDocumentOperation(initial, operation);
    const twice = applyDocumentOperation(once, operation);
    expect(twice).toBe(once);
    expect(
      twice.pages[0]?.objects.filter((object) => object.id === "test-text"),
    ).toHaveLength(1);
  });

  it("rejects an operation based on stale state", () => {
    expect(() =>
      applyDocumentOperation(initial, textOperation(4, "stale-operation")),
    ).toThrow(OperationConflictError);
  });

  it("handles favourites as durable entities", () => {
    const day = initial.days[0]!;
    const next = applyDocumentOperation(initial, {
      id: "favourite-day",
      type: "favourite-set",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: "2026-08-03T10:00:00.000Z",
      targetType: "journal-day",
      targetId: day.id,
      favourite: true,
    });
    expect(next.days[0]?.favourite).toBe(true);
    expect(next.favourites).toContainEqual(
      expect.objectContaining({ targetId: day.id }),
    );
  });

  it("creates and orders a page within its journal day atomically", () => {
    const day = initial.days[0]!;
    const page = emptyPage(day.id);
    const operation: DocumentOperation = {
      id: "create-second-page",
      type: "page-create",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: page.createdAt,
      journalDayId: day.id,
      page,
    };

    const created = applyDocumentOperation(initial, operation);
    expect(created.pages.at(-1)).toEqual(page);
    expect(created.days[0]?.pageIds).toEqual([
      ...day.pageIds,
      page.id,
    ]);
    expect(created.days[0]?.revision).toBe(day.revision + 1);
    expect(applyDocumentOperation(created, operation)).toBe(created);
  });

  it("rejects a page whose owner does not match the target day", () => {
    const day = initial.days[0]!;
    const page = emptyPage("another-day");

    expect(() =>
      applyDocumentOperation(initial, {
        id: "create-mismatched-page",
        type: "page-create",
        journalId: initial.id,
        baseRevision: 0,
        resultingRevision: 1,
        createdAt: page.createdAt,
        journalDayId: day.id,
        page,
      }),
    ).toThrow(OperationConflictError);
  });

  it("rejects a page for a missing journal day", () => {
    const page = emptyPage("missing-day");

    expect(() =>
      applyDocumentOperation(initial, {
        id: "create-page-for-missing-day",
        type: "page-create",
        journalId: initial.id,
        baseRevision: 0,
        resultingRevision: 1,
        createdAt: page.createdAt,
        journalDayId: "missing-day",
        page,
      }),
    ).toThrow(OperationConflictError);
  });

  it("reorders every page in a journal day", () => {
    const day = initial.days[0]!;
    const page = emptyPage(day.id);
    const withSecondPage = applyDocumentOperation(initial, {
      id: "create-page-before-reorder",
      type: "page-create",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: page.createdAt,
      journalDayId: day.id,
      page,
    });
    const reordered = applyDocumentOperation(withSecondPage, {
      id: "reorder-pages",
      type: "journal-pages-reorder",
      journalId: initial.id,
      baseRevision: 1,
      resultingRevision: 2,
      createdAt: "2026-08-03T10:01:00.000Z",
      journalDayId: day.id,
      pageIds: [page.id, day.pageIds[0]!],
    });

    expect(reordered.days[0]?.pageIds).toEqual([
      page.id,
      day.pageIds[0],
    ]);
  });

  it("rejects incomplete or duplicate page orders", () => {
    const day = initial.days[0]!;
    expect(() =>
      applyDocumentOperation(initial, {
        id: "invalid-reorder",
        type: "journal-pages-reorder",
        journalId: initial.id,
        baseRevision: 0,
        resultingRevision: 1,
        createdAt: "2026-08-03T10:01:00.000Z",
        journalDayId: day.id,
        pageIds: [day.pageIds[0]!, day.pageIds[0]!],
      }),
    ).toThrow(OperationConflictError);
  });

  it("creates a named sketchbook and first page atomically", () => {
    const page = sketchbookPage("sketchbook-animals");
    const sketchbook = sketchbookWithPage(page);
    const operation: DocumentOperation = {
      id: "create-sketchbook-with-page",
      type: "sketchbook-create-with-page",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: page.createdAt,
      sketchbook,
      page,
    };

    const created = applyDocumentOperation(initial, operation);
    expect(created.sketchbooks).toContainEqual(sketchbook);
    expect(created.pages).toContainEqual(page);
    expect(applyDocumentOperation(created, operation)).toBe(created);
  });

  it("adds and reorders pages within a sketchbook", () => {
    const firstPage = sketchbookPage("sketchbook-animals");
    const sketchbook = sketchbookWithPage(firstPage);
    const created = applyDocumentOperation(initial, {
      id: "create-sketchbook-before-pages",
      type: "sketchbook-create-with-page",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: firstPage.createdAt,
      sketchbook,
      page: firstPage,
    });
    const secondPage = sketchbookPage(sketchbook.id, "sketch-page-two");
    const withSecondPage = applyDocumentOperation(created, {
      id: "add-second-sketch-page",
      type: "sketchbook-page-create",
      journalId: initial.id,
      baseRevision: 1,
      resultingRevision: 2,
      createdAt: secondPage.createdAt,
      sketchbookId: sketchbook.id,
      page: secondPage,
    });
    const reordered = applyDocumentOperation(withSecondPage, {
      id: "reorder-sketch-pages",
      type: "sketchbook-pages-reorder",
      journalId: initial.id,
      baseRevision: 2,
      resultingRevision: 3,
      createdAt: "2026-08-03T10:01:00.000Z",
      sketchbookId: sketchbook.id,
      pageIds: [secondPage.id, firstPage.id],
    });

    expect(reordered.sketchbooks.at(-1)?.pageIds).toEqual([
      secondPage.id,
      firstPage.id,
    ]);
  });

  it("rejects sketchbook pages owned by a diary day", () => {
    const page = {
      ...sketchbookPage("sketchbook-animals"),
      journalDayId: initial.days[0]!.id,
    };
    expect(() =>
      applyDocumentOperation(initial, {
        id: "invalid-sketchbook-owner",
        type: "sketchbook-create-with-page",
        journalId: initial.id,
        baseRevision: 0,
        resultingRevision: 1,
        createdAt: page.createdAt,
        sketchbook: sketchbookWithPage(page),
        page,
      }),
    ).toThrow(OperationConflictError);
  });

  it("renames and reorders the sketchbook directory durably", () => {
    const existingSketchbook = initial.sketchbooks[0]!;
    const renamed = applyDocumentOperation(initial, {
      id: "rename-sketchbook",
      type: "sketchbook-rename",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: "2026-08-03T10:00:00.000Z",
      sketchbookId: existingSketchbook.id,
      name: "  Special Places  ",
    });
    expect(renamed.sketchbooks[0]?.name).toBe("Special Places");

    const page = sketchbookPage("sketchbook-animals");
    const sketchbook = sketchbookWithPage(page);
    const withSecondSketchbook = applyDocumentOperation(renamed, {
      id: "create-sketchbook-for-directory-order",
      type: "sketchbook-create-with-page",
      journalId: initial.id,
      baseRevision: 1,
      resultingRevision: 2,
      createdAt: page.createdAt,
      sketchbook,
      page,
    });
    const reordered = applyDocumentOperation(withSecondSketchbook, {
      id: "reorder-sketchbook-directory",
      type: "sketchbooks-reorder",
      journalId: initial.id,
      baseRevision: 2,
      resultingRevision: 3,
      createdAt: "2026-08-03T10:01:00.000Z",
      sketchbookIds: [sketchbook.id, existingSketchbook.id],
    });
    expect(reordered.sketchbooks.map((candidate) => candidate.id)).toEqual([
      sketchbook.id,
      existingSketchbook.id,
    ]);
  });

  it("rejects blank sketchbook names and incomplete directory orders", () => {
    const sketchbook = initial.sketchbooks[0]!;
    expect(() =>
      applyDocumentOperation(initial, {
        id: "blank-sketchbook-name",
        type: "sketchbook-rename",
        journalId: initial.id,
        baseRevision: 0,
        resultingRevision: 1,
        createdAt: "2026-08-03T10:00:00.000Z",
        sketchbookId: sketchbook.id,
        name: "   ",
      }),
    ).toThrow(OperationConflictError);
    expect(() =>
      applyDocumentOperation(initial, {
        id: "missing-sketchbook-order",
        type: "sketchbooks-reorder",
        journalId: initial.id,
        baseRevision: 0,
        resultingRevision: 1,
        createdAt: "2026-08-03T10:00:00.000Z",
        sketchbookIds: [],
      }),
    ).toThrow(OperationConflictError);
  });

  it("resizes a page object with one idempotent operation", () => {
    const page = initial.pages[0]!;
    const object = page.objects.find((candidate) => candidate.type === "voice")!;
    const operation: DocumentOperation = {
      id: "resize-text-block",
      type: "page-object-resize",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: "2026-08-03T10:00:00.000Z",
      pageId: page.id,
      objectId: object.id,
      frame: { width: 0.4, height: 0.3 },
    };

    const resized = applyDocumentOperation(initial, operation);
    expect(
      resized.pages[0]?.objects.find(
        (candidate) => candidate.id === object.id,
      )?.frame,
    ).toEqual({ width: 0.4, height: 0.3 });
    expect(applyDocumentOperation(resized, operation)).toBe(resized);
  });

  it("moves a page object with one durable operation", () => {
    const page = initial.pages[0]!;
    const object = page.objects.find((candidate) => candidate.type === "voice")!;
    const moved = applyDocumentOperation(initial, {
      id: "move-text-block",
      type: "page-object-move",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: "2026-08-03T10:00:00.000Z",
      pageId: page.id,
      objectId: object.id,
      position: { x: 0.45, y: 0.35 },
    });

    expect(
      moved.pages[0]?.objects.find(
        (candidate) => candidate.id === object.id,
      )?.position,
    ).toEqual({ x: 0.45, y: 0.35 });
    expect(moved.appliedOperationIds).toContain("move-text-block");
  });
});
