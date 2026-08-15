import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Move,
  NotebookTabs,
  ThumbsUp,
} from "lucide-react";
import { useState } from "react";

import type {
  DocumentOperationInput,
  Favourite,
  JournalSnapshot,
  Page,
} from "../domain/models";
import type { SketchRepository } from "../sketch/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { PagePreview } from "./DiaryPageStrip";
import { FavouriteConfirmation } from "./FavouriteConfirmation";
import { displayDate, moveItem } from "./libraryViewHelpers";

export function FavouritesView({
  commit,
  lastViewedFavouriteId,
  onOpenFavourite,
  onReorderFavourites,
  sketchRepository,
  snapshot,
}: {
  commit: (operation: DocumentOperationInput) => boolean | void | Promise<boolean | void>;
  lastViewedFavouriteId?: string;
  onOpenFavourite: (favourite: Favourite) => void;
  onReorderFavourites: (favouriteIds: string[]) => Promise<boolean>;
  sketchRepository: SketchRepository;
  snapshot: JournalSnapshot;
}) {
  const [arranging, setArranging] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<Favourite>();
  const [favouriteConfirmation, setFavouriteConfirmation] = useState<string>();
  const displayName = snapshot.settings.displayName.trim() || "there";
  const favouriteIds = snapshot.favourites.map((favourite) => favourite.id);

  const reorderFavourite = (favouriteId: string, offset: -1 | 1) => {
    const sourceIndex = favouriteIds.indexOf(favouriteId);
    const targetId = favouriteIds[sourceIndex + offset];
    if (!targetId) return;
    void onReorderFavourites(moveItem(favouriteIds, favouriteId, targetId));
  };

  return (
    <section className="library-view" aria-labelledby="favourites-heading">
      <header className="library-heading">
        <div>
          <p className="eyebrow">Easy to find again</p>
          <h1 id="favourites-heading">My Favourites</h1>
        </div>
        <button
          aria-pressed={arranging}
          className={arranging ? "large-action arrange-action selected" : "large-action arrange-action"}
          data-help-topic="library-arrange"
          onClick={() => setArranging((current) => !current)}
          type="button"
        >
          <Move aria-hidden="true" />
          {arranging ? "Done editing" : "Edit"}
        </button>
      </header>

      {snapshot.favourites.length === 0 ? (
        <div className="empty-library">
          <ThumbsUp aria-hidden="true" />
          <h2>No favourites yet</h2>
          <p>Use the thumbs-up on a diary page or sketchbook to keep it here.</p>
        </div>
      ) : (
        <div className="book-grid favourites-grid">
          {snapshot.favourites.map((favourite, favouriteIndex) => {
            const sketchbook = snapshot.sketchbooks.find(
              (candidate) =>
                favourite.targetType === "sketchbook" &&
                candidate.id === favourite.targetId,
            );
            const day = snapshot.days.find(
              (candidate) =>
                favourite.targetType === "journal-day" &&
                candidate.id === favourite.targetId,
            );
            const favouritePage =
              favourite.targetType === "page"
                ? snapshot.pages.find(
                    (candidate) => candidate.id === favourite.targetId,
                  )
                : undefined;
            const previewPage: Page | undefined = favouritePage
              ? favouritePage
              : day
                ? snapshot.pages.find(
                    (candidate) => candidate.id === day.pageIds[0],
                  )
                : sketchbook
                  ? snapshot.pages.find(
                      (candidate) => candidate.id === sketchbook.pageIds[0],
                    )
                  : undefined;
            const pageDay = favouritePage?.journalDayId
              ? snapshot.days.find(
                  (candidate) =>
                    candidate.id === favouritePage.journalDayId,
                )
              : undefined;
            const pageSketchbook = favouritePage?.sketchbookId
              ? snapshot.sketchbooks.find(
                  (candidate) =>
                    candidate.id === favouritePage.sketchbookId,
                )
              : undefined;
            const pageNumber =
              favouritePage && pageDay
                ? pageDay.pageIds.indexOf(favouritePage.id) + 1
                : favouritePage && pageSketchbook
                  ? pageSketchbook.pageIds.indexOf(favouritePage.id) + 1
                  : undefined;
            const title =
              sketchbook?.name ??
              (day
                ? displayDate(day.date)
                : pageDay
                  ? `${displayDate(pageDay.date)}, page ${pageNumber}`
                  : pageSketchbook
                    ? `${pageSketchbook.name}, page ${pageNumber}`
                    : "Favourite page");
            return (
              <article
                className={`book-card favourite-card${arranging ? " arranging" : ""}${lastViewedFavouriteId === favourite.id ? " last-viewed" : ""}`}
                key={favourite.id}
              >
                <button
                  aria-label={`Open favourite: ${title}`}
                  aria-disabled={arranging}
                  className="favourite-card-link"
                  data-help-topic="open-favourite"
                  onClick={() => {
                    if (!arranging) onOpenFavourite(favourite);
                  }}
                  tabIndex={arranging ? -1 : undefined}
                  type="button"
                >
                  {previewPage ? (
                    <PagePreview
                      className="favourite-page-preview"
                      page={previewPage}
                      sketchRepository={sketchRepository}
                    />
                  ) : (
                    <div className="book-cover small">
                      {sketchbook ? (
                        <NotebookTabs aria-hidden="true" />
                      ) : (
                        <BookOpen aria-hidden="true" />
                      )}
                    </div>
                  )}
                  <div>
                    <h2>{title}</h2>
                    <p>
                      {favourite.targetType === "journal-day"
                        ? "Diary day"
                        : favourite.targetType === "sketchbook"
                          ? "Sketchbook"
                          : pageSketchbook
                            ? "Sketchbook page"
                            : "Diary page"}
                    </p>
                  </div>
                </button>
                {arranging ? (
                  <div className="favourite-arrange-controls">
                    <div className="favourite-reorder-controls">
                      <button
                        aria-label={`Move ${title} earlier`}
                        disabled={favouriteIndex === 0}
                        onClick={() => reorderFavourite(favourite.id, -1)}
                        type="button"
                      >
                        <ChevronLeft aria-hidden="true" />
                      </button>
                      <button
                        aria-label={`Move ${title} later`}
                        disabled={favouriteIndex === snapshot.favourites.length - 1}
                        onClick={() => reorderFavourite(favourite.id, 1)}
                        type="button"
                      >
                        <ChevronRight aria-hidden="true" />
                      </button>
                    </div>
                    <button
                      aria-label={`Remove ${title} from favourites`}
                      className="favourite-remove-button"
                      data-help-topic="favourite"
                      onClick={() => setPendingRemoval(favourite)}
                      type="button"
                    >
                      <ThumbsUp aria-hidden="true" />
                      <span>Remove from Favourites</span>
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {pendingRemoval ? (
        <ConfirmDialog
          cancelLabel="Keep favourite"
          confirmClassName="confirm-delete"
          confirmLabel="Remove favourite"
          dialogClassName="favourite-removal-dialog"
          icon={<ThumbsUp aria-hidden="true" />}
          onCancel={() => setPendingRemoval(undefined)}
          onConfirm={() => void (async () => {
            const saved = await commit({
              type: "favourite-set",
              targetType: pendingRemoval.targetType,
              targetId: pendingRemoval.targetId,
              favourite: false,
            });
            setPendingRemoval(undefined);
            if (saved !== false) setFavouriteConfirmation("Removed from Your Favourites");
          })()}
          title={<>Hi {displayName}</>}
        >
          <p>Remove from your Favourites?</p>
        </ConfirmDialog>
      ) : null}
      <FavouriteConfirmation message={favouriteConfirmation} onDone={() => setFavouriteConfirmation(undefined)} />
    </section>
  );
}
