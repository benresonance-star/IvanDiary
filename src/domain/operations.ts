import type {
  DocumentOperation,
  Favourite,
  JournalSnapshot,
  MyStoryPage,
  Page,
} from "./models";
import {
  GRID_ROTATION_MAX,
  MAX_PAGES_PER_COLLECTION,
} from "./models";
import { isHexColor, readableTextColour } from "../utils/colour";
import { webHttpUrl } from "../utils/webHttpUrl";
import { normalizedStoryRenderOrder, renderItemKey } from "./storyRenderOrder";

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

function updateStoryPage(
  snapshot: JournalSnapshot,
  pageId: string,
  update: (page: MyStoryPage) => MyStoryPage,
): JournalSnapshot {
  const story = snapshot.myStory;
  if (!story) {
    throw new OperationConflictError("My Story is not available.");
  }
  let found = false;
  const pages = story.pages.map((page) => {
    if (page.id !== pageId) {
      return page;
    }
    found = true;
    return update(page);
  });
  if (!found) {
    throw new OperationConflictError(`My Story page ${pageId} does not exist.`);
  }
  return { ...snapshot, myStory: { ...story, pages } };
}

function isExactReorder(currentIds: string[], nextIds: string[]): boolean {
  const uniqueIds = new Set(nextIds);
  return (
    nextIds.length === currentIds.length &&
    uniqueIds.size === currentIds.length &&
    nextIds.every((id) => currentIds.includes(id))
  );
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
    case "favourites-reorder": {
      const uniqueFavouriteIds = new Set(operation.favouriteIds);
      if (
        operation.favouriteIds.length !== snapshot.favourites.length ||
        uniqueFavouriteIds.size !== snapshot.favourites.length ||
        operation.favouriteIds.some(
          (favouriteId) =>
            !snapshot.favourites.some(
              (favourite) => favourite.id === favouriteId,
            ),
        )
      ) {
        throw new OperationConflictError(
          "Reordered favourites must contain every favourite exactly once.",
        );
      }
      next = {
        ...snapshot,
        favourites: operation.favouriteIds.map(
          (favouriteId) =>
            snapshot.favourites.find(
              (favourite) => favourite.id === favouriteId,
            )!,
        ),
      };
      break;
    }
    case "favourite-set":
      next = applyFavourite(snapshot, operation);
      break;
    case "page-object-add":
      next = updatePage(snapshot, operation.pageId, (page) => {
        if (page.objects.some((object) => object.id === operation.object.id)) return page;
        const objects = [...page.objects];
        const index = operation.renderIndex === undefined ? objects.length : Math.max(0, Math.min(objects.length, operation.renderIndex));
        objects.splice(index, 0, operation.object);
        return { ...page, objects, revision: page.revision + 1, updatedAt: operation.createdAt };
      });
      break;
    case "page-drawing-grid-update": {
      if (
        (
          operation.grid.snapToGrid !== undefined &&
          typeof operation.grid.snapToGrid !== "boolean"
        ) ||
        ![36, 60, 96].includes(operation.grid.spacing) ||
        !Number.isInteger(operation.grid.rotationDegrees / 15) ||
        Math.abs(operation.grid.rotationDegrees) > GRID_ROTATION_MAX ||
        !["lines", "dots"].includes(operation.grid.type) ||
        !isHexColor(operation.grid.color)
      ) {
        throw new OperationConflictError("The drawing grid settings are invalid.");
      }
      next = updatePage(snapshot, operation.pageId, (page) => ({
        ...page,
        drawingGrid: {
          ...operation.grid,
          snapToGrid: operation.grid.snapToGrid !== false,
        },
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
    case "page-objects-reorder":
      next = updatePage(snapshot, operation.pageId, (page) => {
        const ids = new Set(operation.objectIds);
        if (ids.size !== page.objects.length || operation.objectIds.length !== page.objects.length ||
            page.objects.some((object) => !ids.has(object.id))) {
          throw new OperationConflictError("Reordered page objects must contain every object exactly once.");
        }
        return {
          ...page,
          objects: operation.objectIds.map((id) => page.objects.find((object) => object.id === id)!),
          revision: page.revision + 1,
          updatedAt: operation.createdAt,
        };
      });
      break;
    case "page-paper-update":
      next = updatePage(snapshot, operation.pageId, (page) => ({
        ...page,
        paperStyle: operation.paperStyle,
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      break;
    case "my-story-page-create": {
      const pages = snapshot.myStory?.pages ?? [];
      if (pages.length >= MAX_PAGES_PER_COLLECTION) {
        throw new OperationConflictError("My Story can contain no more than 10 pages.");
      }
      if (pages.some((page) => page.id === operation.page.id)) {
        throw new OperationConflictError(
          `My Story page ${operation.page.id} already exists.`,
        );
      }
      next = {
        ...snapshot,
        myStory: {
          defaultTextColor:
            snapshot.myStory?.defaultTextColor ?? "#171410",
          pages: [...pages, operation.page],
        },
      };
      break;
    }
    case "my-story-pages-reorder": {
      const pages = snapshot.myStory?.pages;
      const currentIds = pages?.map((page) => page.id) ?? [];
      if (!pages || !isExactReorder(currentIds, operation.pageIds)) {
        throw new OperationConflictError(
          "Reordered story pages must contain every page exactly once.",
        );
      }
      next = {
        ...snapshot,
        myStory: {
          ...snapshot.myStory,
          defaultTextColor:
            snapshot.myStory?.defaultTextColor ?? "#171410",
          pages: operation.pageIds.map(
            (pageId) => pages.find((page) => page.id === pageId)!,
          ),
        },
      };
      break;
    }
    case "my-story-page-delete": {
      const pages = snapshot.myStory?.pages;
      if (!pages?.some((page) => page.id === operation.pageId)) {
        throw new OperationConflictError(
          `My Story page ${operation.pageId} does not exist.`,
        );
      }
      if (pages.length <= 1) {
        throw new OperationConflictError(
          "My Story must keep at least one page.",
        );
      }
      next = {
        ...snapshot,
        myStory: {
          ...snapshot.myStory,
          defaultTextColor:
            snapshot.myStory?.defaultTextColor ?? "#171410",
          pages: pages.filter((page) => page.id !== operation.pageId),
        },
      };
      break;
    }
    case "my-story-layout-update": {
      if (
        (operation.splitRatio !== undefined &&
          (!Number.isFinite(operation.splitRatio) ||
            operation.splitRatio < 0.3 ||
            operation.splitRatio > 0.7)) ||
        (operation.textSide !== undefined &&
          operation.textSide !== "left" &&
          operation.textSide !== "right") ||
        (operation.textBackgroundColor !== undefined &&
          !isHexColor(operation.textBackgroundColor)) ||
        (operation.textColor !== undefined &&
          !isHexColor(operation.textColor))
      ) {
        throw new OperationConflictError("The My Story layout is invalid.");
      }
      let updatedTextColor: string | undefined;
      next = updateStoryPage(snapshot, operation.pageId, (page) => {
        const textBackgroundColor =
          operation.textBackgroundColor ?? page.textBackgroundColor;
        const requestedTextColor = operation.textColor ?? page.textColor;
        const textColor = readableTextColour(
          requestedTextColor,
          textBackgroundColor,
        );
        const textColorChanged =
          operation.textColor !== undefined || textColor !== page.textColor;
        updatedTextColor = textColorChanged ? textColor : undefined;
        return {
          ...page,
          ...(operation.splitRatio === undefined
            ? {}
            : { splitRatio: operation.splitRatio }),
          ...(operation.textSide === undefined
            ? {}
            : { textSide: operation.textSide }),
          ...(operation.textBackgroundColor === undefined
            ? {}
            : { textBackgroundColor }),
          textBlocks: textColorChanged
            ? page.textBlocks.map((block) => ({
                ...block,
                color: textColor,
                revision: block.revision + 1,
              }))
            : page.textBlocks,
          ...(textColorChanged ? { textColor } : {}),
          revision: page.revision + 1,
          updatedAt: operation.createdAt,
        };
      });
      if (updatedTextColor !== undefined) {
        next = {
          ...next,
          myStory: {
            ...next.myStory!,
            defaultTextColor: updatedTextColor,
          },
        };
      }
      break;
    }
    case "my-story-text-add":
      if (!isHexColor(operation.block.color)) {
        throw new OperationConflictError("The story text colour is invalid.");
      }
      next = updateStoryPage(snapshot, operation.pageId, (page) => ({
        ...page,
        textBlocks: page.textBlocks.some(
          (block) => block.id === operation.block.id,
        )
          ? page.textBlocks
          : [...page.textBlocks, operation.block],
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      next = {
        ...next,
        myStory: {
          ...next.myStory!,
          defaultTextColor: operation.block.color,
        },
      };
      break;
    case "my-story-text-update":
      if (!isHexColor(operation.block.color)) {
        throw new OperationConflictError("The story text colour is invalid.");
      }
      next = updateStoryPage(snapshot, operation.pageId, (page) => ({
        ...page,
        textBlocks: page.textBlocks.map((block) =>
          block.id === operation.block.id ? operation.block : block,
        ),
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      next = {
        ...next,
        myStory: {
          ...next.myStory!,
          defaultTextColor: operation.block.color,
        },
      };
      break;
    case "my-story-text-delete":
      next = updateStoryPage(snapshot, operation.pageId, (page) => ({
        ...page,
        textBlocks: page.textBlocks.filter(
          (block) => block.id !== operation.blockId,
        ),
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      break;
    case "my-story-texts-reorder":
      next = updateStoryPage(snapshot, operation.pageId, (page) => {
        const currentIds = page.textBlocks.map((block) => block.id);
        if (!isExactReorder(currentIds, operation.blockIds)) {
          throw new OperationConflictError(
            "Reordered story text must contain every block exactly once.",
          );
        }
        return {
          ...page,
          textBlocks: operation.blockIds.map(
            (blockId) =>
              page.textBlocks.find((block) => block.id === blockId)!,
          ),
          revision: page.revision + 1,
          updatedAt: operation.createdAt,
        };
      });
      break;
    case "my-story-photo-add":
      next = updateStoryPage(snapshot, operation.pageId, (page) => ({
        ...page,
        photos: page.photos.some((photo) => photo.id === operation.photo.id)
          ? page.photos
          : [...page.photos, operation.photo],
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      break;
    case "my-story-photo-update":
      next = updateStoryPage(snapshot, operation.pageId, (page) => ({
        ...page,
        photos: page.photos.map((photo) =>
          photo.id === operation.photo.id ? operation.photo : photo,
        ),
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      break;
    case "my-story-photo-delete":
      next = updateStoryPage(snapshot, operation.pageId, (page) => ({
        ...page,
        photos: page.photos.filter(
          (photo) => photo.id !== operation.photoId,
        ),
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      break;
    case "my-story-photos-reorder":
      next = updateStoryPage(snapshot, operation.pageId, (page) => {
        const currentIds = page.photos.map((photo) => photo.id);
        if (!isExactReorder(currentIds, operation.photoIds)) {
          throw new OperationConflictError(
            "Reordered story photos must contain every photo exactly once.",
          );
        }
        return {
          ...page,
          photos: operation.photoIds.map(
            (photoId) =>
              page.photos.find((photo) => photo.id === photoId)!,
          ),
          revision: page.revision + 1,
          updatedAt: operation.createdAt,
        };
      });
      break;
    case "my-story-recording-add":
      next = updateStoryPage(snapshot, operation.pageId, (page) => ({
        ...page,
        recordings: page.recordings.some(
          (recording) => recording.id === operation.recording.id,
        )
          ? page.recordings
          : [...page.recordings, operation.recording],
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      break;
    case "my-story-recording-update":
      next = updateStoryPage(snapshot, operation.pageId, (page) => ({
        ...page,
        recordings: page.recordings.map((recording) =>
          recording.id === operation.recording.id
            ? operation.recording
            : recording,
        ),
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      break;
    case "my-story-recording-delete":
      next = updateStoryPage(snapshot, operation.pageId, (page) => ({
        ...page,
        recordings: page.recordings.filter(
          (recording) => recording.id !== operation.recordingId,
        ),
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      break;
    case "my-story-shape-add":
      next = updateStoryPage(snapshot, operation.pageId, (page) => {
        if ((page.shapes ?? []).some(({ id }) => id === operation.shape.id)) return page;
        const withShape = { ...page, shapes: [...(page.shapes ?? []), operation.shape] };
        const order = normalizedStoryRenderOrder(withShape);
        const shapeKey = `shape:${operation.shape.id}`;
        const withoutShape = order.filter((item) => renderItemKey(item) !== shapeKey);
        const index = operation.renderIndex === undefined
          ? withoutShape.length
          : Math.max(0, Math.min(withoutShape.length, operation.renderIndex));
        withoutShape.splice(index, 0, { kind: "shape", id: operation.shape.id });
        return { ...withShape, renderOrder: withoutShape, revision: page.revision + 1, updatedAt: operation.createdAt };
      });
      break;
    case "my-story-shape-update":
      next = updateStoryPage(snapshot, operation.pageId, (page) => ({ ...page, shapes: (page.shapes ?? []).map((shape) => shape.id === operation.shape.id ? operation.shape : shape), revision: page.revision + 1, updatedAt: operation.createdAt }));
      break;
    case "my-story-shape-delete":
      next = updateStoryPage(snapshot, operation.pageId, (page) => ({ ...page, shapes: (page.shapes ?? []).filter((shape) => shape.id !== operation.shapeId), revision: page.revision + 1, updatedAt: operation.createdAt }));
      break;
    case "my-story-shapes-reorder":
      next = updateStoryPage(snapshot, operation.pageId, (page) => {
        const shapes = page.shapes ?? [];
        if (!isExactReorder(shapes.map(({ id }) => id), operation.shapeIds)) throw new OperationConflictError("Reordered story shapes must contain every shape exactly once.");
        return { ...page, shapes: operation.shapeIds.map((id) => shapes.find((shape) => shape.id === id)!), revision: page.revision + 1, updatedAt: operation.createdAt };
      });
      break;
    case "my-story-render-order-update":
      next = updateStoryPage(snapshot, operation.pageId, (page) => {
        const current = normalizedStoryRenderOrder(page);
        if (!isExactReorder(current.map(renderItemKey), operation.renderOrder.map(renderItemKey))) {
          throw new OperationConflictError("Story render order must contain every canvas item exactly once.");
        }
        return { ...page, renderOrder: operation.renderOrder, revision: page.revision + 1, updatedAt: operation.createdAt };
      });
      break;
    case "my-story-link-add":
      if (!webHttpUrl(operation.link.url) || !operation.link.title.trim()) {
        throw new OperationConflictError("The story link is invalid.");
      }
      next = updateStoryPage(snapshot, operation.pageId, (page) => ({
        ...page,
        links: page.links.some((link) => link.id === operation.link.id)
          ? page.links
          : [...page.links, operation.link],
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      break;
    case "my-story-link-update":
      if (!webHttpUrl(operation.link.url) || !operation.link.title.trim()) {
        throw new OperationConflictError("The story link is invalid.");
      }
      next = updateStoryPage(snapshot, operation.pageId, (page) => ({
        ...page,
        links: page.links.map((link) =>
          link.id === operation.link.id ? operation.link : link,
        ),
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      break;
    case "my-story-link-delete":
      next = updateStoryPage(snapshot, operation.pageId, (page) => ({
        ...page,
        links: page.links.filter((link) => link.id !== operation.linkId),
        revision: page.revision + 1,
        updatedAt: operation.createdAt,
      }));
      break;
    case "my-story-links-reorder":
      next = updateStoryPage(snapshot, operation.pageId, (page) => {
        const currentIds = page.links.map((link) => link.id);
        if (!isExactReorder(currentIds, operation.linkIds)) {
          throw new OperationConflictError(
            "Reordered story links must contain every link exactly once.",
          );
        }
        return {
          ...page,
          links: operation.linkIds.map(
            (linkId) => page.links.find((link) => link.id === linkId)!,
          ),
          revision: page.revision + 1,
          updatedAt: operation.createdAt,
        };
      });
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
