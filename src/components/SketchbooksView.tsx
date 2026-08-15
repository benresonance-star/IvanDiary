import {
  ChevronLeft,
  ChevronRight,
  Mic,
  Move,
  NotebookTabs,
  Plus,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import type {
  DocumentOperationInput,
  JournalSnapshot,
  Sketchbook,
} from "../domain/models";
import type {
  AppleTranscriptionPlugin,
  JournalAudioPlugin,
  JournalFilesPlugin,
  RecordingSnapshot,
} from "../native/contracts";
import {
  EphemeralTranscriptionError,
  transcribeEphemeralRecording,
} from "../native/ephemeralTranscription";
import { recordingStorageAvailable } from "../native/durableAudio";
import type { SketchRepository } from "../sketch/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { PagePreview } from "./DiaryPageStrip";
import { FavouriteConfirmation } from "./FavouriteConfirmation";
import { moveItem } from "./libraryViewHelpers";

export function SketchbooksView({
  audio,
  commit,
  files,
  lastViewedSketchbookId,
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
  lastViewedSketchbookId?: string;
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
  const sketchbookIds = snapshot.sketchbooks.map(
    (sketchbook) => sketchbook.id,
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
      try {
        const result = await transcribeEphemeralRecording({
          audio,
          files,
          onFinalized: setRecording,
          requestPermission: false,
          transcription,
        });
        setName(result.rawText);
        setSpeechMessage("Spoken title added. Check it before saving.");
      } catch (error) {
        if (
          error instanceof EphemeralTranscriptionError &&
          error.failure === "finalization"
        ) {
          setSpeechMessage("The spoken title could not be saved. Type it instead.");
        } else if (
          !(error instanceof EphemeralTranscriptionError) ||
          error.failure !== "missing-asset"
        ) {
          setSpeechMessage("The title was not understood. Try again or type it.");
        }
      }
      return;
    }

    try {
      const permission = await transcription.requestPermission();
      if (!permission.granted) {
        setSpeechMessage("Speech permission is off. Type the title instead.");
        return;
      }
      if (!await recordingStorageAvailable(files)) {
        setSpeechMessage(
          "Storage is too low to record safely. Type the title instead.",
        );
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

  const reorderSketchbook = (sketchbookId: string, offset: -1 | 1) => {
    const sourceIndex = sketchbookIds.indexOf(sketchbookId);
    const targetId = sketchbookIds[sourceIndex + offset];
    if (!targetId) return;
    void onReorderSketchbooks(
      moveItem(sketchbookIds, sketchbookId, targetId),
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
            className={editMode ? "large-action arrange-action selected" : "large-action arrange-action"}
            data-help-topic="library-arrange"
            onClick={() => setEditMode((current) => !current)}
            type="button"
          >
            <Move aria-hidden="true" />
            {editMode ? "Done editing" : "Edit"}
          </button>
          <button
            className="large-action"
            data-help-topic="new-sketchbook"
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
        {snapshot.sketchbooks.map((sketchbook, sketchbookIndex) => {
          const firstPage = snapshot.pages.find(
            (page) => page.id === sketchbook.pageIds[0],
          );
          return (
          <article
            className={`book-card sketchbook-card${editMode ? " editing" : ""}${lastViewedSketchbookId === sketchbook.id ? " last-viewed" : ""}`}
            data-sketchbook-id={sketchbook.id}
            key={sketchbook.id}
          >
            <button
              aria-label={
                editMode
                  ? `${sketchbook.name}. Use the edit controls.`
                  : `Open ${sketchbook.name}`
              }
              className="sketchbook-card-link"
              data-help-topic="open-sketchbook"
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
                <div className="favourite-reorder-controls sketchbook-reorder-controls">
                  <button
                    aria-label={`Move ${sketchbook.name} earlier`}
                    disabled={sketchbookIndex === 0}
                    onClick={() => reorderSketchbook(sketchbook.id, -1)}
                    type="button"
                  >
                    <ChevronLeft aria-hidden="true" />
                  </button>
                  <button
                    aria-label={`Move ${sketchbook.name} later`}
                    disabled={
                      sketchbookIndex === snapshot.sketchbooks.length - 1
                    }
                    onClick={() => reorderSketchbook(sketchbook.id, 1)}
                    type="button"
                  >
                    <ChevronRight aria-hidden="true" />
                  </button>
                </div>
                <button
                  className="sketchbook-rename"
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
                data-help-topic="favourite"
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

      {sketchbookPendingDelete ? (
        <ConfirmDialog
          cancelLabel="Keep sketchbook"
          confirmClassName="confirm-delete"
          confirmLabel="Delete sketchbook"
          icon={<Trash2 aria-hidden="true" />}
          onCancel={() => setSketchbookPendingDelete(undefined)}
          onConfirm={() => {
            const sketchbookId = sketchbookPendingDelete.id;
            setSketchbookPendingDelete(undefined);
            void onDeleteSketchbook(sketchbookId);
          }}
          title="Delete this sketchbook?"
        >
          <p>{sketchbookPendingDelete.name} and all of its pages will be deleted.</p>
        </ConfirmDialog>
      ) : null}

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
                data-help-topic={
                  renamingSketchbookId ? undefined : "new-sketchbook"
                }
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
