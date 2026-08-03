import { GripHorizontal, Plus } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import type { Page, PageObject } from "../domain/models";
import type { SketchRepository } from "../sketch/types";
import { defaultObjectFrame } from "./arrangeGeometry";
import { SketchThumbnail } from "./SketchThumbnail";

function previewStyle(object: PageObject): CSSProperties {
  const frame = defaultObjectFrame(object);
  return {
    left: `${object.position.x * 100}%`,
    top: `${object.position.y * 100}%`,
    width: `${frame.width * 100}%`,
    height: `${frame.height * 100}%`,
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
  return (
    <span
      aria-hidden="true"
      className={`diary-page-preview paper-${page.paperStyle} ${className}`}
    >
      {sketchRepository ? (
        <SketchThumbnail
          documentId={page.drawingDocumentId}
          repository={sketchRepository}
        />
      ) : null}
      {page.objects.map((object) => {
        switch (object.type) {
          case "photo":
            return object.asset.localUri.startsWith("demo://") ? (
              <span
                className="page-preview-object preview-photo demo-photo"
                key={object.id}
                style={previewStyle(object)}
              />
            ) : (
              <img
                alt=""
                className="page-preview-object preview-photo"
                key={object.id}
                src={object.asset.localUri}
                style={previewStyle(object)}
              />
            );
          case "voice":
            return (
              <span
                className="page-preview-object preview-voice"
                key={object.id}
                style={previewStyle(object)}
              />
            );
          case "text":
            return (
              <span
                className="page-preview-object preview-text"
                key={object.id}
                style={previewStyle(object)}
              />
            );
          case "link":
            return (
              <span
                className="page-preview-object preview-link"
                key={object.id}
                style={previewStyle(object)}
              />
            );
          case "transcript":
            return null;
          default: {
            const exhaustiveObject: never = object;
            throw new Error(`Unsupported page preview: ${exhaustiveObject}`);
          }
        }
      })}
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

export function DiaryPageStrip({
  activePageId,
  addPageLabel = "Add another diary page",
  arrange,
  collectionLabel = "Pages in today’s diary",
  onAddPage,
  onReorderPages,
  onSelectPage,
  pages,
}: {
  activePageId: string;
  addPageLabel?: string;
  arrange: boolean;
  collectionLabel?: string;
  onAddPage: () => void;
  onReorderPages: (pageIds: string[]) => Promise<boolean>;
  onSelectPage: (pageId: string) => void;
  pages: Page[];
}) {
  const initialOrder = pages.map((page) => page.id);
  const activeDragRef = useRef<ActivePageDrag | undefined>(undefined);
  const nativeDragRef = useRef<NativePageDrag | undefined>(undefined);
  const orderRef = useRef(initialOrder);
  const suppressClickRef = useRef(false);
  const [draggedPageId, setDraggedPageId] = useState<string>();
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
    <nav aria-label={collectionLabel} className="diary-page-strip">
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
                <PagePreview page={page} />
                <span>Page {pageNumber}</span>
                {arrange ? (
                  <GripHorizontal
                    aria-hidden="true"
                    className="thumbnail-drag-indicator"
                  />
                ) : null}
              </button>
            </div>
          );
        })}
        <div className="diary-page-list-item" role="listitem">
          <button
            aria-label={addPageLabel}
            className="diary-page-button add-diary-page"
            onClick={onAddPage}
            type="button"
          >
            <span aria-hidden="true" className="add-page-preview">
              <Plus />
            </span>
            <span>Add page</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
