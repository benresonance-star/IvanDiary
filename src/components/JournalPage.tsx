import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MutableRefObject,
} from "react";
import {
  ChevronLeft,
  Eraser,
  Eye,
  ImagePlus,
  Link as LinkIcon,
  Mic,
  Move,
  PenLine,
  Pencil,
  Keyboard,
  Redo2,
  ThumbsUp,
  Type,
  Undo2,
} from "lucide-react";

import type {
  DocumentOperationInput,
  LinkObject,
  MyWord,
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
  JournalFilesPlugin,
  RecordingSnapshot,
} from "../native/contracts";
import { finalizeStoppedRecording } from "../native/durableAudio";
import { useNativeDrawingOverlay } from "../hooks/useNativeDrawingOverlay";
import {
  hasNativePencilKit,
  redoNativeDrawingOverlay,
  undoNativeDrawingOverlay,
} from "../native/pencilKit";
import type { BrowserSketchRepository } from "../repository/browserSketchRepository";
import { measureDrawingOverlayLayout } from "../sketch/drawingOverlayLayout";
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
import { insertSpokenText, type TextSelection } from "./textInsertion";
import { FlowerPhoto } from "./JournalIllustrations";
import { FavouriteConfirmation } from "./FavouriteConfirmation";
import {
  PenSettingsHud,
  type PenSettings,
} from "./PenSettingsHud";
import { DEFAULT_DRAWING_GRID } from "../sketch/gridGeometry";

type Commit = (operation: DocumentOperationInput) => Promise<boolean>;
export type PageTool = SketchTool | "arrange" | "view";
const MAX_PHOTOS_PER_PAGE = 5;
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

type TextDraft = {
  text: string;
  textScale: number;
  textAlign: "left" | "center";
};

const EMPTY_TEXT_DRAFT: TextDraft = {
  text: "",
  textScale: 2.5,
  textAlign: "left",
};

