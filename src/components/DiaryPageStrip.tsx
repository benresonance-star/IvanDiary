import { GripHorizontal, Plus, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import {
  MAX_PAGES_PER_COLLECTION,
  type MyStoryPage,
  type Page,
  type PageObject,
  type PaperStyle,
} from "../domain/models";
import { effectivePaperBackgroundColour } from "../domain/paperBackground";
import type { SketchRepository } from "../sketch/types";
import { displayAssetUri } from "../utils/displayAssetUri";
import { defaultObjectFrame } from "./arrangeGeometry";
import { ConfirmDialog } from "./ConfirmDialog";
import { ShapeCard } from "./ShapeCard";
import { SketchThumbnail } from "./SketchThumbnail";

function previewStyle(object: PageObject, stackIndex: number): CSSProperties {
  const frame = defaultObjectFrame(object);
  return {
    left: `${object.position.x * 100}%`,
    top: `${object.position.y * 100}%`,
    width: `${frame.width * 100}%`,
    height: `${frame.height * 100}%`,
    transform: object.type === "shape" ? `rotate(${object.rotationDegrees ?? 0}deg)` : undefined,
    zIndex: object.layer === "behind-sketch" ? 0 : 10 + stackIndex,
  };
}

export function PagePreview({
  className = "",
  page,
  sketchRepository,
}: {
  className?: string;
  page: Page;
  sketchRepository?: SketchRepository;
}) {
  const renderObject = (object: PageObject, stackIndex: number) => {
    switch (object.type) {
      case "photo":
        return object.asset.localUri.startsWith("demo://") ? (
          <span className="page-preview-object preview-photo demo-photo" key={object.id} style={previewStyle(object, stackIndex)} />
        ) : (
          <img alt="" className="page-preview-object preview-photo" key={object.id} src={displayAssetUri(object.asset.localUri)} style={previewStyle(object, stackIndex)} />
        );
      case "voice":
        return <span className="page-preview-object preview-voice" key={object.id} style={previewStyle(object, stackIndex)} />;
      case "text":
        return (
          <span
            className={`page-preview-object preview-text canvas-text-${object.role ?? "body"} canvas-font-${object.font ?? "system-sans"}`}
            key={object.id}
            style={{
              ...previewStyle(object, stackIndex),
              backgroundColor: object.backgroundColor ?? "transparent",
              border: object.outlineColor
                ? `${object.outlineWidth ?? 2}px solid ${object.outlineColor}`
                : "none",
              color: object.color ?? "#201c17",
            }}
          >
            {object.text}
          </span>
        );
      case "link":
        return <span className="page-preview-object preview-link" key={object.id} style={previewStyle(object, stackIndex)}>{object.title}</span>;
      case "shape":
        return <span className="page-preview-object preview-shape" key={object.id} style={previewStyle(object, stackIndex)}><ShapeCard shape={object} /></span>;
      case "transcript":
        return null;
      default: {
        const exhaustiveObject: never = object;
        throw new Error(`Unsupported page preview: ${exhaustiveObject}`);
      }
    }
  };
  const stackIds = new Set(page.textStack?.memberIds ?? []);
  const behindSketch = page.objects.filter(
    (object) => object.layer === "behind-sketch" && !stackIds.has(object.id),
  );
  const aboveSketch = page.objects.filter(
    (object) => object.layer !== "behind-sketch" && !stackIds.has(object.id),
  );
  const stackedTexts = (page.textStack?.memberIds ?? []).flatMap((id) => {
    const object = page.objects.find((candidate) => candidate.id === id);
    return object?.type === "text" ? [object] : [];
  });
  return (
    <span
      aria-hidden="true"
      className={`diary-page-preview paper-${page.paperStyle} ${className}`}
      style={{ backgroundColor: effectivePaperBackgroundColour(page) }}
    >
      {behindSketch.map((object) => renderObject(object, page.objects.indexOf(object)))}
      {sketchRepository ? (
        <SketchThumbnail
          documentId={page.drawingDocumentId}
          repository={sketchRepository}
        />
      ) : null}
      {page.textStack && stackedTexts.length > 0 ? (
        <span
          className="page-preview-text-stack"
          style={{
            left: `${page.textStack.position.x * 100}%`,
            top: `${page.textStack.position.y * 100}%`,
            width: `${page.textStack.frame.width * 100}%`,
            height: `${page.textStack.frame.height * 100}%`,
          }}
        >
          {stackedTexts.map((object) => (
            <span
              className={`preview-stacked-text canvas-text-${object.role ?? "body"} canvas-font-${object.font ?? "system-sans"}`}
              key={object.id}
              style={{
                backgroundColor: object.backgroundColor ?? "transparent",
                border: object.outlineColor
                  ? `${object.outlineWidth ?? 2}px solid ${object.outlineColor}`
                  : "none",
                color: object.color ?? "#201c17",
              }}
            >
              {object.text}
            </span>
          ))}
        </span>
      ) : null}
      {aboveSketch.map((object) => renderObject(object, page.objects.indexOf(object)))}
    </span>
  );
}

function movePage(
  pageIds: string[],
  sourcePageId: string,
  targetPageId: string,
): string[] {
  const sourceIndex = pageIds.indexOf(sourcePageId);
  const targetIndex = pageIds.indexOf(targetPageId);
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    sourceIndex === targetIndex
  ) {
    return pageIds;
  }
  const reordered = [...pageIds];
  reordered.splice(sourceIndex, 1);
  reordered.splice(targetIndex, 0, sourcePageId);
  return reordered;
}

