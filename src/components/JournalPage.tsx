import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  Check,
  ChevronLeft,
  Eraser,
  Hand,
  ImagePlus,
  Link as LinkIcon,
  Mic,
  Move,
  PenLine,
  Pencil,
  Star,
  Type,
  Undo2,
} from "lucide-react";

import type {
  DocumentOperationInput,
  LinkObject,
  Page,
  PageObject,
  SaveHealth,
  Sketchbook,
  TextObject,
  TranscriptObject,
  VoiceRecordingObject,
} from "../domain/models";
import type {
  AppleTranscriptionPlugin,
  JournalAudioPlugin,
  RecordingSnapshot,
} from "../native/contracts";
import { useNativeDrawingOverlay } from "../hooks/useNativeDrawingOverlay";
import {
  hasNativePencilKit,
  undoNativeDrawingOverlay,
} from "../native/pencilKit";
import type { BrowserSketchRepository } from "../repository/browserSketchRepository";
import {
  SketchSurface,
  type SketchSurfaceHandle,
} from "../sketch/SketchSurface";
import { NativeSketchPreview } from "../sketch/NativeSketchPreview";
import type { SketchTool } from "../sketch/types";
import { browserFileToAsset } from "../utils/assets";
import { localDateKey } from "../utils/date";
import { createId } from "../utils/id";
import { AudioCard } from "./AudioCard";
import {
  ArrangeablePageObject,
  type LayoutChange,
} from "./ArrangeablePageObject";
import { defaultObjectFrame } from "./arrangeGeometry";
import { DiaryCalendar } from "./DiaryCalendar";
import { DiaryPageStrip } from "./DiaryPageStrip";
import { FlowerPhoto } from "./JournalIllustrations";
import {
  PenSettingsHud,
  type PenSettings,
} from "./PenSettingsHud";

type Commit = (operation: DocumentOperationInput) => Promise<boolean>;
type PageTool = SketchTool | "arrange" | "view";
export type PageWorkspaceContext =
  | {
      kind: "diary";
      date: string;
      favourite: boolean;
      journalDayId: string;
    }
  | {
      kind: "sketchbook";
      favourite: boolean;
      onBack: () => void;
      sketchbook: Sketchbook;
    };
type PageAction =
  | { kind: "drawing" }
  | { kind: "layout"; objectId: string; change: LayoutChange }
  | { kind: "delete"; objects: PageObject[] };

function deletionDescription(
  object: Exclude<PageObject, TranscriptObject>,
  transcript?: TranscriptObject,
): string {
  switch (object.type) {
    case "voice":
      return (
        transcript?.editedText?.trim() ||
        transcript?.rawText.trim() ||
        "Voice recording"
      );
    case "photo":
      return object.altText?.trim() || "Untitled image";
    case "text":
      return object.text.trim() || "Empty text block";
    case "link":
      return object.title.trim() || object.url;
    default: {
      const exhaustiveObject: never = object;
      throw new Error(`Unsupported page object: ${exhaustiveObject}`);
    }
  }
}

function TranscriptEditor({
  transcript,
  readOnly,
  onSave,
}: {
  readOnly: boolean;
  transcript: TranscriptObject;
  onSave: (next: TranscriptObject) => void;
}) {
  const [text, setText] = useState(
    transcript.editedText ?? transcript.rawText,
  );

  return (
    <textarea
      aria-label="Edit voice transcript"
      className="transcript-editor"
      onBlur={() => {
        if (text !== (transcript.editedText ?? transcript.rawText)) {
          onSave({
            ...transcript,
            editedText: text,
            revision: transcript.revision + 1,
          });
        }
      }}
      onChange={(event) => setText(event.target.value)}
      readOnly={readOnly}
      value={text}
    />
  );
}