export function TextComposer({
  draft,
  recording,
  status,
  onCancel,
  onChange,
  onSubmit,
  onToggleVoice,
  selectionRef,
}: {
  draft: TextDraft;
  recording: boolean;
  status?: string;
  onCancel: () => void;
  onChange: (draft: TextDraft) => void;
  onSubmit: () => void;
  onToggleVoice: () => void;
  selectionRef: MutableRefObject<TextSelection>;
}) {
  const [input, setInput] = useState<"voice" | "keyboard">("voice");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [visibleViewport, setVisibleViewport] = useState<{
    height: number;
    offsetTop: number;
  }>();

  useEffect(() => {
    const viewport = globalThis.visualViewport;
    if (!viewport) return;
    const updateVisibleViewport = () => {
      setVisibleViewport({
        height: viewport.height,
        offsetTop: viewport.offsetTop,
      });
    };
    updateVisibleViewport();
    viewport.addEventListener("resize", updateVisibleViewport);
    viewport.addEventListener("scroll", updateVisibleViewport);
    return () => {
      viewport.removeEventListener("resize", updateVisibleViewport);
      viewport.removeEventListener("scroll", updateVisibleViewport);
    };
  }, []);

  const rememberSelection = (next: TextSelection) => {
    selectionRef.current = next;
  };

  const selectKeyboard = () => {
    setInput("keyboard");
    // iPadOS only presents its software keyboard when focus happens directly
    // inside the trusted tap event. Deferring this loses that user activation.
    textareaRef.current?.setAttribute("inputmode", "text");
    textareaRef.current?.focus({ preventScroll: true });
    textareaRef.current?.setSelectionRange(
      selectionRef.current.start,
      selectionRef.current.end,
    );
  };

  return (
    <div
      aria-labelledby="text-composer-title"
      aria-modal="true"
      className="text-composer-backdrop"
      role="dialog"
      style={visibleViewport ? {
        height: `${visibleViewport.height}px`,
        top: `${visibleViewport.offsetTop}px`,
      } : undefined}
    >
      <section className="text-composer">
        <header>
          <div>
            <h2 id="text-composer-title">Add text</h2>
          </div>
          <button className="secondary-action" disabled={recording} onClick={onCancel} type="button">Cancel</button>
        </header>
        <div className="text-input-row">
          <fieldset aria-label="Text input method" className={`text-input-toggle ${input === "keyboard" ? "keyboard-selected" : "voice-selected"}`}>
            <legend className="visually-hidden">Text input method</legend>
            <label className={input === "voice" ? "selected" : ""}>
              <input checked={input === "voice"} name="text-input-method" onChange={() => { setInput("voice"); textareaRef.current?.blur(); }} type="radio" value="voice" />
              <Mic aria-hidden="true" />Voice
            </label>
            <label className={input === "keyboard" ? "selected" : ""}>
              <input checked={input === "keyboard"} name="text-input-method" onChange={selectKeyboard} type="radio" value="keyboard" />
              <Keyboard aria-hidden="true" />Keyboard
            </label>
          </fieldset>
          {input === "voice" ? (
            <button
              aria-pressed={recording}
              className={`text-dictation-button${recording ? " recording" : " ready"}`}
              onClick={onToggleVoice}
              onPointerDown={(event) => {
                // Keep the textarea focused so its caret remains visible while
                // dictation begins at the selected insertion point.
                event.preventDefault();
              }}
              type="button"
            >
              <Mic aria-hidden="true" />
              {recording ? "Stop and turn voice into text" : "Tap to begin speaking"}
            </button>
          ) : null}
          <button className="large-action text-add-action" disabled={!draft.text.trim() || recording} onClick={onSubmit} type="button">Add to canvas</button>
        </div>
        <p aria-live="polite" className="text-composer-status" role="status">{status ?? (input === "voice" ? "Ready to listen" : "Keyboard ready")}</p>
        <textarea
          aria-label="Text for the page"
          className="text-composer-editor"
          inputMode={input === "voice" ? "none" : "text"}
          onClick={(event) => {
            event.currentTarget.focus({ preventScroll: true });
          }}
          onChange={(event) => {
            onChange({ ...draft, text: event.target.value });
            rememberSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd });
          }}
          onSelect={(event) => rememberSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })}
          placeholder="Your words will appear here…"
          ref={textareaRef}
          style={{ fontSize: `${draft.textScale}em`, textAlign: draft.textAlign }}
          value={draft.text}
        />
      </section>
    </div>
  );
}

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
  audio,
  assetUri,
  transcript,
  readOnly,
  onSave,
  onSuggestMyWord,
}: {
  audio: JournalAudioPlugin;
  assetUri: string;
  readOnly: boolean;
  transcript: TranscriptObject;
  onSave: (next: TranscriptObject) => void;
  onSuggestMyWord: (text: string) => void;
}) {
  const [text, setText] = useState(
    transcript.editedText ?? transcript.rawText,
  );
  const [suggestion, setSuggestion] = useState<string>();

  return (
    <div className="transcript-editor-wrap">
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
          const rawWords = new Set(transcript.rawText.toLocaleLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? []);
          const corrected = text.match(/[\p{L}\p{N}'’-]+/gu)?.find((word) => word.length > 1 && !rawWords.has(word.toLocaleLowerCase()));
          setSuggestion(corrected);
        }
      }}
      onChange={(event) => setText(event.target.value)}
      readOnly={readOnly}
      value={text}
    />
    {suggestion ? (
      <button onClick={() => { onSuggestMyWord(suggestion); setSuggestion(undefined); }} type="button">
        Add “{suggestion}” to My Words
      </button>
    ) : null}
    {transcript.segments?.some((segment) => typeof segment.confidence === "number" && segment.confidence < 0.5) ? (
      <div className="uncertain-words" aria-label="Words to check">
        <span>Words to check:</span>
        {transcript.segments.filter((segment) => typeof segment.confidence === "number" && segment.confidence < 0.5).map((segment, index) => (
          <button
            key={`${segment.startMs}-${index}`}
            onClick={() => void audio.play({ assetUri, startMs: segment.startMs, durationMs: Math.max(800, segment.durationMs + 400) })}
            title={segment.alternatives?.length ? `Other possibilities: ${segment.alternatives.join(", ")}` : undefined}
            type="button"
          >
            ▶ {segment.text}
          </button>
        ))}
      </div>
    ) : null}
    </div>
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
      style={{ textAlign: object.textAlign ?? "left" }}
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
  files,
  context,
  displayName,
  entryDates,
  health,
  onAddPage,
  onDrawingHealthChange,
  onDeletePage,
  onRefreshEntryDates,
  onReorderPages,
  onSelectDate,
  onSelectPage,
  onToolChange,
  page,
  pages,
  penColor,
  fingerDrawingEnabled,
  favouritePenColours,
  penNib,
  penNibProfiles,
  penOpacity,
  penWidth,
  myWords,
  recordingLimitMinutes,
  sketchRepository,
  tool,
  transcription,
}: {
  audio: JournalAudioPlugin;
  commit: Commit;
  files: JournalFilesPlugin;
  context: PageWorkspaceContext;
  displayName: string;
  entryDates?: ReadonlySet<string>;
  health: SaveHealth;
  onAddPage: () => Promise<boolean>;
  onDrawingHealthChange: (health: SaveHealth) => void;
  onDeletePage: (pageId: string) => Promise<boolean>;
  onRefreshEntryDates?: () => void;
  onReorderPages: (pageIds: string[]) => Promise<boolean>;
  onSelectDate?: (dateKey: string) => void;
  onSelectPage: (pageId: string) => void;
  onToolChange: (tool: PageTool) => void;
  page: Page;
  pages: Page[];
  penColor: string;
  fingerDrawingEnabled: boolean;
  favouritePenColours: string[];
  penNib: "pen" | "marker" | "pencil" | "brush";
  penNibProfiles: PenSettings["profiles"];
  penOpacity: number;
  penWidth: number;
  myWords: MyWord[];
  recordingLimitMinutes: 2 | 5 | 10 | 30 | null;
  sketchRepository: BrowserSketchRepository;
  tool: PageTool;
  transcription: AppleTranscriptionPlugin;
}) {
  const sketchRef = useRef<SketchSurfaceHandle>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const pageHeaderRef = useRef<HTMLElement>(null);
  const toolPaletteRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const actionTimelineRef = useRef<PageAction[]>([]);
  const setTool = onToolChange;
  const [penHudOpen, setPenHudOpen] = useState(false);
  const [penSettings, setPenSettings] = useState<PenSettings>({
    color: penColor,
    nib: penNib,
    profiles: penNibProfiles,
    width: penWidth,
    opacity: penOpacity,
    fingerDrawing: fingerDrawingEnabled,
    favouriteColours: favouritePenColours,
  });
  const drawingGrid = page.drawingGrid ?? DEFAULT_DRAWING_GRID;
  const photoCount = page.objects.filter((object) => object.type === "photo").length;
  const [selectedObjectId, setSelectedObjectId] = useState<string>();
  const [favouriteConfirmation, setFavouriteConfirmation] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [linkComposerOpen, setLinkComposerOpen] = useState(false);
  const [textComposerOpen, setTextComposerOpen] = useState(false);
  const [textComposerRequested, setTextComposerRequested] = useState(false);
  const [textDraft, setTextDraft] = useState<TextDraft>(EMPTY_TEXT_DRAFT);
  const textSelectionRef = useRef<TextSelection>({ start: 0, end: 0 });
  const [textRecording, setTextRecording] = useState<RecordingSnapshot>();
  const [textStatus, setTextStatus] = useState<string>();
  const [placingTextId, setPlacingTextId] = useState<string>();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [linkBeingEdited, setLinkBeingEdited] = useState<LinkObject>();
  const [recording, setRecording] = useState<RecordingSnapshot>();
  const autoStopStartedRef = useRef(false);
  const toggleVoiceRef = useRef<() => Promise<void>>(async () => undefined);
  useEffect(() => {
    let active = true;
    void audio.recoverInterrupted().then(({ recordings }) => {
      const recovered = recordings[0];
      if (active && recovered) {
        setRecording(recovered);
        setNotice("An unfinished voice recording was recovered. Tap Voice to finalize and save it.");
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [audio]);

  useEffect(() => {
    if (recording?.state !== "recording") return;
    const timer = window.setInterval(() => {
      void audio.status().then(setRecording).catch(() => undefined);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [audio, recording?.state]);

  const { overlayActive, overlayRequested, suspendOverlay } = useNativeDrawingOverlay({
    documentId: page.drawingDocumentId,
    enabled: hasNativePencilKit() && !penHudOpen && !calendarOpen && !textComposerOpen && !textComposerRequested,
    tool,
    color: penSettings.color,
    nib: penSettings.nib,
    width: penSettings.width,
    opacity: penSettings.opacity,
    fingerDrawing: penSettings.fingerDrawing !== false,
    grid: drawingGrid,
    paperRef,
    protectedHeaderRef: pageHeaderRef,
    toolPaletteRef,
    sketchRepository,
    onError: setNotice,
  });

  const openTextComposerAboveSketch = async () => {
    setTool("view");
    setSelectedObjectId(undefined);
    setTextComposerRequested(true);
    const hidden = await suspendOverlay();
    setTextComposerRequested(false);
    if (hidden) {
      setTextComposerOpen(true);
    } else {
      setNotice("The drawing is still saving. Try Text again in a moment.");
    }
  };
  const [sketchPreviewInsetTop, setSketchPreviewInsetTop] = useState(0);

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper) {
      return;
    }

    const updateInset = () => {
      const { contentInsetTop } = measureDrawingOverlayLayout(
        paper,
        toolPaletteRef.current,
        pageHeaderRef.current,
      );
      setSketchPreviewInsetTop((current) =>
        Math.abs(current - contentInsetTop) < 0.5 ? current : contentInsetTop,
      );
    };

    updateInset();
    const observer = new ResizeObserver(updateInset);
    observer.observe(paper);
    const tools = toolPaletteRef.current;
    if (tools) {
      observer.observe(tools);
    }
    globalThis.addEventListener("resize", updateInset);
    globalThis.visualViewport?.addEventListener("resize", updateInset);

    return () => {
      observer.disconnect();
      globalThis.removeEventListener("resize", updateInset);
      globalThis.visualViewport?.removeEventListener("resize", updateInset);
    };
  }, [page.id]);

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

  const toggleObjectLayer = (object: Exclude<PageObject, TranscriptObject>) => {
    void commit({
      type: "page-object-update",
      pageId: page.id,
      object: {
        ...object,
        layer: object.layer === "behind-sketch" ? "above-sketch" : "behind-sketch",
        revision: object.revision + 1,
      },
    });
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

  const redoDrawing = () => {
    if (overlayActive) {
      void redoNativeDrawingOverlay();
    } else {
      sketchRef.current?.redo();
    }
  };

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (photoCount >= MAX_PHOTOS_PER_PAGE) {
      setNotice("This page already has the maximum of five photos.");
      return;
    }

    setNotice("Preparing the photo…");
    try {
      const asset = await browserFileToAsset(file);
      const photoId = createId();
      const saved = await commit({
        type: "page-object-add",
        pageId: page.id,
        object: {
          id: photoId,
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
      });
      if (saved) {
        setSelectedObjectId(photoId);
        setTool("arrange");
      }
      setNotice(
        saved
          ? "Photo added. Move or resize it now."
          : "The photo could not be saved.",
      );
    } catch {
      setNotice("The photo could not be read.");
    }
  };

  const addText = async () => {
    const width = 0.42;
    const object: TextObject = {
      id: createId(),
      type: "text",
      pageId: page.id,
      position: { x: (1 - width) / 2, y: 0.3 },
      frame: { width, height: 0.24 },
      createdAt: new Date().toISOString(),
      revision: 0,
      text: textDraft.text.trim(),
      textScale: 1,
      textAlign: "left",
      layer: "above-sketch",
    };
    const saved = await commit({
      type: "page-object-add",
      pageId: page.id,
      object,
    });
    if (saved) {
      setTextComposerOpen(false);
      setPlacingTextId(object.id);
      setSelectedObjectId(object.id);
      setTool("arrange");
    } else setNotice("The text box could not be added.");
  };

  const toggleTextVoice = async () => {
    if (textRecording?.state === "recording") {
      setTextStatus("Turning your voice into text…");
      try {
        const stopped = await finalizeStoppedRecording(audio, files);
        setTextRecording(stopped);
        if (!stopped.asset) throw new Error("No recording asset");
        const permission = await transcription.requestPermission();
        if (!permission.granted) throw new Error("Speech permission denied");
        const result = await transcription.transcribe({ recordingId: stopped.id, asset: stopped.asset, locale: "en-AU", contextualStrings: myWords.filter((word) => word.enabled).map((word) => word.text).slice(0, 100) });
        setTextDraft((current) => {
          const inserted = insertSpokenText(current.text, result.rawText, textSelectionRef.current);
          textSelectionRef.current = { start: inserted.cursor, end: inserted.cursor };
          return { ...current, text: inserted.text };
        });
        setTextStatus(result.rawText.trim() ? "Voice added. Check or edit your words." : "No words were recognised. Try again or use the keyboard.");
        await files.removeToTrash({ assetId: stopped.asset.id }).catch(() => undefined);
      } catch {
        setTextStatus("Voice could not be turned into text. Try again or use the keyboard.");
      } finally {
        setTextRecording(undefined);
      }
      return;
    }
    try {
      const started = await audio.start({ maximumDurationMs: recordingLimitMinutes === null ? undefined : recordingLimitMinutes * 60_000 });
      setTextRecording(started);
      setTextStatus("Listening… Tap again when you are finished.");
    } catch {
      setTextStatus("Microphone could not start. Check permission or use the keyboard.");
    }
  };

  const finishTextPlacement = () => {
    setPlacingTextId(undefined);
    setSelectedObjectId(undefined);
    setTool("view");
    setTextDraft(EMPTY_TEXT_DRAFT);
    textSelectionRef.current = { start: 0, end: 0 };
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

  const transcribeVoice = async (voice: VoiceRecordingObject) => {
    const markStatus = (status: VoiceRecordingObject["transcriptionStatus"], revision: number) =>
      commit({
        type: "page-object-update",
        pageId: page.id,
        object: { ...voice, transcriptionStatus: status, revision },
      });

    try {
      const permission = await transcription.requestPermission();
      if (!permission.granted) {
        await markStatus("failed", voice.revision + 1);
        setNotice("Speech permission is off. Your original recording is still saved.");
        return;
      }
      const transcribingRevision = voice.revision + 1;
      if (!await markStatus("transcribing", transcribingRevision)) {
        throw new Error("Transcription state could not be saved.");
      }
      const result = await transcription.transcribe({
        recordingId: voice.id,
        asset: voice.asset,
        locale: "en-AU",
        contextualStrings: myWords.filter((word) => word.enabled).map((word) => word.text).slice(0, 100),
      });
      if (!result.rawText.trim()) {
        throw new Error("No speech was recognized.");
      }
      const transcriptSaved = await commit({
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
          ...(result.segments ? { segments: result.segments } : {}),
        },
      });
      if (!transcriptSaved) {
        throw new Error("Transcript could not be saved.");
      }
      await markStatus("complete", transcribingRevision + 1);
      setNotice("Recording and editable text saved on this device.");
    } catch {
      await markStatus("failed", voice.revision + 2).catch(() => false);
      setNotice("Text could not be generated. Your original recording is still saved.");
    }
  };

  const toggleVoice = async () => {
    if (recording?.state === "recording" || recording?.state === "interrupted" || recording?.state === "finalising") {
      let stopped: RecordingSnapshot;
      try {
        setRecording({ ...recording, state: "finalising" });
        stopped = await finalizeStoppedRecording(audio, files);
        setRecording(stopped);
      } catch {
        setRecording({ ...recording, state: "error", message: "The original recording could not be finalized." });
        setNotice("The original recording is recoverable, but it was not added to the page because finalization failed.");
        return;
      }
      if (!stopped.asset) return;

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
        setNotice("The finalized recording could not be added to this page.");
        return;
      }

      setNotice("Original voice recording saved. Generating editable text…");
      await transcribeVoice(voice);
      return;
    }

    let started: RecordingSnapshot;
    try {
      started = await audio.start({
        maximumDurationMs: recordingLimitMinutes === null ? undefined : recordingLimitMinutes * 60_000,
      });
      setRecording(started);
    } catch {
      setNotice("Microphone recording could not start. Check microphone permission and available storage.");
      return;
    }
    setNotice((audio as { isSimulation?: boolean }).isSimulation === true
      ? "Browser demonstration only. Tap Voice again to stop."
      : "Recording original audio on this device. Tap Voice again to save.");
  };
  useEffect(() => {
    toggleVoiceRef.current = toggleVoice;
  });

  useEffect(() => {
    if (recording?.state === "finalising" && !autoStopStartedRef.current) {
      autoStopStartedRef.current = true;
      setNotice("The recording time limit was reached. Saving the recording…");
      void toggleVoiceRef.current();
      return;
    }
    if (recording?.state !== "recording" || recordingLimitMinutes === null) {
      autoStopStartedRef.current = false;
      return;
    }
    if (recording.elapsedMs >= recordingLimitMinutes * 60_000 && !autoStopStartedRef.current) {
      autoStopStartedRef.current = true;
      setNotice(`The ${recordingLimitMinutes}-minute limit was reached. Saving the recording…`);
      void toggleVoiceRef.current();
    }
  }, [recording?.state, recording?.elapsedMs, recordingLimitMinutes]);

  const closePenSettings = () => {
    setPenHudOpen(false);
    if (
      penSettings.color !== penColor ||
      penSettings.nib !== penNib ||
      penSettings.profiles !== penNibProfiles ||
      Math.abs(penSettings.width - penWidth) > 0.001 ||
      Math.abs(penSettings.opacity - penOpacity) > 0.001
    ) {
      void commit({
        type: "settings-update",
        settings: {
          penColor: penSettings.color,
          penNib: penSettings.nib ?? "pen",
          ...(penSettings.profiles ? { penNibProfiles: penSettings.profiles } : {}),
          penWidth: penSettings.width,
          penOpacity: penSettings.opacity,
          fingerDrawingEnabled: penSettings.fingerDrawing !== false,
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
        <div aria-label="View and arrange tools" className="tool-hud" role="group">
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
          <Eye aria-hidden="true" />
          <span>View</span>
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
        </div>
        <div aria-label="Drawing tools" className="tool-hud" role="group">
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
        </div>
        <div aria-label="Media tools" className="tool-hud content-tool-hud" role="group">
          <button
          aria-label={photoCount >= MAX_PHOTOS_PER_PAGE ? "Photo limit reached" : "Photo"}
          className="tool"
          disabled={photoCount >= MAX_PHOTOS_PER_PAGE}
          onClick={() => photoInputRef.current?.click()}
          type="button"
        >
          <ImagePlus aria-hidden="true" />
          <span>Photo</span>
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
        </div>
        <div aria-label="Text and voice tools" className="tool-hud text-voice-tool-hud" role="group">
          <button className="tool" onClick={() => {
            setTextDraft(EMPTY_TEXT_DRAFT);
            textSelectionRef.current = { start: 0, end: 0 };
            setTextStatus(undefined);
            void openTextComposerAboveSketch();
          }} type="button">
            <Type aria-hidden="true" />
            <span>Text</span>
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
          <span>{recording?.state === "recording" ? "Stop recording" : "Voice"}</span>
          {recording?.state === "recording" ? (
            <small>{Math.floor(recording.elapsedMs / 60_000)}:{String(Math.floor(recording.elapsedMs / 1_000) % 60).padStart(2, "0")}</small>
          ) : null}
          </button>
        </div>
        <div aria-label="History tools" className="tool-hud" role="group">
          <button
            className="tool"
            disabled={tool !== "pen" && tool !== "eraser" && tool !== "arrange"}
            onClick={undoLastAction}
            type="button"
          >
            <Undo2 aria-hidden="true" />
            <span>Undo</span>
          </button>
          <button
            className="tool"
            disabled={tool !== "pen" && tool !== "eraser"}
            onClick={redoDrawing}
            type="button"
          >
            <Redo2 aria-hidden="true" />
            <span>Redo</span>
          </button>
        </div>
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
            grid={drawingGrid}
            onChange={setPenSettings}
            onDone={closePenSettings}
            onGridChange={(grid) => {
              void commit({
                type: "page-drawing-grid-update",
                pageId: page.id,
                grid,
              });
            }}
            settings={penSettings}
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
        }${tool === "arrange" ? " arranging" : ""}`}
        onClick={(event) => {
          if (!placingTextId || !(event.target instanceof Element)) return;
          const clickedObject = event.target.closest<HTMLElement>("[data-object-id]");
          if (clickedObject?.dataset.objectId === placingTextId) return;
          finishTextPlacement();
        }}
        ref={paperRef}
      >
        <SketchSurface
          capabilities={
            overlayRequested || tool === "arrange" || tool === "view"
              ? {
                  kind: "readonly",
                  tools: [],
                  fingerDrawing: false,
                  pressure: false,
                }
              : {
                  kind: "ipad",
                  tools: ["pen", "eraser"],
                  fingerDrawing: penSettings.fingerDrawing !== false,
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
          penNib={penSettings.nib ?? "pen"}
          penOpacity={penSettings.opacity}
          penWidth={penSettings.width}
          grid={drawingGrid}
          ref={sketchRef}
          repository={sketchRepository}
          tool={tool === "eraser" ? "eraser" : "pen"}
        />
        {overlayActive ? null : (
          <NativeSketchPreview
            contentInsetTop={sketchPreviewInsetTop}
            documentId={page.drawingDocumentId}
          />
        )}

        <header className="page-date" ref={pageHeaderRef}>
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
              onOpen={onRefreshEntryDates}
              onOpenChange={setCalendarOpen}
              onSelectDate={onSelectDate}
              selectedDate={context.date}
            />
          ) : null}
          <p>{heading}</p>
          {context.kind === "diary" &&
          context.date === localDateKey(new Date()) ? (
            <span className="today-diary-entry">TODAY</span>
          ) : null}
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
            onClick={() => void (async () => {
              const adding = !context.favourite;
              const saved = await commit({
                type: "favourite-set",
                targetType:
                  context.kind === "diary" ? "journal-day" : "page",
                targetId:
                  context.kind === "diary"
                    ? context.journalDayId
                    : page.id,
                favourite: adding,
              });
              if (saved) setFavouriteConfirmation(adding ? "Added to Your Favourites" : "Removed from Your Favourites");
            })()}
            type="button"
          >
            <ThumbsUp
              aria-hidden="true"
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
                  layer={object.layer ?? "above-sketch"}
                  objectLabel="text block"
                  objectId={object.id}
                  onCommit={(change) =>
                    commitLayoutChange(object.id, change)
                  }
                  onDelete={() => deletePageObject(object)}
                  onSelect={() => setSelectedObjectId(object.id)}
                  onToggleLayer={() => toggleObjectLayer(object)}
                  pageRef={paperRef}
                  position={object.position}
                  selected={selectedObjectId === object.id}
                  showShortcuts={false}
                >
                  <AudioCard
                    disabled={tool === "arrange"}
                    audio={audio}
                    onRetryTranscription={(object.transcriptionStatus === "failed" ||
                      object.transcriptionStatus === "pending") && !transcript
                      ? () => void transcribeVoice(object)
                      : undefined}
                    recording={object}
                  />
                  {transcript ? (
                    <TranscriptEditor
                      assetUri={object.asset.localUri}
                      audio={audio}
                      onSave={updateObject}
                      onSuggestMyWord={(text) => {
                        const existing = myWords.find((word) => word.text.toLocaleLowerCase() === text.toLocaleLowerCase());
                        void commit({
                          type: "settings-update",
                          settings: { myWords: existing
                            ? myWords.map((word) => word.id === existing.id
                              ? { ...word, enabled: true, correctionCount: word.correctionCount + 1 }
                              : word)
                            : [...myWords, { id: createId(), text, enabled: true, correctionCount: 1 }] },
                        });
                        setNotice(`“${text}” was added to My Words.`);
                      }}
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
                  layer={object.layer ?? "above-sketch"}
                  objectLabel="image"
                  objectId={object.id}
                  onCommit={(change) =>
                    commitLayoutChange(object.id, change)
                  }
                  onDelete={() => deletePageObject(object)}
                  onSelect={() => setSelectedObjectId(object.id)}
                  onToggleLayer={() => toggleObjectLayer(object)}
                  pageRef={paperRef}
                  position={object.position}
                  selected={selectedObjectId === object.id}
                  showShortcuts={false}
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
                  layer={object.layer ?? "above-sketch"}
                  objectLabel="text block"
                  objectId={object.id}
                  onCommit={(change) =>
                    commitLayoutChange(object.id, change)
                  }
                  onDelete={() => deletePageObject(object)}
                  onSelect={() => setSelectedObjectId(object.id)}
                  onToggleLayer={() => toggleObjectLayer(object)}
                  pageRef={paperRef}
                  position={object.position}
                  selected={selectedObjectId === object.id}
                  showShortcuts={false}
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
                  layer={object.layer ?? "above-sketch"}
                  objectLabel="text block"
                  objectId={object.id}
                  onCommit={(change) =>
                    commitLayoutChange(object.id, change)
                  }
                  onDelete={() => deletePageObject(object)}
                  onSelect={() => setSelectedObjectId(object.id)}
                  onToggleLayer={() => toggleObjectLayer(object)}
                  pageRef={paperRef}
                  position={object.position}
                  selected={selectedObjectId === object.id}
                  showShortcuts={false}
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

        {textComposerOpen ? (
          <TextComposer draft={textDraft} recording={textRecording?.state === "recording"} selectionRef={textSelectionRef} status={textStatus} onCancel={() => { setTextComposerOpen(false); setTextDraft(EMPTY_TEXT_DRAFT); textSelectionRef.current = { start: 0, end: 0 }; setTextStatus(undefined); }} onChange={setTextDraft} onSubmit={() => void addText()} onToggleVoice={() => void toggleTextVoice()} />
        ) : null}

        <FavouriteConfirmation message={favouriteConfirmation} onDone={() => setFavouriteConfirmation(undefined)} />

        {notice ? (
          <button
            className="notice"
            onClick={() => setNotice(undefined)}
            type="button"
          >
            {notice}
          </button>
        ) : null}

        {health.localDurability === "saving" || health.localDurability === "error" ? (
          <div aria-live="polite" className={`save-status ${health.localDurability}`}>
            {health.localDurability === "saving"
              ? "Saving on this device…"
              : "Could not save on this device"}
          </div>
        ) : null}
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
        collectionType={context.kind === "diary" ? "journal" : "sketchbook"}
        displayName={displayName}
        onAddPage={onAddPage}
        onDeletePage={onDeletePage}
        onReorderPages={onReorderPages}
        onSelectPage={onSelectPage}
        pages={pages}
      />
    </section>
  );
}