type ActivePageDrag = {
  pointerId: number;
  pageId: string;
  moved: boolean;
  targetPageId?: string;
};

type NativePageDrag = {
  pageId: string;
  moved: boolean;
  targetPageId?: string;
};

type PageStripPage = Page | MyStoryPage;

function pagePaperStyle(page: PageStripPage): PaperStyle {
  return "paperStyle" in page ? page.paperStyle : "warm-journal";
}

export function DiaryPageStrip({
  activePageId,
  addPageLabel = "Add another diary page",
  arrange,
  collectionLabel = "Pages in today’s diary",
  collectionType = "journal",
  displayName,
  onAddPage,
  onDeletePage,
  onReorderPages,
  onSelectPage,
  pages,
}: {
  activePageId: string;
  addPageLabel?: string;
  arrange: boolean;
  collectionLabel?: string;
  collectionType?: "journal" | "sketchbook" | "story";
  displayName: string;
  onAddPage: () => Promise<boolean>;
  onDeletePage: (pageId: string) => Promise<boolean>;
  onReorderPages: (pageIds: string[]) => Promise<boolean>;
  onSelectPage: (pageId: string) => void;
  pages: PageStripPage[];
}) {
  const initialOrder = pages.map((page) => page.id);
  const activeDragRef = useRef<ActivePageDrag | undefined>(undefined);
  const nativeDragRef = useRef<NativePageDrag | undefined>(undefined);
  const orderRef = useRef(initialOrder);
  const suppressClickRef = useRef(false);
  const [draggedPageId, setDraggedPageId] = useState<string>();
  const [pageLimitWarningOpen, setPageLimitWarningOpen] = useState(false);
  const pageLimitButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (pageLimitWarningOpen) {
      pageLimitButtonRef.current?.focus({ preventScroll: true });
    }
  }, [pageLimitWarningOpen]);
  const [pagePendingDelete, setPagePendingDelete] =
    useState<PageStripPage>();
  const [orderedPageIds, setOrderedPageIds] = useState(initialOrder);

  useEffect(() => {
    if (!activeDragRef.current) {
      const nextOrder = pages.map((page) => page.id);
      orderRef.current = nextOrder;
      setOrderedPageIds(nextOrder);
    }
  }, [pages]);

  const updateOrder = (nextOrder: string[]) => {
    orderRef.current = nextOrder;
    setOrderedPageIds(nextOrder);
  };

  const orderedPages = orderedPageIds.flatMap((pageId) => {
    const page = pages.find((candidate) => candidate.id === pageId);
    return page ? [page] : [];
  });
  const pageLimitReached = pages.length >= MAX_PAGES_PER_COLLECTION;

  const beginDrag = (
    event: PointerEvent<HTMLButtonElement>,
    pageId: string,
  ) => {
    if (!arrange) {
      return;
    }
    if (event.pointerType === "mouse") {
      nativeDragRef.current = { pageId, moved: false };
      return;
    }
    event.preventDefault();
    activeDragRef.current = {
      pointerId: event.pointerId,
      pageId,
      moved: false,
    };
    setDraggedPageId(pageId);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Continue while the pointer remains over the thumbnail.
    }
  };

  const updateDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const active = activeDragRef.current;
    if (!active || event.pointerId !== active.pointerId) {
      return;
    }
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-page-id]");
    const targetPageId = target?.dataset.pageId;
    if (
      !targetPageId ||
      targetPageId === active.pageId ||
      targetPageId === active.targetPageId
    ) {
      return;
    }
    active.targetPageId = targetPageId;
    const nextOrder = movePage(
      orderRef.current,
      active.pageId,
      targetPageId,
    );
    if (nextOrder !== orderRef.current) {
      active.moved = true;
      updateOrder(nextOrder);
    }
  };

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const active = activeDragRef.current;
    if (!active || event.pointerId !== active.pointerId) {
      return;
    }
    activeDragRef.current = undefined;
    setDraggedPageId(undefined);
    suppressClickRef.current = active.moved;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    if (active.moved) {
      void onReorderPages(orderRef.current).then((saved) => {
        if (!saved) {
          updateOrder(pages.map((page) => page.id));
        }
      });
    }
  };

  const cancelDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const active = activeDragRef.current;
    if (!active || event.pointerId !== active.pointerId) {
      return;
    }
    activeDragRef.current = undefined;
    setDraggedPageId(undefined);
    updateOrder(pages.map((page) => page.id));
  };

  const reorderWithKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    pageId: string,
  ) => {
    if (
      !arrange ||
      !event.shiftKey ||
      (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
    ) {
      return;
    }
    const sourceIndex = orderRef.current.indexOf(pageId);
    const targetIndex =
      event.key === "ArrowLeft" ? sourceIndex - 1 : sourceIndex + 1;
    const targetPageId = orderRef.current[targetIndex];
    if (!targetPageId) {
      return;
    }
    event.preventDefault();
    const nextOrder = movePage(
      orderRef.current,
      pageId,
      targetPageId,
    );
    updateOrder(nextOrder);
    void onReorderPages(nextOrder).then((saved) => {
      if (!saved) {
        updateOrder(pages.map((page) => page.id));
      }
    });
  };

  const beginNativeDrag = (
    event: DragEvent<HTMLButtonElement>,
    pageId: string,
  ) => {
    if (!arrange) {
      event.preventDefault();
      return;
    }
    nativeDragRef.current = { pageId, moved: false };
    try {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", pageId);
    } catch {
      // The in-memory page ID remains the source of truth for this drag.
    }
  };

  const updateNativeDrag = (
    event: DragEvent<HTMLButtonElement>,
    targetPageId: string,
  ) => {
    event.preventDefault();
    let active = nativeDragRef.current;
    if (!active) {
      const pageId = event.dataTransfer.getData("text/plain");
      if (pageId) {
        active = { pageId, moved: false };
        nativeDragRef.current = active;
      }
    }
    if (
      !active ||
      active.pageId === targetPageId ||
      active.targetPageId === targetPageId
    ) {
      return;
    }
    try {
      event.dataTransfer.dropEffect = "move";
    } catch {
      // Continue when the browser does not expose a writable drag effect.
    }
    active.targetPageId = targetPageId;
    active.moved = true;
  };

  const finishNativeDrag = () => {
    const active = nativeDragRef.current;
    nativeDragRef.current = undefined;
    if (!active?.moved || !active.targetPageId) {
      return;
    }
    const nextOrder = movePage(
      orderRef.current,
      active.pageId,
      active.targetPageId,
    );
    updateOrder(nextOrder);
    void onReorderPages(nextOrder).then((saved) => {
      if (!saved) {
        updateOrder(pages.map((page) => page.id));
      }
    });
  };

  const dropNativeDrag = (
    event: DragEvent<HTMLButtonElement>,
    targetPageId: string,
  ) => {
    const transferredPageId = event.dataTransfer.getData("text/plain");
    const active =
      nativeDragRef.current ??
      (transferredPageId
        ? { pageId: transferredPageId, moved: false }
        : undefined);
    if (!active) {
      return;
    }
    event.preventDefault();
    const nextOrder = movePage(
      orderRef.current,
      active.pageId,
      targetPageId,
    );
    nativeDragRef.current = undefined;
    if (nextOrder === orderRef.current) {
      return;
    }
    updateOrder(nextOrder);
    void onReorderPages(nextOrder).then((saved) => {
      if (!saved) {
        updateOrder(pages.map((page) => page.id));
      }
    });
  };

  return (
    <nav
      aria-label={collectionLabel}
      className={`page-strip ${arrange ? "diary-page-strip" : "story-page-strip"}`}
    >
      {arrange ? (
        <div className="diary-page-list" role="list">
        {orderedPages.map((page, index) => {
          const pageNumber = index + 1;
          const current = page.id === activePageId;
          return (
            <div className="diary-page-list-item" key={page.id} role="listitem">
              <button
                aria-current={current ? "page" : undefined}
                aria-label={
                  arrange
                    ? `Page ${pageNumber}. Drag to reorder. Shift and arrow keys reorder.`
                    : `Open page ${pageNumber}`
                }
                className={`diary-page-button${current ? " current" : ""}${draggedPageId === page.id ? " dragging" : ""}${arrange ? " reorderable" : ""}`}
                data-help-topic="page-strip"
                data-page-id={page.id}
                draggable={arrange}
                onDragEnd={finishNativeDrag}
                onDragOver={(event) => updateNativeDrag(event, page.id)}
                onDragStart={(event) => beginNativeDrag(event, page.id)}
                onDrop={(event) => dropNativeDrag(event, page.id)}
                onClick={() => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  onSelectPage(page.id);
                }}
                onKeyDown={(event) => reorderWithKeyboard(event, page.id)}
                onLostPointerCapture={finishDrag}
                onPointerCancel={cancelDrag}
                onPointerDown={(event) => beginDrag(event, page.id)}
                onPointerMove={updateDrag}
                onPointerUp={finishDrag}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={`diary-page-preview paper-${pagePaperStyle(page)}`}
                  style={
                    "paperStyle" in page
                      ? { backgroundColor: effectivePaperBackgroundColour(page) }
                      : undefined
                  }
                >
                  <span className="page-preview-label">Page {pageNumber}</span>
                </span>
                {arrange ? (
                  <GripHorizontal
                    aria-hidden="true"
                    className="thumbnail-drag-indicator"
                  />
                ) : null}
              </button>
              {arrange ? (
                <button
                  aria-label={
                    pages.length <= 1
                      ? `Page ${pageNumber} cannot be deleted because at least one page is required`
                      : `Delete page ${pageNumber}`
                  }
                  className="page-thumbnail-delete"
                  data-help-topic="arrange-delete"
                  disabled={pages.length <= 1}
                  onClick={() => setPagePendingDelete(page)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              ) : null}
            </div>
          );
        })}
        <div className="diary-page-list-item" role="listitem">
          <button
            aria-label={pageLimitReached ? "Maximum of 10 pages reached" : addPageLabel}
            className="diary-page-button add-diary-page"
            data-help-topic="add-page"
            disabled={pageLimitReached}
            onClick={() => {
              void onAddPage().then((added) => {
                if (added && pages.length === MAX_PAGES_PER_COLLECTION - 1) {
                  setPageLimitWarningOpen(true);
                }
              });
            }}
            type="button"
          >
            <span aria-hidden="true" className="add-page-preview">
              <Plus />
            </span>
          </button>
        </div>
        </div>
      ) : (
        <>
          {orderedPages.map((page, index) => (
            <div className="story-page-item" key={page.id}>
              <button
                aria-current={page.id === activePageId ? "page" : undefined}
                className={page.id === activePageId ? "current" : ""}
                onClick={() => onSelectPage(page.id)}
                type="button"
              >
                Page {index + 1}
              </button>
            </div>
          ))}
          <button
            aria-label={
              pageLimitReached ? "Maximum of 10 pages reached" : addPageLabel
            }
            className="story-add-page"
            disabled={pageLimitReached}
            onClick={() => {
              void onAddPage().then((added) => {
                if (
                  added &&
                  pages.length === MAX_PAGES_PER_COLLECTION - 1
                ) {
                  setPageLimitWarningOpen(true);
                }
              });
            }}
            type="button"
          >
            <Plus aria-hidden="true" />
            Page
          </button>
        </>
      )}
      {pagePendingDelete ? (
        <ConfirmDialog
          cancelLabel="Keep it"
          confirmClassName="confirm-delete"
          confirmLabel="Delete page"
          icon={<Trash2 aria-hidden="true" />}
          onCancel={() => setPagePendingDelete(undefined)}
          onConfirm={() => {
            const pageId = pagePendingDelete.id;
            setPagePendingDelete(undefined);
            void onDeletePage(pageId);
          }}
          title="Delete this page?"
        >
          <p>
            This removes its drawing, text, photos and recordings{" "}
            {collectionType === "story"
              ? "from My Story."
              : `from this ${collectionType}.`}
          </p>
        </ConfirmDialog>
      ) : null}
      {pageLimitWarningOpen
        ? createPortal(
            <div className="delete-dialog-backdrop" role="presentation">
              <div
                aria-labelledby="page-limit-warning-title"
                aria-modal="true"
                className="delete-dialog"
                role="alertdialog"
              >
                <h2 id="page-limit-warning-title">Last page</h2>
                <p>
                  Hey {displayName.trim() || "there"} this is the last page we can fit on this {collectionType}
                </p>
                <div className="delete-dialog-actions">
                  <button ref={pageLimitButtonRef} onClick={() => setPageLimitWarningOpen(false)} type="button">
                    OK
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </nav>
  );
}
