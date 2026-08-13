import type {
  DocumentOperation,
  Favourite,
  JournalSnapshot,
  Page,
} from "./models";
import { MAX_PAGES_PER_COLLECTION } from "./models";

export class OperationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationConflictError";
  }
}

function updatePage(
  snapshot: JournalSnapshot,
  pageId: string,
  update: (page: Page) => Page,
): JournalSnapshot {
  let found = false;
  const pages = snapshot.pages.map((page) => {
    if (page.id !== pageId) {
      return page;
    }
    found = true;
    return update(page);
  });

  if (!found) {
    throw new OperationConflictError(`Page ${pageId} does not exist.`);
  }

  return { ...snapshot, pages };
}

function applyFavourite(
  snapshot: JournalSnapshot,
  operation: Extract<DocumentOperation, { type: "favourite-set" }>,
): JournalSnapshot {
  const favouriteId = `favourite-${operation.targetType}-${operation.targetId}`;
  const withoutTarget = snapshot.favourites.filter(
    (favourite) =>
      !(
        favourite.targetType === operation.targetType &&
        favourite.targetId === operation.targetId
      ),
  );
  const favourites: Favourite[] = operation.favourite
    ? [
        ...withoutTarget,
        {
          id: favouriteId,
          targetType: operation.targetType,
          targetId: operation.targetId,
          createdAt: operation.createdAt,
        },
      ]
    : withoutTarget;

  switch (operation.targetType) {
    case "journal-day":
      return {
        ...snapshot,
        days: snapshot.days.map((day) =>
          day.id === operation.targetId
            ? { ...day, favourite: operation.favourite }
            : day,
        ),
        favourites,
      };
    case "sketchbook":
      return {
        ...snapshot,
        sketchbooks: snapshot.sketchbooks.map((sketchbook) =>
          sketchbook.id === operation.targetId
            ? { ...sketchbook, favourite: operation.favourite }
            : sketchbook,
        ),
        favourites,
      };
    case "page":
      return { ...snapshot, favourites };
    default: {
      const exhaustiveTarget: never = operation.targetType;
      throw new Error(`Unsupported favourite target: ${exhaustiveTarget}`);
    }
  }
}

