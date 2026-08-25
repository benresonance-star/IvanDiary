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
): Extract<DocumentOperation, { type: "page-object-add" }> {
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

  it("updates, reorders, and atomically releases structured canvas text", () => {
    const withFirst = applyDocumentOperation(initial, textOperation(0, "add-first"));
    const secondOperation = textOperation(1, "add-second");
    secondOperation.object = { ...secondOperation.object, id: "second-text" };
    const withTexts = applyDocumentOperation(withFirst, secondOperation);
    const layout = applyDocumentOperation(withTexts, {
      id: "stack-layout",
      type: "page-text-stack-layout-update",
      journalId: initial.id,
      baseRevision: 2,
      resultingRevision: 3,
      createdAt: "2026-08-03T10:01:00.000Z",
      pageId: initial.pages[0]!.id,
      position: { x: 0.1, y: 0.15 },
      frame: { width: 0.8, height: 0.7 },
    });
    const firstMember = applyDocumentOperation(layout, {
      id: "stack-first",
      type: "page-text-stack-membership-update",
      journalId: initial.id,
      baseRevision: 3,
      resultingRevision: 4,
      createdAt: "2026-08-03T10:02:00.000Z",
      pageId: initial.pages[0]!.id,
      objectId: "test-text",
      membership: { kind: "stack" },
    });
    const secondMember = applyDocumentOperation(firstMember, {
      id: "stack-second",
      type: "page-text-stack-membership-update",
      journalId: initial.id,
      baseRevision: 4,
      resultingRevision: 5,
      createdAt: "2026-08-03T10:03:00.000Z",
      pageId: initial.pages[0]!.id,
      objectId: "second-text",
      membership: { kind: "stack" },
    });
    const reordered = applyDocumentOperation(secondMember, {
      id: "stack-reorder",
      type: "page-text-stack-reorder",
      journalId: initial.id,
      baseRevision: 5,
      resultingRevision: 6,
      createdAt: "2026-08-03T10:04:00.000Z",
      pageId: initial.pages[0]!.id,
      memberIds: ["second-text", "test-text"],
    });
    const released = applyDocumentOperation(reordered, {
      id: "release-text",
      type: "page-text-stack-membership-update",
      journalId: initial.id,
      baseRevision: 6,
      resultingRevision: 7,
      createdAt: "2026-08-03T10:05:00.000Z",
      pageId: initial.pages[0]!.id,
      objectId: "second-text",
      membership: {
        kind: "free",
        position: { x: 0.2, y: 0.3 },
        frame: { width: 0.4, height: 0.2 },
      },
    });

    expect(reordered.pages[0]?.textStack?.memberIds).toEqual([
      "second-text",
      "test-text",
    ]);
    expect(released.pages[0]?.textStack?.memberIds).toEqual(["test-text"]);
    expect(released.pages[0]?.objects.find(({ id }) => id === "second-text"))
      .toEqual(expect.objectContaining({
        position: { x: 0.2, y: 0.3 },
        frame: { width: 0.4, height: 0.2 },
      }));
    expect(applyDocumentOperation(released, {
      id: "release-text",
      type: "page-text-stack-membership-update",
      journalId: initial.id,
      baseRevision: 6,
      resultingRevision: 7,
      createdAt: "2026-08-03T10:05:00.000Z",
      pageId: initial.pages[0]!.id,
      objectId: "second-text",
      membership: { kind: "free", position: { x: 0, y: 0 }, frame: { width: 1, height: 1 } },
    })).toBe(released);
  });

  it("persists the text stack sketch layer independently of its members", () => {
    const layout = applyDocumentOperation(initial, {
      id: "stack-layout",
      type: "page-text-stack-layout-update",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: "2026-08-03T10:01:00.000Z",
      pageId: initial.pages[0]!.id,
      position: { x: 0.1, y: 0.15 },
      frame: { width: 0.8, height: 0.7 },
    });
    const behindSketch = applyDocumentOperation(layout, {
      id: "stack-layer",
      type: "page-text-stack-layer-update",
      journalId: initial.id,
      baseRevision: 1,
      resultingRevision: 2,
      createdAt: "2026-08-03T10:02:00.000Z",
      pageId: initial.pages[0]!.id,
      layer: "behind-sketch",
    });

    expect(behindSketch.pages[0]?.textStack?.layer).toBe("behind-sketch");
  });

  it("sets and restores a page background colour", () => {
    const coloured = applyDocumentOperation(initial, {
      id: "set-page-background",
      type: "page-background-update",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: "2026-08-03T10:00:00.000Z",
      pageId: initial.pages[0]!.id,
      backgroundColor: "#AABBCC",
    });
    expect(coloured.pages[0]?.backgroundColor).toBe("#aabbcc");

    const restored = applyDocumentOperation(coloured, {
      id: "restore-page-background",
      type: "page-background-update",
      journalId: initial.id,
      baseRevision: 1,
      resultingRevision: 2,
      createdAt: "2026-08-03T10:01:00.000Z",
      pageId: initial.pages[0]!.id,
    });
    expect(restored.pages[0]).not.toHaveProperty("backgroundColor");
  });

  it("rejects an invalid page background colour", () => {
    expect(() => applyDocumentOperation(initial, {
      id: "invalid-page-background",
      type: "page-background-update",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: "2026-08-03T10:00:00.000Z",
      pageId: initial.pages[0]!.id,
      backgroundColor: "not-a-colour",
    })).toThrow(OperationConflictError);
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

  it("creates, renames, favourites, reorders, and deletes stories", () => {
    const timestamp = "2026-08-03T10:00:00.000Z";
    const second = { ...initial.stories[0]!, id: "story-two", name: "Travels", favourite: false, pages: [], createdAt: timestamp, updatedAt: timestamp };
    const created = applyDocumentOperation(initial, { id: "create-story", type: "story-create", journalId: initial.id, baseRevision: 0, resultingRevision: 1, createdAt: timestamp, story: second });
    const renamed = applyDocumentOperation(created, { id: "rename-story", type: "story-rename", journalId: initial.id, baseRevision: 1, resultingRevision: 2, createdAt: timestamp, storyId: second.id, name: "Our Travels" });
    const favourited = applyDocumentOperation(renamed, { id: "favourite-story", type: "favourite-set", journalId: initial.id, baseRevision: 2, resultingRevision: 3, createdAt: timestamp, targetType: "story", targetId: second.id, favourite: true });
    const reordered = applyDocumentOperation(favourited, { id: "reorder-stories", type: "stories-reorder", journalId: initial.id, baseRevision: 3, resultingRevision: 4, createdAt: timestamp, storyIds: [second.id, initial.stories[0]!.id] });
    const deleted = applyDocumentOperation(reordered, { id: "delete-story", type: "story-delete", journalId: initial.id, baseRevision: 4, resultingRevision: 5, createdAt: timestamp, storyId: second.id });
    expect(favourited.stories[1]).toEqual(expect.objectContaining({ name: "Our Travels", favourite: true }));
    expect(reordered.stories[0]?.id).toBe(second.id);
    expect(deleted.stories.map((story) => story.id)).toEqual([initial.stories[0]!.id]);
    expect(deleted.favourites).not.toContainEqual(expect.objectContaining({ targetId: second.id }));
  });

  it("favourites a later diary page without marking the whole day", () => {
    const day = initial.days[0]!;
    const page = emptyPage(day.id);
    const withPage = applyDocumentOperation(initial, {
      id: "create-second-page-for-favourite",
      type: "page-create",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: page.createdAt,
      journalDayId: day.id,
      page,
    });
    const next = applyDocumentOperation(withPage, {
      id: "favourite-page-two",
      type: "favourite-set",
      journalId: initial.id,
      baseRevision: 1,
      resultingRevision: 2,
      createdAt: "2026-08-03T10:01:00.000Z",
      targetType: "page",
      targetId: page.id,
      favourite: true,
    });

    expect(next.days[0]?.favourite).toBe(false);
    expect(next.favourites).toContainEqual(
      expect.objectContaining({
        targetType: "page",
        targetId: page.id,
      }),
    );
  });

  it("reorders every favourite durably", () => {
    const favourites = [
      {
        id: "favourite-one",
        targetType: "journal-day" as const,
        targetId: initial.days[0]!.id,
        createdAt: "2026-08-03T10:00:00.000Z",
      },
      {
        id: "favourite-two",
        targetType: "sketchbook" as const,
        targetId: initial.sketchbooks[0]!.id,
        createdAt: "2026-08-03T10:01:00.000Z",
      },
    ];
    const reordered = applyDocumentOperation(
      { ...initial, favourites },
      {
        id: "reorder-favourites",
        type: "favourites-reorder",
        journalId: initial.id,
        baseRevision: 0,
        resultingRevision: 1,
        createdAt: "2026-08-03T10:02:00.000Z",
        favouriteIds: ["favourite-two", "favourite-one"],
      },
    );

    expect(reordered.favourites.map((favourite) => favourite.id)).toEqual([
      "favourite-two",
      "favourite-one",
    ]);
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

  it("rejects an eleventh page in a journal day", () => {
    const day = initial.days[0]!;
    const full = {
      ...initial,
      days: initial.days.map((candidate) =>
        candidate.id === day.id
          ? { ...candidate, pageIds: Array.from({ length: 10 }, (_, index) => `page-${index + 1}`) }
          : candidate,
      ),
    };
    const page = emptyPage(day.id);

    expect(() =>
      applyDocumentOperation(full, {
        id: "create-eleventh-page",
        type: "page-create",
        journalId: initial.id,
        baseRevision: 0,
        resultingRevision: 1,
        createdAt: page.createdAt,
        journalDayId: day.id,
        page,
      }),
    ).toThrow("no more than 10 pages");
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

  it("deletes a journal page while retaining an adjacent page", () => {
    const day = initial.days[0]!;
    const secondPage = emptyPage(day.id);
    const withSecondPage = applyDocumentOperation(initial, {
      id: "create-page-before-delete",
      type: "page-create",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: secondPage.createdAt,
      journalDayId: day.id,
      page: secondPage,
    });
    const deleted = applyDocumentOperation(withSecondPage, {
      id: "delete-second-page",
      type: "page-delete",
      journalId: initial.id,
      baseRevision: 1,
      resultingRevision: 2,
      createdAt: "2026-08-03T10:01:00.000Z",
      pageId: secondPage.id,
    });

    expect(deleted.pages).not.toContainEqual(expect.objectContaining({ id: secondPage.id }));
    expect(deleted.days[0]?.pageIds).toEqual(day.pageIds);
  });

  it("does not delete the only page in a collection", () => {
    expect(() =>
      applyDocumentOperation(initial, {
        id: "delete-only-page",
        type: "page-delete",
        journalId: initial.id,
        baseRevision: 0,
        resultingRevision: 1,
        createdAt: "2026-08-03T10:01:00.000Z",
        pageId: initial.days[0]!.pageIds[0]!,
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

  it("rejects an eleventh page in a sketchbook", () => {
    const firstPage = sketchbookPage("sketchbook-full");
    const sketchbook = {
      ...sketchbookWithPage(firstPage),
      pageIds: Array.from({ length: 10 }, (_, index) => `sketch-page-${index + 1}`),
    };
    const full = {
      ...initial,
      sketchbooks: [...initial.sketchbooks, sketchbook],
    };
    const page = sketchbookPage(sketchbook.id, "sketch-page-11");

    expect(() =>
      applyDocumentOperation(full, {
        id: "create-eleventh-sketch-page",
        type: "sketchbook-page-create",
        journalId: initial.id,
        baseRevision: 0,
        resultingRevision: 1,
        createdAt: page.createdAt,
        sketchbookId: sketchbook.id,
        page,
      }),
    ).toThrow("no more than 10 pages");
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

  it("deletes a sketchbook, its pages, and related favourites", () => {
    const page = sketchbookPage("sketchbook-to-delete");
    const sketchbook = sketchbookWithPage(page);
    const deleted = applyDocumentOperation(
      {
        ...initial,
        sketchbooks: [...initial.sketchbooks, sketchbook],
        pages: [...initial.pages, page],
        favourites: [
          {
            id: "favourite-sketchbook",
            targetType: "sketchbook",
            targetId: sketchbook.id,
            createdAt: "2026-08-03T10:00:00.000Z",
          },
          {
            id: "favourite-sketchbook-page",
            targetType: "page",
            targetId: page.id,
            createdAt: "2026-08-03T10:00:00.000Z",
          },
        ],
      },
      {
        id: "delete-sketchbook",
        type: "sketchbook-delete",
        journalId: initial.id,
        baseRevision: 0,
        resultingRevision: 1,
        createdAt: "2026-08-03T10:01:00.000Z",
        sketchbookId: sketchbook.id,
      },
    );

    expect(deleted.sketchbooks).not.toContainEqual(sketchbook);
    expect(deleted.pages.some((candidate) => candidate.id === page.id)).toBe(false);
    expect(deleted.favourites).toEqual([]);
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

  it("persists accessible drawing grid presets on a page", () => {
    const page = initial.pages[0]!;
    const updated = applyDocumentOperation(initial, {
      id: "enable-page-grid",
      type: "page-drawing-grid-update",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: "2026-08-03T10:00:00.000Z",
      pageId: page.id,
      grid: {
        enabled: true,
        snapToGrid: false,
        spacing: 96,
        rotationDegrees: 45,
        type: "dots",
        color: "#884422",
      },
    });
    expect(updated.pages[0]?.drawingGrid).toEqual({
      enabled: true,
      snapToGrid: false,
      spacing: 96,
      rotationDegrees: 45,
      type: "dots",
      color: "#884422",
    });
  });

  it("keeps snapping enabled for legacy grid operations", () => {
    const page = initial.pages[0]!;
    const legacyOperation = {
      id: "legacy-page-grid",
      type: "page-drawing-grid-update",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: "2026-08-03T10:00:00.000Z",
      pageId: page.id,
      grid: {
        enabled: true,
        spacing: 60,
        rotationDegrees: 0,
        type: "lines",
        color: "#435b70",
      },
    } as unknown as DocumentOperation;

    const updated = applyDocumentOperation(initial, legacyOperation);
    expect(updated.pages[0]?.drawingGrid?.snapToGrid).toBe(true);
  });

  it("accepts every 15 degree grid rotation the drawing tools offer", () => {
    const page = initial.pages[0]!;
    const updated = applyDocumentOperation(initial, {
      id: "rotate-page-grid",
      type: "page-drawing-grid-update",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: "2026-08-03T10:00:00.000Z",
      pageId: page.id,
      grid: {
        enabled: true,
        snapToGrid: true,
        spacing: 60,
        rotationDegrees: 75,
        type: "lines",
        color: "#435b70",
      },
    });
    expect(updated.pages[0]?.drawingGrid?.rotationDegrees).toBe(75);
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

  it("updates structured My Story content and layout durably", () => {
    const storyPage = initial.stories[0]!.pages[0]!;
    const withText = applyDocumentOperation(initial, {
      id: "add-story-heading",
      type: "my-story-text-add",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: "2026-08-03T10:00:00.000Z",
      pageId: storyPage.id,
      block: {
        id: "story-heading",
        text: "Growing up",
        role: "heading",
        color: "#245b8a",
        revision: 0,
        createdAt: "2026-08-03T10:00:00.000Z",
      },
    });
    const resized = applyDocumentOperation(withText, {
      id: "resize-story-sides",
      type: "my-story-layout-update",
      journalId: initial.id,
      baseRevision: 1,
      resultingRevision: 2,
      createdAt: "2026-08-03T10:01:00.000Z",
      pageId: storyPage.id,
      splitRatio: 0.6,
      textSide: "right",
      textBackgroundColor: "#f4ead8",
      textColor: "#171410",
    });

    expect(withText.stories[0]?.defaultTextColor).toBe("#245b8a");
    expect(resized.stories[0]?.pages[0]).toEqual(
      expect.objectContaining({
        splitRatio: 0.6,
        textSide: "right",
        textBackgroundColor: "#f4ead8",
        textColor: "#171410",
        textBlocks: [
          expect.objectContaining({
            text: "Growing up",
            role: "heading",
            color: "#171410",
          }),
        ],
      }),
    );
    expect(resized.stories[0]?.defaultTextColor).toBe("#171410");

    const contrastAdjusted = applyDocumentOperation(withText, {
      id: "adjust-story-contrast",
      type: "my-story-layout-update",
      journalId: initial.id,
      baseRevision: 1,
      resultingRevision: 2,
      createdAt: "2026-08-03T10:01:00.000Z",
      pageId: storyPage.id,
      textBackgroundColor: "#245b8a",
    });
    expect(contrastAdjusted.stories[0]?.pages[0]).toEqual(
      expect.objectContaining({
        textBackgroundColor: "#245b8a",
        textColor: "#ffffff",
        textBlocks: [
          expect.objectContaining({ color: "#ffffff" }),
        ],
      }),
    );

    const withRecording = applyDocumentOperation(initial, {
      id: "add-story-recording",
      type: "my-story-recording-add",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: "2026-08-03T10:02:00.000Z",
      pageId: storyPage.id,
      recording: {
        id: "story-recording",
        asset: {
          id: "story-recording-asset",
          localUri: "file:///story-recording.m4a",
          mimeType: "audio/mp4",
          byteLength: 128,
          checksum: "story-recording-checksum",
        },
        durationMs: 2_000,
        transcriptionStatus: "not-requested",
        revision: 0,
        createdAt: "2026-08-03T10:02:00.000Z",
      },
    });
    expect(withRecording.stories[0]?.pages[0]?.recordings).toEqual([
      expect.objectContaining({ id: "story-recording" }),
    ]);
  });

  it("adds and updates durable My Story links", () => {
    const storyPage = initial.stories[0]!.pages[0]!;
    const link = {
      id: "story-link",
      url: "https://example.com/memory",
      title: "Family archive",
      revision: 0,
      createdAt: "2026-08-03T10:00:00.000Z",
    };
    const added = applyDocumentOperation(initial, {
      id: "add-story-link",
      type: "my-story-link-add",
      journalId: initial.id,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: "2026-08-03T10:00:00.000Z",
      pageId: storyPage.id,
      link,
    });
    const updated = applyDocumentOperation(added, {
      id: "update-story-link",
      type: "my-story-link-update",
      journalId: initial.id,
      baseRevision: 1,
      resultingRevision: 2,
      createdAt: "2026-08-03T10:01:00.000Z",
      pageId: storyPage.id,
      link: { ...link, title: "Updated archive", revision: 1 },
    });

    expect(updated.stories[0]?.pages[0]?.links).toEqual([
      expect.objectContaining({
        id: "story-link",
        title: "Updated archive",
      }),
    ]);
  });
});