function TextCard({
  object,
  readOnly,
  onSave,
}: {
  object: TextObject;
  readOnly: boolean;
  onSave: (next: TextObject) => void;
}) {
  const [text, setText] = useState(object.text);

  return (
    <textarea
      aria-label="Journal text"
      autoFocus={object.text.length === 0}
      className="page-text-card"
      onBlur={() => {
        if (text !== object.text) {
          onSave({ ...object, text, revision: object.revision + 1 });
        }
      }}
      onChange={(event) => setText(event.target.value)}
      placeholder="Write here, or use Apple dictation…"
      readOnly={readOnly}
      style={{ fontSize: `${object.textScale}em` }}
      value={text}
    />
  );
}

export function LinkComposer({
  initialTitle = "",
  initialUrl = "",
  onClose,
  onSave,
}: {
  initialTitle?: string;
  initialUrl?: string;
  onClose: () => void;
  onSave: (url: string, title: string) => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [title, setTitle] = useState(initialTitle);
  const [error, setError] = useState<string>();
  const editing = initialUrl.length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("Unsupported protocol");
      }
      onSave(parsed.toString(), title.trim() || parsed.hostname);
    } catch {
      setError("Enter a complete web address, such as https://example.com");
    }
  };

  return (
    <form className="link-composer" onSubmit={submit}>
      <h2>{editing ? "Edit web link" : "Add a web link"}</h2>
      <label>
        Web address
        <input
          autoFocus
          inputMode="url"
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://"
          value={url}
        />
      </label>
      <label>
        Name
        <input
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Optional"
          value={title}
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <div>
        <button className="secondary-action" onClick={onClose} type="button">
          Cancel
        </button>
        <button className="large-action" type="submit">
          {editing ? "Save changes" : "Add link"}
        </button>
      </div>
    </form>
  );
}

function nextPosition(page: Page): { x: number; y: number } {
  const slots = [
    { x: 0.08, y: 0.46 },
    { x: 0.38, y: 0.46 },
    { x: 0.68, y: 0.46 },
    { x: 0.08, y: 0.72 },
    { x: 0.38, y: 0.72 },
    { x: 0.68, y: 0.72 },
  ];
  return slots[page.objects.length % slots.length] ?? slots[0]!;
}

