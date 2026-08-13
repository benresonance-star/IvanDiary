import {
  BookOpen,
  ChevronLeft,
  GripHorizontal,
  Mic,
  Move,
  NotebookTabs,
  Plus,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { createPortal } from "react-dom";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import type {
  DocumentOperationInput,
  Favourite,
  JournalSnapshot,
  Page,
  Sketchbook,
} from "../domain/models";
import type { SketchRepository } from "../sketch/types";
import { FavouriteConfirmation } from "./FavouriteConfirmation";
import type {
  AppleTranscriptionPlugin,
  JournalAudioPlugin,
  JournalFilesPlugin,
  RecordingSnapshot,
} from "../native/contracts";
import { finalizeStoppedRecording } from "../native/durableAudio";
import { PagePreview } from "./DiaryPageStrip";

function displayDate(date: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function moveSketchbook(
  sketchbookIds: string[],
  sourceId: string,
  targetId: string,
): string[] {
  const sourceIndex = sketchbookIds.indexOf(sourceId);
  const targetIndex = sketchbookIds.indexOf(targetId);
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    sourceIndex === targetIndex
  ) {
    return sketchbookIds;
  }
  const reordered = [...sketchbookIds];
  reordered.splice(sourceIndex, 1);
  reordered.splice(targetIndex, 0, sourceId);
  return reordered;
}

type SketchbookDrag = {
  id: string;
  pointerId?: number;
  targetId?: string;
};

export function SketchbooksView({
  audio,
  commit,
  files,
  onCreateSketchbook,
  onDeleteSketchbook,
  onOpenSketchbook,
  onRenameSketchbook,
  onReorderSketchbooks,
  sketchRepository,
  snapshot,
  transcription,
}: {
  audio: JournalAudioPlugin;
  commit: (operation: DocumentOperationInput) => boolean | void | Promise<boolean | void>;
  files: JournalFilesPlugin;
  onCreateSketchbook: (name: string) => Promise<boolean>;
  onDeleteSketchbook: (sketchbookId: string) => Promise<boolean>;
  onOpenSketchbook: (sketchbookId: string) => void;
  onRenameSketchbook: (
    sketchbookId: string,
    name: string,
  ) => Promise<boolean>;
  onReorderSketchbooks: (
    sketchbookIds: string[],
  ) => Promise<boolean>;
  sketchRepository: SketchRepository;
  snapshot: JournalSnapshot;
  transcription: AppleTranscriptionPlugin;
}) {
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [renamingSketchbookId, setRenamingSketchbookId] =
    useState<string>();
  const [name, setName] = useState("");
  const [favouriteConfirmation, setFavouriteConfirmation] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [sketchbookPendingDelete, setSketchbookPendingDelete] =
    useState<Sketchbook>();
  const [recording, setRecording] = useState<RecordingSnapshot>();
  const [speechMessage, setSpeechMessage] = useState<string>();
  const initialOrder = snapshot.sketchbooks.map(
    (sketchbook) => sketchbook.id,
  );
  const orderRef = useRef(initialOrder);
  const dragRef = useRef<SketchbookDrag | undefined>(undefined);
  const [orderedSketchbookIds, setOrderedSketchbookIds] =
    useState(initialOrder);

  useEffect(() => {
    if (!dragRef.current) {
      const nextOrder = snapshot.sketchbooks.map(
        (sketchbook) => sketchbook.id,
      );
      orderRef.current = nextOrder;
      setOrderedSketchbookIds(nextOrder);
    }
  }, [snapshot.sketchbooks]);

  const orderedSketchbooks = orderedSketchbookIds.flatMap(
    (sketchbookId) => {
      const sketchbook = snapshot.sketchbooks.find(
        (candidate) => candidate.id === sketchbookId,
      );
      return sketchbook ? [sketchbook] : [];
    },
  );

  const saveSketchbookName = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || creating) {
      return;
    }
    setCreating(true);
    const saved = renamingSketchbookId
      ? await onRenameSketchbook(renamingSketchbookId, trimmedName)
      : await onCreateSketchbook(trimmedName);
    setCreating(false);
    if (saved) {
      setName("");
      setRenamingSketchbookId(undefined);
      setNameDialogOpen(false);
    }
  };

  const closeNameDialog = () => {
    if (recording?.state === "recording") {
      void audio.stop();
    }
    setName("");
    setRenamingSketchbookId(undefined);
    setNameDialogOpen(false);
    setRecording(undefined);
    setSpeechMessage(undefined);
  };

  const speakTitle = async () => {
    setSpeechMessage(undefined);
    if (recording?.state === "recording") {
      let stopped: RecordingSnapshot;
      try {
        stopped = await finalizeStoppedRecording(audio, files);
        setRecording(stopped);
      } catch {
        setSpeechMessage("The spoken title could not be saved. Type it instead.");
        return;
      }
      if (!stopped.asset) return;
      try {
        const result = await transcription.transcribe({
          recordingId: stopped.id,
          asset: stopped.asset,
          locale: "en-AU",
        });
        setName(result.rawText);
        setSpeechMessage("Spoken title added. Check it before saving.");
      } catch {
        setSpeechMessage("The title was not understood. Try again or type it.");
      }
      return;
    }

    try {
      const permission = await transcription.requestPermission();
      if (!permission.granted) {
        setSpeechMessage("Speech permission is off. Type the title instead.");
        return;
      }
      const started = await audio.start();
      setRecording(started);
      setSpeechMessage(
        "Listening for the sketchbook title. Tap Stop title when finished.",
      );
    } catch {
      setSpeechMessage("Listening could not start. Type the title instead.");
    }
  };

  const updateOrder = (nextOrder: string[]) => {
    orderRef.current = nextOrder;
    setOrderedSketchbookIds(nextOrder);
  };

  const saveOrder = (nextOrder: string[]) => {
    updateOrder(nextOrder);
    void onReorderSketchbooks(nextOrder).then((saved) => {
      if (!saved) {
        updateOrder(
          snapshot.sketchbooks.map((sketchbook) => sketchbook.id),
        );
      }
    });
  };

  const reorderWithKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    sketchbookId: string,
  ) => {
    if (
      !event.shiftKey ||
      (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
    ) {
      return;
    }
    const sourceIndex = orderRef.current.indexOf(sketchbookId);
    const targetIndex =
      event.key === "ArrowLeft" ? sourceIndex - 1 : sourceIndex + 1;
    const targetId = orderRef.current[targetIndex];
    if (!targetId) {
      return;
    }
    event.preventDefault();
    saveOrder(
      moveSketchbook(orderRef.current, sketchbookId, targetId),
    );
  };

  const beginPointerDrag = (
    event: PointerEvent<HTMLButtonElement>,
    sketchbookId: string,
  ) => {
    dragRef.current = {
      id: sketchbookId,
      pointerId: event.pointerId,
    };
    if (event.pointerType === "mouse") {
      return;
    }
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Continue while the pointer remains over the handle.
    }
  };

  const updatePointerDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const targetId = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-sketchbook-id]")
      ?.dataset.sketchbookId;
    if (
      !targetId ||
      targetId === drag.id ||
      targetId === drag.targetId
    ) {
      return;
    }
    drag.targetId = targetId;
    updateOrder(moveSketchbook(orderRef.current, drag.id, targetId));
  };

  const finishPointerDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = undefined;
    if (drag.targetId) {
      void onReorderSketchbooks(orderRef.current).then((saved) => {
        if (!saved) {
          updateOrder(
            snapshot.sketchbooks.map((sketchbook) => sketchbook.id),
          );
        }
      });
    }
  };

  const cancelPointerDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = undefined;
    updateOrder(
      snapshot.sketchbooks.map((sketchbook) => sketchbook.id),
    );
  };

  const beginNativeDrag = (
    event: DragEvent<HTMLButtonElement>,
    sketchbookId: string,
  ) => {
    dragRef.current = { id: sketchbookId };
    try {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", sketchbookId);
    } catch {
      // The in-memory ID remains the source of truth.
    }
  };

  const allowNativeDrop = (
    event: DragEvent<HTMLElement>,
    targetId: string,
  ) => {
    event.preventDefault();
    const drag = dragRef.current;
    if (drag && drag.id !== targetId) {
      drag.targetId = targetId;
    }
  };

  const finishNativeDrag = () => {
    const drag = dragRef.current;
    dragRef.current = undefined;
    if (!drag?.targetId) {
      return;
    }
    saveOrder(
      moveSketchbook(orderRef.current, drag.id, drag.targetId),
    );
  };

  return (
    <section className="library-view" aria-labelledby="sketchbooks-heading">
      <header className="library-heading">
        <div>
          <p className="eyebrow">A home for drawings</p>
          <h1 id="sketchbooks-heading">My Sketchbooks</h1>
        </div>
        <div className="library-actions">
          <button
            aria-pressed={editMode}
            className={editMode ? "large-action selected" : "large-action"}
            onClick={() => setEditMode((current) => !current)}
            type="button"
          >
            <Move aria-hidden="true" />
            {editMode ? "Done arranging" : "Arrange"}
          </button>
          <button
            className="large-action"
            onClick={() => {
              setRenamingSketchbookId(undefined);
              setName("");
              setNameDialogOpen(true);
            }}
            type="button"
          >
            <Plus aria-hidden="true" />
            New sketchbook
          </button>
        </div>
      </header>

      <div className="book-grid sketchbook-grid">
        {orderedSketchbooks.map((sketchbook) => {
          const firstPage = snapshot.pages.find(
            (page) => page.id === sketchbook.pageIds[0],
          );
          return (
          <article
            className={`book-card sketchbook-card${editMode ? " editing" : ""}`}
            data-sketchbook-id={sketchbook.id}
            key={sketchbook.id}
            onDragOver={(event) =>
              allowNativeDrop(event, sketchbook.id)
            }
          >
            <button
              aria-label={
                editMode
                  ? `${sketchbook.name}. Use the edit controls.`
                  : `Open ${sketchbook.name}`
              }
              className="sketchbook-card-link"
              onClick={() => {
                if (!editMode) {
                  onOpenSketchbook(sketchbook.id);
                }
              }}
              type="button"
            >
              {firstPage ? (
                <PagePreview
                  className="sketchbook-page-preview"
                  page={firstPage}
                  sketchRepository={sketchRepository}
                />
              ) : (
                <div className="book-cover">
                  <NotebookTabs aria-hidden="true" />
                </div>
              )}
              <div>
                <h2>{sketchbook.name}</h2>
                <p>
                  {sketchbook.pageIds.length === 1
                    ? "1 page"
                    : `${sketchbook.pageIds.length} pages`}
                </p>
              </div>
            </button>
            {editMode ? (
              <div className="sketchbook-edit-controls">
                <button
                  aria-label={`Drag to reorder ${sketchbook.name}. Shift and arrow keys also reorder.`}
                  className="sketchbook-drag-handle"
                  draggable
                  onDragEnd={finishNativeDrag}
                  onDragStart={(event) =>
                    beginNativeDrag(event, sketchbook.id)
                  }
                  onKeyDown={(event) =>
                    reorderWithKeyboard(event, sketchbook.id)
                  }
                  onLostPointerCapture={finishPointerDrag}
                  onPointerCancel={cancelPointerDrag}
                  onPointerDown={(event) =>
                    beginPointerDrag(event, sketchbook.id)
                  }
                  onPointerMove={updatePointerDrag}
                  onPointerUp={finishPointerDrag}
                  type="button"
                >
                  <GripHorizontal aria-hidden="true" />
                </button>
                <button
                  onClick={() => {
                    setRenamingSketchbookId(sketchbook.id);
                    setName(sketchbook.name);
                    setNameDialogOpen(true);
                  }}
                  type="button"
                >
                  Rename
                </button>
                <button
                  aria-label={`Delete ${sketchbook.name}`}
                  className="sketchbook-delete"
                  onClick={() => setSketchbookPendingDelete(sketchbook)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            ) : null}
            {!editMode ? (
              <button
                aria-label={
                  sketchbook.favourite
                    ? `Remove ${sketchbook.name} from favourites`
                    : `Add ${sketchbook.name} to favourites`
                }
                aria-pressed={sketchbook.favourite}
                className="favourite-button"
                onClick={() => void (async () => {
                  const adding = !sketchbook.favourite;
                  const saved = await commit({
                    type: "favourite-set",
                    targetType: "sketchbook",
                    targetId: sketchbook.id,
                    favourite: adding,
                  });
                  if (saved !== false) setFavouriteConfirmation(adding ? "Added to Your Favourites" : "Removed from Your Favourites");
                })()}
                type="button"
              >
                <ThumbsUp aria-hidden="true" />
              </button>
            ) : null}
          </article>
          );
        })}
      </div>
      <FavouriteConfirmation message={favouriteConfirmation} onDone={() => setFavouriteConfirmation(undefined)} />

      {sketchbookPendingDelete
        ? createPortal(
            <div
              className="delete-dialog-backdrop"
              onClick={() => setSketchbookPendingDelete(undefined)}
            >
              <div
                aria-labelledby="delete-sketchbook-title"
                aria-modal="true"
                className="delete-dialog"
                onClick={(event) => event.stopPropagation()}
                role="alertdialog"
              >
                <Trash2 aria-hidden="true" />
                <h2 id="delete-sketchbook-title">Delete this sketchbook?</h2>
                <p>{sketchbookPendingDelete.name} and all of its pages will be deleted.</p>
                <div className="delete-dialog-actions">
                  <button autoFocus onClick={() => setSketchbookPendingDelete(undefined)} type="button">
                    Keep sketchbook
                  </button>
                  <button
                    className="confirm-delete"
                    onClick={() => {
                      const sketchbookId = sketchbookPendingDelete.id;
                      setSketchbookPendingDelete(undefined);
                      void onDeleteSketchbook(sketchbookId);
                    }}
                    type="button"
                  >
                    Delete sketchbook
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {nameDialogOpen ? (
        <div className="dialog-backdrop">
          <form
            aria-labelledby="new-sketchbook-heading"
            aria-modal="true"
            className="name-dialog"
            onSubmit={(event) => void saveSketchbookName(event)}
            role="dialog"
          >
            <h2 id="new-sketchbook-heading">
              {renamingSketchbookId
                ? "Rename sketchbook"
                : "Name your sketchbook"}
            </h2>
            <label htmlFor="sketchbook-name">Sketchbook name</label>
            <input
              autoFocus
              id="sketchbook-name"
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder="For example, Animals"
              value={name}
            />
            <button
              aria-pressed={recording?.state === "recording"}
              className="speak-title-action"
              onClick={() => void speakTitle()}
              type="button"
            >
              <Mic aria-hidden="true" />
              {recording?.state === "recording"
                ? "Stop title"
                : "Speak title"}
            </button>
            {speechMessage ? (
              <p aria-live="polite" className="speech-title-status">
                {speechMessage}
              </p>
            ) : null}
            <div className="dialog-actions">
              <button
                disabled={creating}
                onClick={closeNameDialog}
                type="button"
              >
                Cancel
              </button>
              <button
                className="primary-dialog-action"
                disabled={!name.trim() || creating}
                type="submit"
              >
                {creating
                  ? "Saving…"
                  : renamingSketchbookId
                    ? "Save name"
                    : "Create sketchbook"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export function EmptySketchbookView({
  onAddPage,
  onBack,
  sketchbook,
}: {
  onAddPage: () => void;
  onBack: () => void;
  sketchbook: Sketchbook;
}) {
  return (
    <section className="library-view" aria-labelledby="empty-sketchbook-heading">
      <header className="library-heading">
        <button className="back-to-library" onClick={onBack} type="button">
          <ChevronLeft aria-hidden="true" />
          All sketchbooks
        </button>
      </header>
      <div className="empty-library">
        <NotebookTabs aria-hidden="true" />
        <h1 id="empty-sketchbook-heading">{sketchbook.name}</h1>
        <p>This sketchbook does not have any pages yet.</p>
        <button className="large-action" onClick={onAddPage} type="button">
          <Plus aria-hidden="true" />
          Add first page
        </button>
      </div>
    </section>
  );
}

export function FavouritesView({
  commit,
  onOpenFavourite,
  sketchRepository,
  snapshot,
}: {
  commit: (operation: DocumentOperationInput) => boolean | void | Promise<boolean | void>;
  onOpenFavourite: (favourite: Favourite) => void;
  sketchRepository: SketchRepository;
  snapshot: JournalSnapshot;
}) {
  const [arranging, setArranging] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<Favourite>();
  const [favouriteConfirmation, setFavouriteConfirmation] = useState<string>();
  const displayName = snapshot.settings.displayName.trim() || "there";

  return (
    <section className="library-view" aria-labelledby="favourites-heading">
      <header className="library-heading">
        <div>
          <p className="eyebrow">Easy to find again</p>
          <h1 id="favourites-heading">My Favourites</h1>
        </div>
        <button
          aria-pressed={arranging}
          className={arranging ? "large-action selected" : "large-action"}
          onClick={() => setArranging((current) => !current)}
          type="button"
        >
          <Move aria-hidden="true" />
          {arranging ? "Done arranging" : "Arrange"}
        </button>
      </header>

      {snapshot.favourites.length === 0 ? (
        <div className="empty-library">
          <ThumbsUp aria-hidden="true" />
          <h2>No favourites yet</h2>
          <p>Use the thumbs-up on a diary day or sketchbook to keep it here.</p>
        </div>
      ) : (
        <div className="book-grid favourites-grid">
          {snapshot.favourites.map((favourite) => {
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
                className={`book-card favourite-card${arranging ? " arranging" : ""}`}
                key={favourite.id}
              >
                <button
                  aria-label={`Open favourite: ${title}`}
                  aria-disabled={arranging}
                  className="favourite-card-link"
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
                  <button
                    aria-label={`Remove ${title} from favourites`}
                    aria-pressed="true"
                    className="favourite-button favourite-remove-button"
                    onClick={() => setPendingRemoval(favourite)}
                    type="button"
                  >
                    <ThumbsUp aria-hidden="true" />
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {pendingRemoval
        ? createPortal(
            <div
              className="delete-dialog-backdrop"
              onClick={() => setPendingRemoval(undefined)}
            >
              <div
                aria-labelledby="remove-favourite-title"
                aria-modal="true"
                className="delete-dialog favourite-removal-dialog"
                onClick={(event) => event.stopPropagation()}
                role="alertdialog"
              >
                <ThumbsUp aria-hidden="true" />
                <h2 id="remove-favourite-title">Hi {displayName}</h2>
                <p>Remove from your Favourites?</p>
                <div className="delete-dialog-actions">
                  <button autoFocus onClick={() => setPendingRemoval(undefined)} type="button">
                    Keep favourite
                  </button>
                  <button
                    className="confirm-delete"
                    onClick={() => void (async () => {
                      const saved = await commit({
                        type: "favourite-set",
                        targetType: pendingRemoval.targetType,
                        targetId: pendingRemoval.targetId,
                        favourite: false,
                      });
                      setPendingRemoval(undefined);
                      if (saved !== false) setFavouriteConfirmation("Removed from Your Favourites");
                    })()}
                    type="button"
                  >
                    Remove favourite
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      <FavouriteConfirmation message={favouriteConfirmation} onDone={() => setFavouriteConfirmation(undefined)} />
    </section>
  );
}