export function applyDocumentOperation(
  snapshot: JournalSnapshot,
  operation: DocumentOperation,
): JournalSnapshot {
  if (snapshot.appliedOperationIds.includes(operation.id)) {
    return snapshot;
  }
  if (operation.journalId !== snapshot.id) {
    throw new OperationConflictError("Operation belongs to another journal.");
  }
  if (
    operation.baseRevision !== snapshot.revision ||
    operation.resultingRevision !== operation.baseRevision + 1
  ) {
    throw new OperationConflictError(
      `Expected revision ${snapshot.revision}, received ${operation.baseRevision}.`,
    );
  }

  let next: JournalSnapshot;
  switch (operation.type) {
    case "journal-day-create":
      next = snapshot.days.some((day) => day.id === operation.day.id)
        ? snapshot
        : { ...snapshot, days: [...snapshot.days, operation.day] };
      break;
    case "page-create":
      if (
        operation.page.journalDayId !== operation.journalDayId ||
        operation.page.sketchbookId
      ) {
        throw new OperationConflictError(
          "Journal page ownership does not match its day.",
        );
      }
      if (
        !snapshot.days.some((day) => day.id === operation.journalDayId)
      ) {
        throw new OperationConflictError(
          `Journal day ${operation.journalDayId} does not exist.`,
        );
      }
      if (
        snapshot.days.some(
          (day) =>
            day.id === operation.journalDayId &&
            day.pageIds.length >= MAX_PAGES_PER_COLLECTION,
        )
      ) {
        throw new OperationConflictError("A journal day can contain no more than 10 pages.");
      }
      if (
        snapshot.pages.some(
          (page) =>
            page.id === operation.page.id &&
            page.journalDayId !== operation.journalDayId,
        )
      ) {
        throw new OperationConflictError(
          `Page ${operation.page.id} belongs to another day.`,
        );
      }
      if (
        snapshot.days.some(
          (day) =>
            day.id === operation.journalDayId &&
            day.pageIds.includes(operation.page.id),
        ) &&
        !snapshot.pages.some((page) => page.id === operation.page.id)
      ) {
        throw new OperationConflictError(
          `Journal day ${operation.journalDayId} has an invalid page reference.`,
        );
      }
      next = snapshot.pages.some((page) => page.id === operation.page.id)
        ? snapshot
        : {
            ...snapshot,
            pages: [...snapshot.pages, operation.page],
            days: snapshot.days.map((day) =>
              day.id === operation.journalDayId
                ? {
                    ...day,
                    pageIds: [...day.pageIds, operation.page.id],
                    revision: day.revision + 1,
                  }
                : day,
            ),
          };
      break;
    case "journal-pages-reorder": {
      const day = snapshot.days.find(
        (candidate) => candidate.id === operation.journalDayId,
      );
      const uniquePageIds = new Set(operation.pageIds);
      if (!day) {
        throw new OperationConflictError(
          `Journal day ${operation.journalDayId} does not exist.`,
        );
      }
      if (
        operation.pageIds.length !== day.pageIds.length ||
        uniquePageIds.size !== day.pageIds.length ||
        operation.pageIds.some((pageId) => !day.pageIds.includes(pageId))
      ) {
        throw new OperationConflictError(
          "Reordered pages must contain every page exactly once.",
        );
      }
      next = {
        ...snapshot,
        days: snapshot.days.map((candidate) =>
          candidate.id === day.id
            ? {
                ...candidate,
                pageIds: [...operation.pageIds],
                revision: candidate.revision + 1,
              }
            : candidate,
        ),
      };
      break;
    }
    case "sketchbook-create":
      next = snapshot.sketchbooks.some(
        (sketchbook) => sketchbook.id === operation.sketchbook.id,
      )
        ? snapshot
        : {
            ...snapshot,
            sketchbooks: [...snapshot.sketchbooks, operation.sketchbook],
          };
      break;
    case "sketchbook-create-with-page":
      if (
        operation.page.sketchbookId !== operation.sketchbook.id ||
        operation.page.journalDayId ||
        operation.sketchbook.pageIds.length !== 1 ||
        operation.sketchbook.pageIds[0] !== operation.page.id
      ) {
        throw new OperationConflictError(
          "The first sketchbook page has invalid ownership.",
        );
      }
      if (
        snapshot.sketchbooks.some(
          (sketchbook) => sketchbook.id === operation.sketchbook.id,
        ) ||
        snapshot.pages.some((page) => page.id === operation.page.id)
      ) {
        throw new OperationConflictError(
          "The sketchbook or first page already exists.",
        );
      }
      next = {
        ...snapshot,
        sketchbooks: [...snapshot.sketchbooks, operation.sketchbook],
        pages: [...snapshot.pages, operation.page],
      };
      break;
    case "sketchbook-page-create":
      if (
        operation.page.sketchbookId !== operation.sketchbookId ||
        operation.page.journalDayId
      ) {
        throw new OperationConflictError(
          "Sketchbook page ownership does not match its sketchbook.",
        );
      }
      if (
        !snapshot.sketchbooks.some(
          (sketchbook) => sketchbook.id === operation.sketchbookId,
        )
      ) {
        throw new OperationConflictError(
          `Sketchbook ${operation.sketchbookId} does not exist.`,
        );
      }
      if (
        snapshot.sketchbooks.some(
          (sketchbook) =>
            sketchbook.id === operation.sketchbookId &&
            sketchbook.pageIds.length >= MAX_PAGES_PER_COLLECTION,
        )
      ) {
        throw new OperationConflictError("A sketchbook can contain no more than 10 pages.");
      }
      if (
        snapshot.pages.some((page) => page.id === operation.page.id)
      ) {
        throw new OperationConflictError(
          `Page ${operation.page.id} already exists.`,
        );
      }
      next = {
        ...snapshot,
        pages: [...snapshot.pages, operation.page],
        sketchbooks: snapshot.sketchbooks.map((sketchbook) =>
          sketchbook.id === operation.sketchbookId
            ? {
                ...sketchbook,
                pageIds: [...sketchbook.pageIds, operation.page.id],
                revision: sketchbook.revision + 1,
                updatedAt: operation.createdAt,
              }
            : sketchbook,
        ),
      };
      break;
    case "sketchbook-pages-reorder": {
      const sketchbook = snapshot.sketchbooks.find(
        (candidate) => candidate.id === operation.sketchbookId,
      );
      const uniquePageIds = new Set(operation.pageIds);
      if (!sketchbook) {
        throw new OperationConflictError(
          `Sketchbook ${operation.sketchbookId} does not exist.`,
        );
      }
      if (
        operation.pageIds.length !== sketchbook.pageIds.length ||
        uniquePageIds.size !== sketchbook.pageIds.length ||
        operation.pageIds.some(
          (pageId) => !sketchbook.pageIds.includes(pageId),
        )
      ) {
        throw new OperationConflictError(
          "Reordered sketchbook pages must contain every page exactly once.",
        );
      }
      next = {
        ...snapshot,
        sketchbooks: snapshot.sketchbooks.map((candidate) =>
          candidate.id === sketchbook.id
            ? {
                ...candidate,
                pageIds: [...operation.pageIds],
                revision: candidate.revision + 1,
                updatedAt: operation.createdAt,
              }
            : candidate,
        ),
      };
      break;
    }
    case "page-delete": {
      const page = snapshot.pages.find(
        (candidate) => candidate.id === operation.pageId,
      );
      if (!page) {
        throw new OperationConflictError(
          `Page ${operation.pageId} does not exist.`,
        );
      }
      const day = page.journalDayId
        ? snapshot.days.find((candidate) => candidate.id === page.journalDayId)
        : undefined;
      const sketchbook = page.sketchbookId
        ? snapshot.sketchbooks.find((candidate) => candidate.id === page.sketchbookId)
        : undefined;
      const ownerPageIds = day?.pageIds ?? sketchbook?.pageIds;
      if (!ownerPageIds?.includes(page.id)) {
        throw new OperationConflictError(
          `Page ${page.id} does not have a valid owner.`,
        );
      }
      if (ownerPageIds.length <= 1) {
        throw new OperationConflictError(
          "A diary day or sketchbook must keep at least one page.",
        );
      }
      next = {
        ...snapshot,
        pages: snapshot.pages.filter((candidate) => candidate.id !== page.id),
        days: day
          ? snapshot.days.map((candidate) =>
              candidate.id === day.id
                ? {
                    ...candidate,
                    pageIds: candidate.pageIds.filter((pageId) => pageId !== page.id),
                    revision: candidate.revision + 1,
                  }
                : candidate,
            )
          : snapshot.days,
        sketchbooks: sketchbook
          ? snapshot.sketchbooks.map((candidate) =>
              candidate.id === sketchbook.id
                ? {
                    ...candidate,
                    pageIds: candidate.pageIds.filter((pageId) => pageId !== page.id),
                    revision: candidate.revision + 1,
                    updatedAt: operation.createdAt,
                  }
                : candidate,
            )
          : snapshot.sketchbooks,
        favourites: snapshot.favourites.filter(
          (favourite) =>
            favourite.targetType !== "page" || favourite.targetId !== page.id,
        ),
      };
      break;
    }
    case "sketchbook-rename": {
      const name = operation.name.trim();
      if (!name) {
        throw new OperationConflictError(
          "A sketchbook name cannot be empty.",
        );
      }
      if (
        !snapshot.sketchbooks.some(
          (sketchbook) => sketchbook.id === operation.sketchbookId,
        )
      ) {
        throw new OperationConflictError(
          `Sketchbook ${operation.sketchbookId} does not exist.`,
        );
      }
      next = {
        ...snapshot,
        sketchbooks: snapshot.sketchbooks.map((sketchbook) =>
          sketchbook.id === operation.sketchbookId
            ? {
                ...sketchbook,
                name,
                revision: sketchbook.revision + 1,
                updatedAt: operation.createdAt,
              }
            : sketchbook,
        ),
      };
      break;
    }
    case "sketchbook-delete": {
      const sketchbook = snapshot.sketchbooks.find(
        (candidate) => candidate.id === operation.sketchbookId,
      );
      if (!sketchbook) {
        throw new OperationConflictError(
          `Sketchbook ${operation.sketchbookId} does not exist.`,
        );
      }
      const pageIds = new Set(sketchbook.pageIds);
      next = {
        ...snapshot,
        sketchbooks: snapshot.sketchbooks.filter(
          (candidate) => candidate.id !== sketchbook.id,
        ),
        pages: snapshot.pages.filter((page) => !pageIds.has(page.id)),
        favourites: snapshot.favourites.filter(
          (favourite) =>
            !(
              favourite.targetType === "sketchbook" &&
              favourite.targetId === sketchbook.id
            ) &&
            !(
              favourite.targetType === "page" &&
              pageIds.has(favourite.targetId)
            ),
        ),
      };
      break;
    }
    case "sketchbooks-reorder": {
      const uniqueSketchbookIds = new Set(operation.sketchbookIds);
      if (
        operation.sketchbookIds.length !== snapshot.sketchbooks.length ||
        uniqueSketchbookIds.size !== snapshot.sketchbooks.length ||
        operation.sketchbookIds.some(
          (sketchbookId) =>
            !snapshot.sketchbooks.some(
              (sketchbook) => sketchbook.id === sketchbookId,
            ),
        )
      ) {
        throw new OperationConflictError(
          "Reordered sketchbooks must contain every sketchbook exactly once.",
        );
      }
      next = {
        ...snapshot,
        sketchbooks: operation.sketchbookIds.map(
          (sketchbookId) =>
            snapshot.sketchbooks.find(
              (sketchbook) => sketchbook.id === sketchbookId,
            )!,
        ),
      };
      break;
    }
    case "favourite-set":
      next = applyFavourite(snapshot, operation);
      break;
    case "page-object-add":
      next = updatePage(snapshot, operation.pageId, (page) => ({
        ...page,
        objects: page.objects.some((object) => object.id === operation.object.id)
          ? page.objects
          : [...page.objects, operation.object],
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      break;
    case "page-drawing-grid-update": {
      if (
        ![36, 60, 96].includes(operation.grid.spacing) ||
        !Number.isInteger(operation.grid.rotationDegrees / 15) ||
        Math.abs(operation.grid.rotationDegrees) >= 90
      ) {
        throw new OperationConflictError("The drawing grid settings are invalid.");
      }
      next = updatePage(snapshot, operation.pageId, (page) => ({
        ...page,
        drawingGrid: operation.grid,
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      break;
    }
    case "page-object-update":
      next = updatePage(snapshot, operation.pageId, (page) => ({
        ...page,
        objects: page.objects.map((object) =>
          object.id === operation.object.id ? operation.object : object,
        ),
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      break;
    case "page-object-move":
      next = updatePage(snapshot, operation.pageId, (page) => ({
        ...page,
        objects: page.objects.map((object) =>
          object.id === operation.objectId
            ? {
                ...object,
                position: operation.position,
                revision: object.revision + 1,
              }
            : object,
        ),
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      break;
    case "page-object-resize":
      next = updatePage(snapshot, operation.pageId, (page) => ({
        ...page,
        objects: page.objects.map((object) =>
          object.id === operation.objectId
            ? {
                ...object,
                frame: operation.frame,
                revision: object.revision + 1,
              }
            : object,
        ),
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      break;
    case "page-object-delete":
      next = updatePage(snapshot, operation.pageId, (page) => ({
        ...page,
        objects: page.objects.filter(
          (object) => object.id !== operation.objectId,
        ),
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      break;
    case "page-paper-update":
      next = updatePage(snapshot, operation.pageId, (page) => ({
        ...page,
        paperStyle: operation.paperStyle,
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      break;
    case "settings-update":
      next = {
        ...snapshot,
        settings: { ...snapshot.settings, ...operation.settings },
      };
      break;
    case "drawing-stroke-add":
    case "drawing-stroke-delete":
      next = snapshot;
      break;
    default: {
      const exhaustiveOperation: never = operation;
      throw new Error(`Unsupported document operation: ${exhaustiveOperation}`);
    }
  }

  return {
    ...next,
    revision: operation.resultingRevision,
    updatedAt: operation.createdAt,
    appliedOperationIds: [...next.appliedOperationIds, operation.id],
  };
}