export function PageWorkspace({
  audio,
  commit,
  context,
  entryDates,
  health,
  onAddPage,
  onDrawingHealthChange,
  onReorderPages,
  onSelectDate,
  onSelectPage,
  page,
  pages,
  penColor,
  penWidth,
  simpleMode,
  sketchRepository,
  transcription,
}: {
  audio: JournalAudioPlugin;
  commit: Commit;
  context: PageWorkspaceContext;
  entryDates?: ReadonlySet<string>;
  health: SaveHealth;
  onAddPage: () => void;
  onDrawingHealthChange: (health: SaveHealth) => void;
  onReorderPages: (pageIds: string[]) => Promise<boolean>;
  onSelectDate?: (dateKey: string) => void;
  onSelectPage: (pageId: string) => void;
  page: Page;
  pages: Page[];
  penColor: string;
  penWidth: number;
  simpleMode: boolean;
  sketchRepository: BrowserSketchRepository;
  transcription: AppleTranscriptionPlugin;
}) {
  const sketchRef = useRef<SketchSurfaceHandle>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const toolPaletteRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const actionTimelineRef = useRef<PageAction[]>([]);
  const [tool, setTool] = useState<PageTool>("view");
  const [penHudOpen, setPenHudOpen] = useState(false);
  const [penSettings, setPenSettings] = useState<PenSettings>({
    color: penColor,
    width: penWidth,
  });
  const [selectedObjectId, setSelectedObjectId] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [linkComposerOpen, setLinkComposerOpen] = useState(false);
  const [linkBeingEdited, setLinkBeingEdited] = useState<LinkObject>();
  const [recording, setRecording] = useState<RecordingSnapshot>();
  const { overlayActive } = useNativeDrawingOverlay({
    documentId: page.drawingDocumentId,
    enabled: hasNativePencilKit() && !penHudOpen,
    tool,
    color: penSettings.color,
    width: penSettings.width,
    paperRef,
    toolPaletteRef,
    sketchRepository,
    onError: setNotice,
  });

  const heading =
    context.kind === "diary"
      ? new Intl.DateTimeFormat("en-AU", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date(`${context.date}T12:00:00`))
      : context.sketchbook.name;

  const transcripts = new Map(
    page.objects
      .filter(
        (object): object is TranscriptObject => object.type === "transcript",
      )
      .map((transcript) => [transcript.recordingId, transcript]),
  );
  const updateObject = (
    object: TextObject | TranscriptObject | LinkObject,
  ) => {
    void commit({
      type: "page-object-update",
      pageId: page.id,
      object,
    });
  };

  const commitLayoutChange = (objectId: string, change: LayoutChange) => {
    actionTimelineRef.current.push({ kind: "layout", objectId, change });
    const operation: DocumentOperationInput =
      change.kind === "move"
        ? {
            type: "page-object-move",
            pageId: page.id,
            objectId,
            position: change.after.position,
          }
        : {
            type: "page-object-resize",
            pageId: page.id,
            objectId,
            frame: change.after.frame,
          };
    void commit(operation);
  };

  const deletePageObject = (
    object: Exclude<PageObject, TranscriptObject>,
  ) => {
    const relatedTranscript =
      object.type === "voice" ? transcripts.get(object.id) : undefined;
    actionTimelineRef.current.push({
      kind: "delete",
      objects: relatedTranscript ? [object, relatedTranscript] : [object],
    });
    setSelectedObjectId(undefined);
    void commit({
      type: "page-object-delete",
      pageId: page.id,
      objectId: object.id,
    });
    if (relatedTranscript) {
      void commit({
        type: "page-object-delete",
        pageId: page.id,
        objectId: relatedTranscript.id,
      });
    }
  };

  const undoLastAction = () => {
    if (overlayActive) {
      void undoNativeDrawingOverlay();
      return;
    }
    const action = actionTimelineRef.current.pop();
    if (!action || action.kind === "drawing") {
      sketchRef.current?.undo();
      return;
    }

    if (action.kind === "delete") {
      for (const object of action.objects) {
        void commit({
          type: "page-object-add",
          pageId: page.id,
          object,
        });
      }
      return;
    }

    const operation: DocumentOperationInput =
      action.change.kind === "move"
        ? {
            type: "page-object-move",
            pageId: page.id,
            objectId: action.objectId,
            position: action.change.before.position,
          }
        : {
            type: "page-object-resize",
            pageId: page.id,
            objectId: action.objectId,
            frame: action.change.before.frame,
          };
    void commit(operation);
  };

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setNotice("Preparing the photo…");
    try {
      const asset = await browserFileToAsset(file);
      const existingPhoto = page.objects.find(
        (object) => object.type === "photo",
      );
      const operation: DocumentOperationInput = existingPhoto
        ? {
            type: "page-object-update",
            pageId: page.id,
            object: {
              ...existingPhoto,
              asset,
              revision: existingPhoto.revision + 1,
            },
          }
        : {
            type: "page-object-add",
            pageId: page.id,
            object: {
              id: createId(),
              type: "photo",
              pageId: page.id,
              position: nextPosition(page),
              frame: { width: 0.22, height: 0.3 },
              createdAt: new Date().toISOString(),
              revision: 0,
              asset,
              size: { width: 1200, height: 900 },
              altText: file.name,
            },
          };
      const saved = await commit(operation);
      setNotice(
        saved
          ? "Photo saved on this device."
          : "The photo could not be saved.",
      );
    } catch {
      setNotice("The photo could not be read.");
    }
  };

  const addText = async () => {
    const object: TextObject = {
      id: createId(),
      type: "text",
      pageId: page.id,
      position: nextPosition(page),
      frame: { width: 0.26, height: 0.18 },
      createdAt: new Date().toISOString(),
      revision: 0,
      text: "",
      textScale: 1,
    };
    const saved = await commit({
      type: "page-object-add",
      pageId: page.id,
      object,
    });
    setNotice(
      saved
        ? "Text box added. Use the keyboard or Apple dictation."
        : "The text box could not be added.",
    );
  };

  const addLink = async (url: string, title: string) => {
    const object: LinkObject = {
      id: createId(),
      type: "link",
      pageId: page.id,
      position: nextPosition(page),
      frame: { width: 0.26, height: 0.1 },
      createdAt: new Date().toISOString(),
      revision: 0,
      url,
      title,
    };
    const saved = await commit({
      type: "page-object-add",
      pageId: page.id,
      object,
    });
    setLinkComposerOpen(false);
    setNotice(saved ? "Link saved on this device." : "The link could not be saved.");
  };

  const saveLink = async (url: string, title: string) => {
    if (!linkBeingEdited) {
      await addLink(url, title);
      return;
    }

    const saved = await commit({
      type: "page-object-update",
      pageId: page.id,
      object: {
        ...linkBeingEdited,
        url,
        title,
        revision: linkBeingEdited.revision + 1,
      },
    });
    setLinkComposerOpen(false);
    setLinkBeingEdited(undefined);
    setNotice(
      saved
        ? "Link changes saved on this device."
        : "The link changes could not be saved.",
    );
  };

  const toggleVoice = async () => {
    if (recording?.state === "recording") {
      const stopped = await audio.stop();
      setRecording(stopped);
      if (!stopped.asset) {
        setNotice("The demonstration recording could not be saved.");
        return;
      }

      const voice: VoiceRecordingObject = {
        id: stopped.id,
        type: "voice",
        pageId: page.id,
        position: nextPosition(page),
        frame: { width: 0.28, height: 0.23 },
        createdAt: new Date().toISOString(),
        revision: 0,
        asset: stopped.asset,
        durationMs: stopped.elapsedMs,
        transcriptionStatus: "pending",
      };
      const voiceSaved = await commit({
        type: "page-object-add",
        pageId: page.id,
        object: voice,
      });
      if (!voiceSaved) {
        setNotice("The demonstration recording could not be saved.");
        return;
      }

      const result = await transcription.transcribe({
        recordingId: voice.id,
        asset: voice.asset,
        locale: "en-AU",
      });
      await commit({
        type: "page-object-add",
        pageId: page.id,
        object: {
          id: createId(),
          type: "transcript",
          pageId: page.id,
          position: {
            x: voice.position.x,
            y: Math.min(0.82, voice.position.y + 0.1),
          },
          createdAt: new Date().toISOString(),
          revision: 0,
          recordingId: voice.id,
          rawText: result.rawText,
          locale: result.locale,
          engine: result.engine,
        },
      });
      setNotice(
        "Browser demonstration saved. No microphone audio was captured.",
      );
      return;
    }

    const started = await audio.start();
    setRecording(started);
    setNotice("Browser demonstration only. Tap Voice again to stop.");
  };

  const closePenSettings = () => {
    setPenHudOpen(false);
    if (
      penSettings.color !== penColor ||
      Math.abs(penSettings.width - penWidth) > 0.001
    ) {
      void commit({
        type: "settings-update",
        settings: {
          penColor: penSettings.color,
          penWidth: penSettings.width,
        },
      });
    }
  };

  return (
    <section
      className="journal-workspace"
      aria-label={
        context.kind === "diary"
          ? "Today’s diary page"
          : `${context.sketchbook.name} sketchbook page`
      }
    >
      <div
        className="tool-palette"
        aria-label="Page tools"
        ref={toolPaletteRef}
      >
        <button
          aria-pressed={tool === "view"}
          className={tool === "view" ? "tool selected" : "tool"}
          onClick={() => {
            setTool("view");
            setPenHudOpen(false);
            setSelectedObjectId(undefined);
          }}
          type="button"
        >
          <Hand aria-hidden="true" />
          <span>View</span>
        </button>
        <button
          aria-expanded={penHudOpen}
          aria-haspopup="dialog"
          aria-pressed={tool === "pen"}
          className={tool === "pen" ? "tool selected" : "tool"}
          onClick={() => {
            if (tool === "pen") {
              setPenHudOpen(true);
              return;
            }
            setTool("pen");
            setSelectedObjectId(undefined);
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
          }}
          type="button"
        >
          <PenLine aria-hidden="true" />
          <span>Draw</span>
          <span
            aria-hidden="true"
            className="draw-colour-indicator"
            style={{ backgroundColor: penSettings.color }}
          />
        </button>
        <button
          aria-pressed={tool === "eraser"}
          className={tool === "eraser" ? "tool selected" : "tool"}
          onClick={() => {
            setTool("eraser");
            setSelectedObjectId(undefined);
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
          }}
          type="button"
        >
          <Eraser aria-hidden="true" />
          <span>Erase</span>
        </button>
        <button
          aria-pressed={tool === "arrange"}
          className={tool === "arrange" ? "tool selected" : "tool"}
          onClick={() => setTool("arrange")}
          type="button"
        >
          <Move aria-hidden="true" />
          <span>Arrange</span>
        </button>
        <button
          className="tool"
          onClick={() => photoInputRef.current?.click()}
          type="button"
        >
          <ImagePlus aria-hidden="true" />
          <span>Photo</span>
        </button>
        <button className="tool" onClick={() => void addText()} type="button">
          <Type aria-hidden="true" />
          <span>Text</span>
        </button>
        <button
          className="tool"
          onClick={() => {
            setLinkBeingEdited(undefined);
            setLinkComposerOpen(true);
          }}
          type="button"
        >
          <LinkIcon aria-hidden="true" />
          <span>Link</span>
        </button>
        <button
          aria-pressed={recording?.state === "recording"}
          className={
            recording?.state === "recording"
              ? "tool voice-tool recording"
              : "tool voice-tool"
          }
          onClick={() => void toggleVoice()}
          type="button"
        >
          <Mic aria-hidden="true" />
          <span>{recording?.state === "recording" ? "Stop demo" : "Voice"}</span>
        </button>
        <button
          className="tool"
          onClick={undoLastAction}
          type="button"
        >
          <Undo2 aria-hidden="true" />
          <span>Undo</span>
        </button>
      </div>

      {penHudOpen ? (
        <>
          <button
            aria-label="Close pen settings"
            className="pen-hud-backdrop"
            onClick={closePenSettings}
            type="button"
          />
          <PenSettingsHud
            onChange={setPenSettings}
            onDone={closePenSettings}
            settings={penSettings}
            simpleMode={simpleMode}
          />
        </>
      ) : null}

      <input
        accept="image/*"
        aria-hidden="true"
        className="visually-hidden"
        onChange={(event) => void handlePhoto(event)}
        ref={photoInputRef}
        tabIndex={-1}
        type="file"
      />

      <div
        className={`paper-page paper-${page.paperStyle}${
          tool === "pen" || tool === "eraser" ? " drawing-active" : ""
        }`}
        ref={paperRef}
      >
        <SketchSurface
          capabilities={
            overlayActive || tool === "arrange" || tool === "view"
              ? {
                  kind: "readonly",
                  tools: [],
                  fingerDrawing: false,
                  pressure: false,
                }
              : {
                  kind: "ipad",
                  tools: ["pen", "eraser"],
                  fingerDrawing: false,
                  pressure: true,
                }
          }
          documentId={page.drawingDocumentId}
          onError={(error) => setNotice(error.message)}
          onMutation={() =>
            actionTimelineRef.current.push({ kind: "drawing" })
          }
          onSaveHealthChange={onDrawingHealthChange}
          penColor={penSettings.color}
          penWidth={penSettings.width}
          ref={sketchRef}
          repository={sketchRepository}
          tool={tool === "eraser" ? "eraser" : "pen"}
        />
        {overlayActive ? null : (
          <NativeSketchPreview documentId={page.drawingDocumentId} />
        )}

        <header className="page-date">
          {context.kind === "sketchbook" ? (
            <button
              aria-label="Back to sketchbooks"
              className="back-to-library"
              onClick={context.onBack}
              type="button"
            >
              <ChevronLeft aria-hidden="true" />
            </button>
          ) : null}
          {context.kind === "diary" && entryDates && onSelectDate ? (
            <DiaryCalendar
              entryDates={entryDates}
              onSelectDate={onSelectDate}
              selectedDate={context.date}
            />
          ) : null}
          <p>{heading}</p>
          {context.kind === "diary" &&
          context.date !== localDateKey(new Date()) ? (
            <span className="earlier-diary-entry">EARLIER DIARY ENTRY</span>
          ) : null}
          <button
            aria-label={
              context.favourite
                ? context.kind === "diary"
                  ? "Remove today from favourites"
                  : "Remove this page from favourites"
                : context.kind === "diary"
                  ? "Add today to favourites"
                  : "Add this page to favourites"
            }
            aria-pressed={context.favourite}
            className="page-favourite"
            onClick={() =>
              void commit({
                type: "favourite-set",
                targetType:
                  context.kind === "diary" ? "journal-day" : "page",
                targetId:
                  context.kind === "diary"
                    ? context.journalDayId
                    : page.id,
                favourite: !context.favourite,
              })
            }
            type="button"
          >
            <Star
              aria-hidden="true"
              fill={context.favourite ? "currentColor" : "none"}
            />
          </button>
        </header>

        {page.objects.map((object) => {
          if (object.type === "transcript") {
            return null;
          }
          switch (object.type) {
            case "voice": {
              const transcript = transcripts.get(object.id);
              return (
                <ArrangeablePageObject
                  arrange={tool === "arrange"}
                  className="page-object voice-object"
                  deleteDescription={deletionDescription(object, transcript)}
                  frame={defaultObjectFrame(object)}
                  key={object.id}
                  objectLabel="text block"
                  objectId={object.id}
                  onCommit={(change) =>
                    commitLayoutChange(object.id, change)
                  }
                  onDelete={() => deletePageObject(object)}
                  onSelect={() => setSelectedObjectId(object.id)}
                  pageRef={paperRef}
                  position={object.position}
                  selected={selectedObjectId === object.id}
                  showShortcuts={!simpleMode}
                >
                  <AudioCard
                    disabled={tool === "arrange"}
                    recording={object}
                  />
                  {transcript ? (
                    <TranscriptEditor
                      onSave={updateObject}
                      readOnly={tool === "arrange"}
                      transcript={transcript}
                    />
                  ) : null}
                </ArrangeablePageObject>
              );
            }
            case "photo":
              return (
                <ArrangeablePageObject
                  arrange={tool === "arrange"}
                  className="page-object photo-object"
                  deleteDescription={deletionDescription(object)}
                  frame={defaultObjectFrame(object)}
                  key={object.id}
                  objectLabel="image"
                  objectId={object.id}
                  onCommit={(change) =>
                    commitLayoutChange(object.id, change)
                  }
                  onDelete={() => deletePageObject(object)}
                  onSelect={() => setSelectedObjectId(object.id)}
                  pageRef={paperRef}
                  position={object.position}
                  selected={selectedObjectId === object.id}
                  showShortcuts={!simpleMode}
                >
                  {object.asset.localUri === "demo://garden-flowers" ? (
                    <FlowerPhoto />
                  ) : (
                    <img
                      alt={object.altText ?? "Journal photograph"}
                      src={object.asset.localUri}
                    />
                  )}
                </ArrangeablePageObject>
              );
            case "text":
              return (
                <ArrangeablePageObject
                  arrange={tool === "arrange"}
                  className="page-object text-object"
                  deleteDescription={deletionDescription(object)}
                  frame={defaultObjectFrame(object)}
                  key={object.id}
                  objectLabel="text block"
                  objectId={object.id}
                  onCommit={(change) =>
                    commitLayoutChange(object.id, change)
                  }
                  onDelete={() => deletePageObject(object)}
                  onSelect={() => setSelectedObjectId(object.id)}
                  pageRef={paperRef}
                  position={object.position}
                  selected={selectedObjectId === object.id}
                  showShortcuts={!simpleMode}
                >
                  <TextCard
                    object={object}
                    onSave={updateObject}
                    readOnly={tool === "arrange"}
                  />
                </ArrangeablePageObject>
              );
            case "link":
              return (
                <ArrangeablePageObject
                  arrange={tool === "arrange"}
                  className="page-object link-object-frame"
                  deleteDescription={deletionDescription(object)}
                  frame={defaultObjectFrame(object)}
                  key={object.id}
                  objectLabel="text block"
                  objectId={object.id}
                  onCommit={(change) =>
                    commitLayoutChange(object.id, change)
                  }
                  onDelete={() => deletePageObject(object)}
                  onSelect={() => setSelectedObjectId(object.id)}
                  pageRef={paperRef}
                  position={object.position}
                  selected={selectedObjectId === object.id}
                  showShortcuts={!simpleMode}
                >
                  {tool === "arrange" ? (
                    <div className="link-object">
                      <LinkIcon aria-hidden="true" />
                      <span>
                        <button
                          aria-label={`Edit link named ${object.title}`}
                          className="link-name-edit"
                          onClick={(event) => {
                            event.stopPropagation();
                            setLinkBeingEdited(object);
                            setLinkComposerOpen(true);
                          }}
                          type="button"
                        >
                          <strong>{object.title}</strong>
                          <Pencil aria-hidden="true" />
                        </button>
                        <small>{new URL(object.url).hostname}</small>
                      </span>
                    </div>
                  ) : (
                    <a
                      className="link-object"
                      href={object.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <LinkIcon aria-hidden="true" />
                      <span>
                        <strong>{object.title}</strong>
                        <small>{new URL(object.url).hostname}</small>
                      </span>
                    </a>
                  )}
                </ArrangeablePageObject>
              );
            default: {
              const exhaustiveObject: never = object;
              throw new Error(`Unsupported page object: ${exhaustiveObject}`);
            }
          }
        })}

        {linkComposerOpen ? (
          <LinkComposer
            initialTitle={linkBeingEdited?.title}
            initialUrl={linkBeingEdited?.url}
            key={linkBeingEdited?.id ?? "new-link"}
            onClose={() => {
              setLinkComposerOpen(false);
              setLinkBeingEdited(undefined);
            }}
            onSave={(url, title) => void saveLink(url, title)}
          />
        ) : null}

        {notice ? (
          <button
            className="notice"
            onClick={() => setNotice(undefined)}
            type="button"
          >
            {notice}
          </button>
        ) : null}

        <div aria-live="polite" className={`save-status ${health.localDurability}`}>
          {health.localDurability === "saving" ? (
            "Saving on this device…"
          ) : health.localDurability === "error" ? (
            "Could not save on this device"
          ) : (
            <>
              <Check aria-hidden="true" />
              Saved on this device
            </>
          )}
        </div>
      </div>
      <DiaryPageStrip
        activePageId={page.id}
        addPageLabel={
          context.kind === "diary"
            ? "Add another diary page"
            : "Add another sketchbook page"
        }
        arrange={tool === "arrange"}
        collectionLabel={
          context.kind === "diary"
            ? "Pages in today’s diary"
            : `Pages in ${context.sketchbook.name}`
        }
        onAddPage={onAddPage}
        onReorderPages={onReorderPages}
        onSelectPage={onSelectPage}
        pages={pages}
      />
    </section>
  );
}
