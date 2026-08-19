import {
  ArrowLeftRight,
  Eraser,
  Eye,
  ImagePlus,
  Link as LinkIcon,
  Mail,
  Mic,
  Move,
  PenLine,
  Redo2,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type {
  DocumentOperationInput,
  MyStoryLink,
  MyStoryPage,
  MyStoryPhoto,
  MyStoryTextBlock,
  MyStoryVoiceRecording,
  MyWord,
  Position,
  SaveHealth,
  ShapeKind,
  ShapeObject,
} from "../domain/models";
import { useNativeDrawingOverlay } from "../hooks/useNativeDrawingOverlay";
import { displayAssetUri } from "../utils/displayAssetUri";
import {
  hasNativePencilKit,
  NATIVE_DRAWING_TAPPED_EVENT,
  redoNativeDrawingOverlay,
  undoNativeDrawingOverlay,
} from "../native/pencilKit";
import {
  hasNativeTextEditor,
  openNativeTextEditor,
} from "../native/textEditor";
import type {
  AppleTranscriptionPlugin,
  JournalAudioPlugin,
  JournalFilesPlugin,
  NativeSharePlugin,
  RecordingSnapshot,
} from "../native/contracts";
import {
  finalizeStoppedRecording,
  recordingStorageAvailable,
} from "../native/durableAudio";
import type { BrowserSketchRepository } from "../repository/browserSketchRepository";
import {
  SketchSurface,
  type SketchSurfaceHandle,
} from "../sketch/SketchSurface";
import { NativeSketchPreview } from "../sketch/NativeSketchPreview";
import { browserFileToAsset, readImageSize } from "../utils/assets";
import { readableTextColour } from "../utils/colour";
import { createId } from "../utils/id";
import { openExternalUrl } from "../utils/openExternalUrl";
import type { PageTool } from "./JournalPage";
import {
  ArrangeablePageObject,
  type LayoutChange,
} from "./ArrangeablePageObject";
import { AudioCard } from "./AudioCard";
import { clampPosition, defaultObjectFrame, VOICE_FRAME } from "./arrangeGeometry";
import { ShapeCard } from "./ShapeCard";
import { PolygonDraftEditor } from "./PolygonDraftEditor";
import { ConfirmDialog } from "./ConfirmDialog";
import { DiaryPageStrip } from "./DiaryPageStrip";
import { LinkComposer } from "./LinkComposer";
import {
  MyStoryInspector,
  type MyStorySelection,
} from "./MyStoryInspector";
import { PenSettingsHud, type PenSettings } from "./PenSettingsHud";
import {
  controlShareRect,
  pageShareTitle,
  paperShareRect,
  shareFileStem,
  storyShareLinks,
  storyShareRecordings,
  waitForShareCapture,
  withShareTimeout,
} from "./pageShare";
import { ShareChooser } from "./ShareChooser";
import { VoiceRecordingDialog } from "./VoiceRecordingDialog";

type Commit = (operation: DocumentOperationInput) => Promise<boolean>;

function moveId(ids: string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) {
    return ids;
  }
  const next = [...ids];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

function StoryTextContent({
  block,
  color,
}: {
  block: MyStoryTextBlock;
  color: string;
}) {
  const style = { color };
  switch (block.role) {
    case "title":
      return <h1 style={style}>{block.text}</h1>;
    case "heading":
      return <h2 style={style}>{block.text}</h2>;
    case "body":
      return <p style={style}>{block.text}</p>;
    default: {
      const exhaustiveRole: never = block.role;
      throw new Error(`Unsupported story text role: ${exhaustiveRole}`);
    }
  }
}

function StoryTextDialog({
  initialText,
  onCancel,
  onSave,
}: {
  initialText: string;
  onCancel: () => void;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(initialText);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    editorRef.current?.focus();
  }, []);
  return (
    <div className="text-composer-backdrop">
      <section
        aria-labelledby="story-text-editor-title"
        aria-modal="true"
        className="story-text-editor"
        role="dialog"
      >
        <header>
          <h2 id="story-text-editor-title">
            {initialText ? "Edit story text" : "Add story text"}
          </h2>
          <button onClick={onCancel} type="button">Cancel</button>
        </header>
        <textarea
          aria-label="Story text"
          onChange={(event) => setText(event.currentTarget.value)}
          placeholder="Write part of your story…"
          ref={editorRef}
          value={text}
        />
        <button
          className="large-action"
          disabled={!text.trim()}
          onClick={() => onSave(text.trim())}
          type="button"
        >
          Save to My Story
        </button>
      </section>
    </div>
  );
}

export function MyStoryWorkspace({
  audio,
  commit,
  defaultTextColor,
  displayName,
  favouritePenColours,
  files,
  health,
  myWords,
  navigationObscured,
  onAddPage,
  onDeletePage,
  onDrawingHealthChange,
  onReorderPages,
  onSelectPage,
  onToolChange,
  page,
  pages,
  penColor,
  penNib,
  penNibProfiles,
  penOpacity,
  penWidth,
  fingerDrawingEnabled,
  fingerErasingEnabled,
  twoFingerUndoEnabled = true,
  recordingLimitMinutes,
  share,
  sketchRepository,
  textEditorPreference,
  tool,
  transcription,
}: {
  audio: JournalAudioPlugin;
  commit: Commit;
  defaultTextColor: string;
  displayName: string;
  favouritePenColours: string[];
  files: JournalFilesPlugin;
  health: SaveHealth;
  myWords: MyWord[];
  navigationObscured: boolean;
  onAddPage: () => Promise<boolean>;
  onDeletePage: (pageId: string) => Promise<boolean>;
  onDrawingHealthChange: (health: SaveHealth) => void;
  onReorderPages: (pageIds: string[]) => Promise<boolean>;
  onSelectPage: (pageId: string) => void;
  onToolChange: (tool: PageTool) => void;
  page: MyStoryPage;
  pages: MyStoryPage[];
  penColor: string;
  penNib: "pen" | "marker" | "pencil" | "brush";
  penNibProfiles: PenSettings["profiles"];
  penOpacity: number;
  penWidth: number;
  fingerDrawingEnabled: boolean;
  fingerErasingEnabled: boolean;
  twoFingerUndoEnabled?: boolean;
  recordingLimitMinutes: 2 | 5 | 10 | 30 | null;
  share: NativeSharePlugin;
  sketchRepository: BrowserSketchRepository;
  textEditorPreference: "native" | "standard";
  tool: PageTool;
  transcription: AppleTranscriptionPlugin;
}) {
  const sketchRef = useRef<SketchSurfaceHandle>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const toolPaletteRef = useRef<HTMLDivElement>(null);
  const shareToolRef = useRef<HTMLButtonElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const inverseHistoryRef = useRef<DocumentOperationInput[]>([]);
  const textLongPressRef = useRef<
    {
      pointerId: number;
      startX: number;
      startY: number;
      timer: number;
    } | undefined
  >(undefined);
  const suppressTextClickRef = useRef(false);
  const [selection, setSelection] = useState<MyStorySelection>();
  const [textPendingDeletion, setTextPendingDeletion] =
    useState<MyStoryTextBlock>();
  const [selectedRecordingId, setSelectedRecordingId] = useState<string>();
  const [selectedShapeId, setSelectedShapeId] = useState<string>();
  const [polygonDraft, setPolygonDraft] = useState<Position[] | null>(null);
  const [notice, setNotice] = useState<string>();
  const [penHudOpen, setPenHudOpen] = useState(false);
  const [shareChooserOpen, setShareChooserOpen] = useState(false);
  const [shareChooserRequested, setShareChooserRequested] = useState(false);
  const [shareInProgress, setShareInProgress] = useState(false);
  const [shareCapturing, setShareCapturing] = useState(false);
  const [linkComposerRequested, setLinkComposerRequested] = useState(false);
  const [linkEditing, setLinkEditing] = useState<MyStoryLink | null>();
  const [textEditorRequested, setTextEditorRequested] = useState(false);
  const [penSettings, setPenSettings] = useState<PenSettings>({
    color: penColor,
    nib: penNib,
    profiles: penNibProfiles,
    width: penWidth,
    opacity: penOpacity,
    fingerDrawing: fingerDrawingEnabled,
    fingerErasing: fingerErasingEnabled,
    favouriteColours: favouritePenColours,
  });
  const [textEditing, setTextEditing] = useState<MyStoryTextBlock | null>();
  const [splitRatio, setSplitRatio] = useState(page.splitRatio);
  const splitRatioRef = useRef(page.splitRatio);
  const dividerDragOffsetRef = useRef(0);
  const transcriptionInFlightRef = useRef(new Set<string>());
  const [recording, setRecording] = useState<RecordingSnapshot>();
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const autoStopStartedRef = useRef(false);
  const toggleVoiceRef = useRef<() => Promise<void>>(async () => undefined);
  const pageTextColor = readableTextColour(
    page.textColor ?? defaultTextColor,
    page.textBackgroundColor,
  );
  const textSelectionEnabled = tool === "arrange";

  const placeShape = async (shapeKind: Exclude<ShapeKind, "polygon">) => {
    const shape: ShapeObject = { id: createId(), type: "shape", shapeKind, pageId: page.id,
      position: { x: 0.38, y: 0.34 }, frame: { width: 0.24, height: 0.24 }, fillColor: penSettings.color,
      outlineColor: "#3f3528", outlineWidth: 3, layer: "above-sketch", revision: 0, createdAt: new Date().toISOString() };
    if (await commitWithUndo({ type: "my-story-shape-add", pageId: page.id, shape }, { type: "my-story-shape-delete", pageId: page.id, shapeId: shape.id })) {
      setPenHudOpen(false); onToolChange("arrange"); setSelectedShapeId(shape.id); setSelection(undefined); setSelectedRecordingId(undefined);
    }
  };
  const startShapePlacement = (kind: ShapeKind) => {
    if (kind !== "polygon") { void placeShape(kind); return; }
    setPenHudOpen(false); onToolChange("view"); setSelection(undefined); setSelectedRecordingId(undefined); setSelectedShapeId(undefined);
    setPolygonDraft([]); setNotice("Tap at least three points, then choose Finish polygon.");
  };
  const finishPolygon = async () => {
    if (!polygonDraft || polygonDraft.length < 3) return;
    const xs = polygonDraft.map(({ x }) => x); const ys = polygonDraft.map(({ y }) => y);
    const position = { x: Math.min(...xs), y: Math.min(...ys) };
    const frame = { width: Math.max(0.18, Math.max(...xs) - position.x), height: Math.max(0.12, Math.max(...ys) - position.y) };
    const clamped = clampPosition(position, frame);
    const shape: ShapeObject = { id: createId(), type: "shape", shapeKind: "polygon", pageId: page.id, position: clamped, frame,
      points: polygonDraft.map(({ x, y }) => ({ x: (x - clamped.x) / frame.width, y: (y - clamped.y) / frame.height })),
      fillColor: penSettings.color, outlineColor: "#3f3528", outlineWidth: 3, layer: "above-sketch", revision: 0, createdAt: new Date().toISOString() };
    if (await commitWithUndo({ type: "my-story-shape-add", pageId: page.id, shape }, { type: "my-story-shape-delete", pageId: page.id, shapeId: shape.id })) {
      setPolygonDraft(null); setNotice(undefined); onToolChange("arrange"); setSelectedShapeId(shape.id);
    }
  };

  useEffect(() => {
    let active = true;
    void audio
      .recoverInterrupted()
      .then(({ recordings }) => {
        const recovered = recordings[0];
        if (active && recovered) {
          setRecording(recovered);
          setNotice(
            "An unfinished voice recording was recovered. Tap Voice to finalize and save it.",
          );
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [audio]);

  useEffect(() => {
    if (recording?.state !== "recording") return;
    const timer = window.setInterval(() => {
      void audio.status().then(setRecording).catch(() => undefined);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [audio, recording?.state]);

  useEffect(() => {
    if (tool !== "pen" && tool !== "eraser") return;
    const targetAtPoint = (
      event: Event,
      selector: string,
    ): HTMLElement | undefined => {
      const { detail } = event as CustomEvent<{
        documentId: string;
        x: number;
        y: number;
      }>;
      if (detail.documentId !== page.drawingDocumentId) return undefined;
      return Array.from(
        paperRef.current?.querySelectorAll<HTMLElement>(selector) ?? [],
      ).find((element) => {
        const rect = element.getBoundingClientRect();
        return (
          detail.x >= rect.left &&
          detail.x <= rect.right &&
          detail.y >= rect.top &&
          detail.y <= rect.bottom
        );
      });
    };
    const selectTappedCanvasItem = (event: Event) => {
      const target = targetAtPoint(
        event,
        "[data-story-link-id], [data-recording-id]",
      );
      target?.click();
    };
    globalThis.addEventListener(
      NATIVE_DRAWING_TAPPED_EVENT,
      selectTappedCanvasItem,
    );
    return () => {
      globalThis.removeEventListener(
        NATIVE_DRAWING_TAPPED_EVENT,
        selectTappedCanvasItem,
      );
    };
  }, [page.drawingDocumentId, tool]);

  const overlayEnabled =
    !navigationObscured &&
    !penHudOpen &&
    !shareChooserOpen &&
    !shareChooserRequested &&
    !shareInProgress &&
    !linkComposerRequested &&
    linkEditing === undefined &&
    !textEditorRequested &&
    textEditing === undefined &&
    polygonDraft === null &&
    !voiceDialogOpen;
  const { overlayActive, overlayReady, suspendOverlay } =
    useNativeDrawingOverlay({
      documentId: page.drawingDocumentId,
      enabled: overlayEnabled,
      tool,
      color: penSettings.color,
      nib: penSettings.nib,
      width: penSettings.width,
      opacity: penSettings.opacity,
    fingerDrawing: tool === "eraser"
      ? penSettings.fingerErasing === true
      : penSettings.fingerDrawing !== false,
      twoFingerUndo: twoFingerUndoEnabled,
      paperRef,
      protectedHeaderRef: headerRef,
      toolPaletteRef,
      sketchRepository,
      onError: setNotice,
    });

  const commitWithUndo = async (
    operation: DocumentOperationInput,
    inverse: DocumentOperationInput,
  ) => {
    const saved = await commit(operation);
    if (saved) {
      inverseHistoryRef.current.push(inverse);
    }
    return saved;
  };

  const openTextEditor = async (block?: MyStoryTextBlock) => {
    setSelection(undefined);
    setTextEditorRequested(true);
    const hidden = await suspendOverlay();
    if (!hidden) {
      setTextEditorRequested(false);
      setNotice("The drawing is still saving. Try Text again in a moment.");
      return;
    }
    if (textEditorPreference === "native" && hasNativeTextEditor()) {
      try {
        const result = await openNativeTextEditor({
          initialText: block?.text ?? "",
          mode: block ? "edit" : "add",
          contextualStrings: myWords
            .filter((word) => word.enabled)
            .map((word) => word.text)
            .slice(0, 100),
          localeIdentifier: "en-AU",
        });
        if (!result.cancelled && result.text.trim()) {
          await saveText(result.text.trim(), block);
        }
        setTextEditorRequested(false);
        return;
      } catch {
        setNotice("The standard text editor is open instead.");
      }
    }
    setTextEditing(block ?? null);
    setTextEditorRequested(false);
  };

  const cancelTextLongPress = () => {
    const active = textLongPressRef.current;
    if (active) {
      window.clearTimeout(active.timer);
      textLongPressRef.current = undefined;
    }
  };

  const beginTextLongPress = (
    event: ReactPointerEvent<HTMLDivElement>,
    block: MyStoryTextBlock,
  ) => {
    cancelTextLongPress();
    textLongPressRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer: window.setTimeout(() => {
        suppressTextClickRef.current = true;
        textLongPressRef.current = undefined;
        void openTextEditor(block);
      }, 650),
    };
  };

  const updateTextLongPress = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const active = textLongPressRef.current;
    if (
      active?.pointerId === event.pointerId &&
      Math.hypot(
        event.clientX - active.startX,
        event.clientY - active.startY,
      ) > 8
    ) {
      cancelTextLongPress();
    }
  };

  const saveText = async (text: string, block?: MyStoryTextBlock) => {
    if (block) {
      const updated = { ...block, text, revision: block.revision + 1 };
      await commitWithUndo(
        { type: "my-story-text-update", pageId: page.id, block: updated },
        { type: "my-story-text-update", pageId: page.id, block },
      );
    } else {
      const created: MyStoryTextBlock = {
        id: createId(),
        text,
        role: "body",
        color: pageTextColor,
        revision: 0,
        createdAt: new Date().toISOString(),
      };
      await commitWithUndo(
        { type: "my-story-text-add", pageId: page.id, block: created },
        {
          type: "my-story-text-delete",
          pageId: page.id,
          blockId: created.id,
        },
      );
    }
    setTextEditing(undefined);
  };

  const openLinkComposer = async (link?: MyStoryLink) => {
    setSelection(undefined);
    setLinkComposerRequested(true);
    const hidden = await suspendOverlay();
    if (!hidden) {
      setLinkComposerRequested(false);
      setNotice("The drawing is still saving. Try Link again in a moment.");
      return;
    }
    setLinkEditing(link ?? null);
    setLinkComposerRequested(false);
  };

  const saveLink = async (url: string, title: string) => {
    const previous = linkEditing ?? undefined;
    const link: MyStoryLink = previous
      ? { ...previous, url, title, revision: previous.revision + 1 }
      : {
          id: createId(),
          url,
          title,
          revision: 0,
          createdAt: new Date().toISOString(),
        };
    const saved = await commitWithUndo(
      previous
        ? { type: "my-story-link-update", pageId: page.id, link }
        : { type: "my-story-link-add", pageId: page.id, link },
      previous
        ? {
            type: "my-story-link-update",
            pageId: page.id,
            link: previous,
          }
        : {
            type: "my-story-link-delete",
            pageId: page.id,
            linkId: link.id,
          },
    );
    if (saved) {
      setLinkEditing(undefined);
      setNotice(undefined);
    } else {
      setNotice("The link could not be saved. Check the address and try again.");
    }
  };

  const transcribeVoice = async (voice: MyStoryVoiceRecording) => {
    const markStatus = (
      status: MyStoryVoiceRecording["transcriptionStatus"],
      revision: number,
    ) =>
      commit({
        type: "my-story-recording-update",
        pageId: page.id,
        recording: { ...voice, transcriptionStatus: status, revision },
      });

    if (transcriptionInFlightRef.current.has(voice.id)) {
      return;
    }
    transcriptionInFlightRef.current.add(voice.id);
    try {
      const permission = await transcription.requestPermission();
      if (!permission.granted) {
        await markStatus("failed", voice.revision + 1);
        setNotice(
          "Speech permission is off. Your original recording is still saved.",
        );
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
        contextualStrings: myWords
          .filter((word) => word.enabled)
          .map((word) => word.text)
          .slice(0, 100),
      });
      const text = result.rawText.trim();
      if (!text) {
        throw new Error("No speech was recognized.");
      }
      const textSaved = await commit({
        type: "my-story-text-add",
        pageId: page.id,
        block: {
          id: createId(),
          text,
          role: "body",
          color: pageTextColor,
          revision: 0,
          createdAt: new Date().toISOString(),
        },
      });
      if (!textSaved) {
        throw new Error("Story text could not be saved.");
      }
      await markStatus("complete", transcribingRevision + 1);
      setNotice(undefined);
    } catch {
      await markStatus("failed", voice.revision + 2).catch(() => false);
      setNotice(
        "Text could not be generated. Your original recording is still saved.",
      );
    } finally {
      transcriptionInFlightRef.current.delete(voice.id);
    }
  };

  const toggleVoice = async () => {
    if (
      recording?.state === "recording" ||
      recording?.state === "interrupted" ||
      recording?.state === "finalising"
    ) {
      let stopped: RecordingSnapshot;
      try {
        setRecording({ ...recording, state: "finalising" });
        stopped = await finalizeStoppedRecording(audio, files);
        setRecording(stopped);
      } catch {
        setRecording({
          ...recording,
          state: "error",
          message: "The original recording could not be finalized.",
        });
        setNotice(
          "The original recording is recoverable, but it was not added to My Story because finalization failed.",
        );
        return;
      }
      if (!stopped.asset) return;
      const voice: MyStoryVoiceRecording = {
        id: stopped.id,
        asset: stopped.asset,
        durationMs: stopped.elapsedMs,
        transcriptionStatus: "not-requested",
        position: {
          x: 0.06 + (page.recordings.length % 3) * 0.3,
          y: Math.min(0.84, 0.7 + Math.floor(page.recordings.length / 3) * 0.12),
        },
        frame: VOICE_FRAME,
        layer: "above-sketch",
        revision: 0,
        createdAt: new Date().toISOString(),
      };
      const saved = await commit({
        type: "my-story-recording-add",
        pageId: page.id,
        recording: voice,
      });
      setNotice(
        saved
          ? undefined
          : "The finalized recording could not be added to My Story.",
      );
      return;
    }

    try {
      if (!await recordingStorageAvailable(files)) {
        setNotice(
          "Storage is too low to record safely. Free some space and try again.",
        );
        return;
      }
      const started = await audio.start({
        maximumDurationMs:
          recordingLimitMinutes === null
            ? undefined
            : recordingLimitMinutes * 60_000,
      });
      setRecording(started);
      setNotice(
        (audio as { isSimulation?: boolean }).isSimulation === true
          ? "Browser demonstration only. Tap Voice again to stop."
          : "Recording original audio on this device. Tap Voice again to save.",
      );
    } catch {
      setNotice(
        "Microphone recording could not start. Check microphone permission and available storage.",
      );
    }
  };

  const placeReviewedVoice = async (savedRecording: RecordingSnapshot) => {
    if (!savedRecording.asset) return;
    const voice: MyStoryVoiceRecording = {
      id: savedRecording.id,
      asset: savedRecording.asset,
      durationMs: savedRecording.elapsedMs,
      transcriptionStatus: "not-requested",
      position: { x: 0.37, y: 0.3 },
      frame: VOICE_FRAME,
      layer: "above-sketch",
      revision: 0,
      createdAt: new Date().toISOString(),
    };
    const saved = await commit({ type: "my-story-recording-add", pageId: page.id, recording: voice });
    if (!saved) { setNotice("The recording could not be added to My Story."); return; }
    setVoiceDialogOpen(false);
    setRecording(undefined);
    setSelection(undefined);
    setSelectedRecordingId(voice.id);
    onToolChange("arrange");
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
    if (
      recording.elapsedMs >= recordingLimitMinutes * 60_000 &&
      !autoStopStartedRef.current
    ) {
      autoStopStartedRef.current = true;
      setNotice(
        `The ${recordingLimitMinutes}-minute limit was reached. Saving the recording…`,
      );
      void toggleVoiceRef.current();
    }
  }, [recording?.state, recording?.elapsedMs, recordingLimitMinutes]);

  const openShareChooser = async () => {
    if (
      recording?.state === "recording" ||
      recording?.state === "interrupted" ||
      recording?.state === "finalising"
    ) {
      setNotice("Stop recording first, then share.");
      return;
    }
    onToolChange("view");
    setPenHudOpen(false);
    setSelection(undefined);
    setShareChooserRequested(true);
    const hidden = await suspendOverlay();
    setShareChooserRequested(false);
    if (hidden) {
      setShareChooserOpen(true);
    } else {
      setNotice("The drawing is still saving. Try Share again in a moment.");
    }
  };

  const sharePage = async (format: "jpg" | "pdf") => {
    setShareChooserOpen(false);
    setShareInProgress(true);
    setShareCapturing(true);
    setNotice(undefined);
    const hidden = await suspendOverlay();
    if (!hidden) {
      setShareCapturing(false);
      setShareInProgress(false);
      setNotice("The drawing is still saving. Try Share again in a moment.");
      return;
    }
    await waitForShareCapture(paperRef.current);
    const paperRect = paperShareRect(paperRef.current) ?? {
      x: 0,
      y: 0,
      width: Math.max(window.innerWidth, 8),
      height: Math.max(window.innerHeight, 8),
    };
    const pageNumber =
      pages.findIndex((candidate) => candidate.id === page.id) + 1;
    const title = pageShareTitle({
      displayName,
      context: { kind: "story", pageNumber },
    });
    const recordings = storyShareRecordings(page);
    try {
      const exported = await withShareTimeout(
        share.exportPage({
          format,
          title,
          fileStem: shareFileStem(title),
          paperRect,
          captureMode: "webview",
          links: format === "pdf" ? storyShareLinks(page, paperRef.current) : [],
        }),
      );
      setShareCapturing(false);
      const result = await withShareTimeout(
        share.share({
          title,
          text: title,
          fileUris: [exported.fileUri, ...recordings.audioUris],
          sourceRect: controlShareRect(shareToolRef.current),
        }),
        120_000,
      );
      if (result.completed && result.activityType) {
        setNotice("Ready to send");
      } else if (!result.completed) {
        setNotice("Share cancelled.");
      } else {
        setNotice(undefined);
      }
    } catch {
      setNotice("This page could not be shared. Try again.");
    } finally {
      setShareCapturing(false);
      setShareInProgress(false);
    }
  };

  const openPhotoPicker = async () => {
    onToolChange("view");
    setSelection(undefined);
    if (await suspendOverlay()) {
      photoInputRef.current?.click();
    } else {
      setNotice("The drawing is still saving. Try Image again in a moment.");
    }
  };

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const [asset, size] = await Promise.all([
        browserFileToAsset(file),
        readImageSize(file),
      ]);
      const photo: MyStoryPhoto = {
        id: createId(),
        asset,
        size,
        altText: file.name,
        width: 1,
        revision: 0,
        createdAt: new Date().toISOString(),
      };
      await commitWithUndo(
        { type: "my-story-photo-add", pageId: page.id, photo },
        {
          type: "my-story-photo-delete",
          pageId: page.id,
          photoId: photo.id,
        },
      );
    } catch {
      setNotice("That image could not be added.");
    }
  };

  const undo = async () => {
    if (tool === "pen" || tool === "eraser") {
      if (hasNativePencilKit()) {
        await undoNativeDrawingOverlay();
      } else {
        sketchRef.current?.undo();
      }
      return;
    }
    const inverse = inverseHistoryRef.current.pop();
    if (inverse) {
      await commit(inverse);
    }
  };

  const redo = async () => {
    if (hasNativePencilKit()) {
      await redoNativeDrawingOverlay();
    } else {
      sketchRef.current?.redo();
    }
  };

  const closePenSettings = () => {
    setPenHudOpen(false);
    if (
      penSettings.color !== penColor ||
      penSettings.nib !== penNib ||
      penSettings.profiles !== penNibProfiles ||
      penSettings.favouriteColours !== favouritePenColours ||
      Math.abs(penSettings.width - penWidth) > 0.001 ||
      Math.abs(penSettings.opacity - penOpacity) > 0.001 ||
      penSettings.fingerDrawing !== fingerDrawingEnabled
      || penSettings.fingerErasing !== fingerErasingEnabled
    ) {
      void commit({
        type: "settings-update",
        settings: {
          penColor: penSettings.color,
          penNib: penSettings.nib ?? "pen",
          ...(penSettings.profiles
            ? { penNibProfiles: penSettings.profiles }
            : {}),
          ...(penSettings.favouriteColours
            ? { favouritePenColours: [...penSettings.favouriteColours] }
            : {}),
          penWidth: penSettings.width,
          penOpacity: penSettings.opacity,
          fingerDrawingEnabled: penSettings.fingerDrawing !== false,
          fingerErasingEnabled: penSettings.fingerErasing === true,
        },
      });
    }
  };

  const beginDividerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (tool !== "arrange") return;
    event.preventDefault();
    const dividerBounds =
      event.currentTarget.parentElement?.getBoundingClientRect();
    dividerDragOffsetRef.current = dividerBounds
      ? event.clientX - (dividerBounds.left + dividerBounds.width / 2)
      : 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateDivider = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (
      tool !== "arrange" ||
      !event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      return;
    }
    const bounds = paperRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const dividerX = event.clientX - dividerDragOffsetRef.current;
    const dividerRatio = Math.min(
      0.7,
      Math.max(0.3, (dividerX - bounds.left) / bounds.width),
    );
    const next =
      page.textSide === "left" ? dividerRatio : 1 - dividerRatio;
    splitRatioRef.current = next;
    setSplitRatio(next);
  };

  const finishDivider = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dividerDragOffsetRef.current = 0;
    const next = splitRatioRef.current;
    if (Math.abs(next - page.splitRatio) < 0.001) return;
    void commitWithUndo(
      { type: "my-story-layout-update", pageId: page.id, splitRatio: next },
      {
        type: "my-story-layout-update",
        pageId: page.id,
        splitRatio: page.splitRatio,
      },
    );
  };

  const flipTextSide = () => {
    const textSide = page.textSide === "left" ? "right" : "left";
    void commitWithUndo(
      { type: "my-story-layout-update", pageId: page.id, textSide },
      {
        type: "my-story-layout-update",
        pageId: page.id,
        textSide: page.textSide,
      },
    );
  };

  const updateSelectedText = (
    update: (block: MyStoryTextBlock) => MyStoryTextBlock,
  ) => {
    if (selection?.kind !== "text") return;
    const previous = selection.block;
    const next = update(previous);
    void commitWithUndo(
      { type: "my-story-text-update", pageId: page.id, block: next },
      { type: "my-story-text-update", pageId: page.id, block: previous },
    );
    setSelection({ ...selection, block: next });
  };

  const deleteStoryText = (block: MyStoryTextBlock) => {
    void commitWithUndo(
      {
        type: "my-story-text-delete",
        pageId: page.id,
        blockId: block.id,
      },
      {
        type: "my-story-text-add",
        pageId: page.id,
        block,
      },
    );
    setTextPendingDeletion(undefined);
    setSelection(undefined);
  };

  const updatePageTextColor = (requestedColor: string) => {
    const color = readableTextColour(requestedColor, page.textBackgroundColor);
    void commitWithUndo(
      { type: "my-story-layout-update", pageId: page.id, textColor: color },
      {
        type: "my-story-layout-update",
        pageId: page.id,
        textColor: pageTextColor,
      },
    );
    if (selection?.kind === "text") {
      setSelection({
        ...selection,
        block: { ...selection.block, color },
      });
    }
  };

  const updateTextBackground = (textBackgroundColor: string) => {
    const adjustedTextColor = readableTextColour(
      pageTextColor,
      textBackgroundColor,
    );
    const textColorChanged = adjustedTextColor !== pageTextColor;
    void commitWithUndo(
      {
        type: "my-story-layout-update",
        pageId: page.id,
        textBackgroundColor,
        ...(textColorChanged ? { textColor: adjustedTextColor } : {}),
      },
      {
        type: "my-story-layout-update",
        pageId: page.id,
        textBackgroundColor: page.textBackgroundColor,
        ...(textColorChanged ? { textColor: pageTextColor } : {}),
      },
    );
    if (textColorChanged && selection?.kind === "text") {
      setSelection({
        ...selection,
        block: { ...selection.block, color: adjustedTextColor },
      });
    }
  };

  const updateSelectedPhoto = (
    update: (photo: MyStoryPhoto) => MyStoryPhoto,
  ) => {
    if (selection?.kind !== "photo") return;
    const previous = selection.photo;
    const next = update(previous);
    void commitWithUndo(
      { type: "my-story-photo-update", pageId: page.id, photo: next },
      { type: "my-story-photo-update", pageId: page.id, photo: previous },
    );
    setSelection({ ...selection, photo: next });
  };

  const updateRecordingLayout = (
    recording: MyStoryVoiceRecording,
    change: LayoutChange,
  ) => {
    const updated = {
      ...recording,
      position: change.after.position,
      frame: change.after.frame,
      revision: recording.revision + 1,
    };
    void commitWithUndo(
      {
        type: "my-story-recording-update",
        pageId: page.id,
        recording: updated,
      },
      {
        type: "my-story-recording-update",
        pageId: page.id,
        recording,
      },
    );
  };

  const toggleRecordingLayer = (recording: MyStoryVoiceRecording) => {
    const updated = {
      ...recording,
      layer:
        recording.layer === "behind-sketch"
          ? ("above-sketch" as const)
          : ("behind-sketch" as const),
      revision: recording.revision + 1,
    };
    void commitWithUndo(
      {
        type: "my-story-recording-update",
        pageId: page.id,
        recording: updated,
      },
      {
        type: "my-story-recording-update",
        pageId: page.id,
        recording,
      },
    );
  };

  const deleteRecording = (recording: MyStoryVoiceRecording) => {
    setSelectedRecordingId(undefined);
    void commitWithUndo(
      {
        type: "my-story-recording-delete",
        pageId: page.id,
        recordingId: recording.id,
      },
      {
        type: "my-story-recording-add",
        pageId: page.id,
        recording,
      },
    ).then((saved) => {
      if (saved) {
        void files.removeToTrash({ assetId: recording.asset.id });
      }
    });
  };

  const moveSelection = (direction: -1 | 1) => {
    if (selection?.kind === "text") {
      const previous = page.textBlocks.map((block) => block.id);
      const next = moveId(previous, selection.block.id, direction);
      void commitWithUndo(
        { type: "my-story-texts-reorder", pageId: page.id, blockIds: next },
        {
          type: "my-story-texts-reorder",
          pageId: page.id,
          blockIds: previous,
        },
      );
      setSelection({
        ...selection,
        index: Math.max(0, Math.min(selection.count - 1, selection.index + direction)),
      });
    } else if (selection?.kind === "photo") {
      const previous = page.photos.map((photo) => photo.id);
      const next = moveId(previous, selection.photo.id, direction);
      void commitWithUndo(
        { type: "my-story-photos-reorder", pageId: page.id, photoIds: next },
        {
          type: "my-story-photos-reorder",
          pageId: page.id,
          photoIds: previous,
        },
      );
      setSelection({
        ...selection,
        index: Math.max(0, Math.min(selection.count - 1, selection.index + direction)),
      });
    } else if (selection?.kind === "link") {
      const previous = page.links.map((link) => link.id);
      const next = moveId(previous, selection.link.id, direction);
      void commitWithUndo(
        { type: "my-story-links-reorder", pageId: page.id, linkIds: next },
        {
          type: "my-story-links-reorder",
          pageId: page.id,
          linkIds: previous,
        },
      );
      setSelection({
        ...selection,
        index: Math.max(0, Math.min(selection.count - 1, selection.index + direction)),
      });
    }
  };

  return (
    <section
      aria-label="My Story"
      className={`journal-workspace my-story-workspace${
        shareCapturing ? " share-capturing" : ""
      }`}
    >
      <div
        aria-label="My Story tools"
        className="tool-palette"
        ref={toolPaletteRef}
      >
        <div aria-label="View and edit tools" className="tool-hud" role="group">
          <button
            aria-pressed={tool === "view"}
            className={tool === "view" ? "tool selected" : "tool"}
            onClick={() => {
              onToolChange("view");
              setPenHudOpen(false);
              setSelection(undefined);
              setSelectedRecordingId(undefined);
            }}
            type="button"
          >
            <Eye aria-hidden="true" />
            <span>View</span>
          </button>
          <button
            aria-pressed={tool === "arrange"}
            className={tool === "arrange" ? "tool selected" : "tool"}
            onClick={() => {
              onToolChange("arrange");
              setPenHudOpen(false);
            }}
            type="button"
          >
            <Move aria-hidden="true" />
            <span>Edit</span>
          </button>
        </div>
        <div aria-label="Story content tools" className="tool-hud" role="group">
          <button
            className="tool"
            onClick={() => void openPhotoPicker()}
            type="button"
          >
            <ImagePlus aria-hidden="true" />
            <span>Image</span>
          </button>
          <button
            className="tool"
            onClick={() => void openLinkComposer()}
            type="button"
          >
            <LinkIcon aria-hidden="true" />
            <span>Link</span>
          </button>
          <button
            className="tool"
            onClick={() => void openTextEditor()}
            type="button"
          >
            <Type aria-hidden="true" />
            <span>Text</span>
          </button>
          <button
            aria-expanded={voiceDialogOpen}
            aria-haspopup="dialog"
            className="tool voice-tool"
            onClick={() => setVoiceDialogOpen(true)}
            type="button"
          >
            <Mic aria-hidden="true" />
            <span>Voice</span>
          </button>
        </div>
        <div aria-label="Drawing tools" className="tool-hud" role="group">
          <button
            aria-pressed={tool === "pen"}
            aria-expanded={tool === "pen" ? penHudOpen : undefined}
            className={tool === "pen" ? "tool selected" : "tool"}
            onClick={() => {
              if (tool === "pen") {
                setPenHudOpen(true);
                return;
              }
              onToolChange("pen");
              setSelectedRecordingId(undefined);
              setSelection(undefined);
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
              if (tool === "eraser") {
                setPenHudOpen(true);
                return;
              }
              onToolChange("eraser");
              setPenHudOpen(false);
              setSelectedRecordingId(undefined);
              setSelection(undefined);
            }}
            type="button"
          >
            <Eraser aria-hidden="true" />
            <span>Erase</span>
          </button>
        </div>
        <div aria-label="History tools" className="tool-hud" role="group">
          <button
            className="tool"
            disabled={tool === "view"}
            onClick={() => void undo()}
            type="button"
          >
            <Undo2 aria-hidden="true" />
            <span>Undo</span>
          </button>
          <button
            className="tool"
            disabled={tool !== "pen" && tool !== "eraser"}
            onClick={() => void redo()}
            type="button"
          >
            <Redo2 aria-hidden="true" />
            <span>Redo</span>
          </button>
        </div>
        <div aria-label="Share tool" className="tool-hud" role="group">
          <button
            aria-label="Share this page"
            className="tool"
            disabled={shareInProgress}
            onClick={() => void openShareChooser()}
            ref={shareToolRef}
            type="button"
          >
            <Mail aria-hidden="true" />
            <span>Share</span>
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
            onChange={setPenSettings}
            onDone={closePenSettings}
            onShapeSelect={startShapePlacement}
            settings={penSettings}
            tool={tool === "eraser" ? "eraser" : "pen"}
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

      <header className="page-date story-page-header" ref={headerRef}>
        <p>My Story</p>
        <span>PAGE {pages.findIndex((candidate) => candidate.id === page.id) + 1}</span>
      </header>

      <div
        className={`paper-page my-story-paper${
          tool === "pen" || tool === "eraser" ? " drawing-active" : ""
        }${tool === "arrange" ? " arranging" : ""}`}
        data-text-side={page.textSide}
        onClick={(event) => {
          if (!polygonDraft || !(event.target instanceof Element) || event.target.closest("button")) return;
          const bounds = paperRef.current?.getBoundingClientRect();
          if (bounds) setPolygonDraft([...polygonDraft, {
            x: Math.min(0.96, Math.max(0.04, (event.clientX - bounds.left) / bounds.width)),
            y: Math.min(0.96, Math.max(0.04, (event.clientY - bounds.top) / bounds.height)),
          }]);
        }}
        ref={paperRef}
        style={{
          gridTemplateColumns:
            page.textSide === "left"
              ? `${splitRatio * 100}% ${
                  tool === "arrange" ? "10px" : "0px"
                } minmax(0, 1fr)`
              : `${(1 - splitRatio) * 100}% ${
                  tool === "arrange" ? "10px" : "0px"
                } minmax(0, 1fr)`,
        }}
      >
        <SketchSurface
          capabilities={
            overlayReady || tool === "arrange" || tool === "view"
              ? {
                  kind: "readonly",
                  tools: [],
                  fingerDrawing: false,
                  pressure: false,
                }
              : {
                  kind: "ipad",
                  tools: ["pen", "eraser"],
                  fingerDrawing: tool === "eraser"
                    ? penSettings.fingerErasing === true
                    : penSettings.fingerDrawing !== false,
                  pressure: true,
                }
          }
          documentId={page.drawingDocumentId}
          onError={(error) => setNotice(error.message)}
          onSaveHealthChange={onDrawingHealthChange}
          penColor={penSettings.color}
          penNib={penSettings.nib ?? "pen"}
          penOpacity={penSettings.opacity}
          penWidth={penSettings.width}
          ref={sketchRef}
          repository={sketchRepository}
          tool={tool === "eraser" ? "eraser" : "pen"}
        />
        {overlayActive ? null : (
          <NativeSketchPreview documentId={page.drawingDocumentId} />
        )}
        {polygonDraft ? <PolygonDraftEditor color={penSettings.color} onCancel={() => { setPolygonDraft(null); setNotice(undefined); onToolChange("pen"); }} onChange={setPolygonDraft} onFinish={() => void finishPolygon()} pageRef={paperRef} points={polygonDraft} /> : null}

        <section
          aria-label="Story text"
          className="my-story-text-pane"
          style={{
            gridColumn: page.textSide === "left" ? 1 : 3,
            gridRow: 1,
          }}
        >
          <div
            aria-hidden="true"
            className="story-text-background"
            style={{ backgroundColor: page.textBackgroundColor }}
          />
          {tool === "arrange" ? (
            <button
              className="story-pane-options"
              onClick={() => setSelection({ kind: "pane" })}
              type="button"
            >
              Background colour
            </button>
          ) : null}
          {page.textBlocks.length === 0 && tool === "arrange" ? (
            <button
              className="story-empty-action"
              onClick={(event) => {
                event.stopPropagation();
                void openTextEditor();
              }}
              type="button"
            >
              <Type aria-hidden="true" />
              Add your first words
            </button>
          ) : (
            page.textBlocks.map((block, index) =>
              textSelectionEnabled ? (
                <div
                  className={
                    selection?.kind === "text" &&
                    selection.block.id === block.id
                      ? "story-text-block selected"
                      : "story-text-block"
                  }
                  data-story-text-id={block.id}
                  key={block.id}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelection({
                        kind: "text",
                        block,
                        index,
                        count: page.textBlocks.length,
                      });
                    }
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (suppressTextClickRef.current) {
                      suppressTextClickRef.current = false;
                      return;
                    }
                    setSelection({
                      kind: "text",
                      block,
                      index,
                      count: page.textBlocks.length,
                    });
                  }}
                  onDoubleClick={() => {
                    cancelTextLongPress();
                    void openTextEditor(block);
                  }}
                  onPointerCancel={cancelTextLongPress}
                  onPointerDown={(event) =>
                    beginTextLongPress(event, block)
                  }
                  onPointerLeave={cancelTextLongPress}
                  onPointerMove={updateTextLongPress}
                  onPointerUp={cancelTextLongPress}
                  role="button"
                  tabIndex={0}
                >
                  <StoryTextContent block={block} color={pageTextColor} />
                </div>
              ) : (
                <div className="story-text-block" key={block.id}>
                  <StoryTextContent block={block} color={pageTextColor} />
                </div>
              ),
            )
          )}
          {page.links.map((link, index) => (
            <button
              className={
                selection?.kind === "link" && selection.link.id === link.id
                  ? "story-link selected"
                  : "story-link"
              }
              data-story-link-id={link.id}
              key={link.id}
              onClick={(event) => {
                event.stopPropagation();
                if (tool === "arrange") {
                  setSelection({
                    kind: "link",
                    link,
                    index,
                    count: page.links.length,
                  });
                } else {
                  openExternalUrl(link.url);
                }
              }}
              type="button"
            >
              <LinkIcon aria-hidden="true" />
              <span>{link.title}</span>
              <small>{new URL(link.url).hostname}</small>
            </button>
          ))}
        </section>

        {tool === "arrange" ? (
          <div className="story-divider">
            <button
              aria-label="Resize text and image sides"
              className="story-divider-resize"
              onLostPointerCapture={finishDivider}
              onPointerCancel={finishDivider}
              onPointerDown={beginDividerDrag}
              onPointerMove={updateDivider}
              onPointerUp={finishDivider}
              type="button"
            />
            <button
              aria-label={
                page.textSide === "left"
                  ? "Move Story text to the right"
                  : "Move Story text to the left"
              }
              className="story-divider-flip"
              onClick={flipTextSide}
              type="button"
            >
              <ArrowLeftRight aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <section
          aria-label="Story images"
          className="my-story-image-pane"
          style={{
            gridColumn: page.textSide === "left" ? 3 : 1,
            gridRow: 1,
          }}
        >
          {page.photos.map((photo, index) =>
            tool === "arrange" ? (
              <button
                aria-label={`Select image ${index + 1}`}
                className={
                  selection?.kind === "photo" &&
                  selection.photo.id === photo.id
                    ? "story-photo selected"
                    : "story-photo"
                }
                key={photo.id}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelection({
                    kind: "photo",
                    photo,
                    index,
                    count: page.photos.length,
                  });
                }}
                style={{ width: `${photo.width * 100}%` }}
                type="button"
              >
                <img
                  alt={photo.altText ?? `Story image ${index + 1}`}
                  src={displayAssetUri(photo.asset.localUri)}
                />
              </button>
            ) : (
              <div
                className="story-photo"
                key={photo.id}
                style={{ width: `${photo.width * 100}%` }}
              >
                <img
                  alt={photo.altText ?? `Story image ${index + 1}`}
                  src={displayAssetUri(photo.asset.localUri)}
                />
              </div>
            ),
          )}
        </section>

        {page.recordings.map((voice, index) => (
          <ArrangeablePageObject
            arrange={tool === "arrange"}
            canResize={false}
            className="page-object voice-object story-voice-object"
            deleteDescription="Voice recording"
            frame={VOICE_FRAME}
            key={voice.id}
            layer={voice.layer ?? "above-sketch"}
            objectLabel="voice recording"
            objectId={voice.id}
            onCommit={(change) => updateRecordingLayout(voice, change)}
            onDelete={() => deleteRecording(voice)}
            onSelect={() => {
              setSelection(undefined);
              setSelectedRecordingId(voice.id);
            }}
            onToggleLayer={() => toggleRecordingLayer(voice)}
            pageRef={paperRef}
            position={
              voice.position ?? {
                x: 0.06 + (index % 3) * 0.3,
                y: Math.min(0.84, 0.7 + Math.floor(index / 3) * 0.12),
              }
            }
            selected={selectedRecordingId === voice.id}
            showShortcuts={false}
          >
            <AudioCard
              audio={audio}
              disabled={tool === "arrange"}
              onConvertToText={() => void transcribeVoice(voice)}
              recording={voice}
            />
          </ArrangeablePageObject>
        ))}

        {(page.shapes ?? []).map((shape, index, shapes) => <ArrangeablePageObject
          arrange={tool === "arrange"} className="page-object shape-object" deleteDescription={`${shape.shapeKind} shape`}
          frame={defaultObjectFrame(shape)} key={shape.id} layer={shape.layer ?? "above-sketch"} objectLabel={`${shape.shapeKind} shape`}
          objectId={shape.id} onCommit={(change) => { const next = change.kind === "move" ? { ...shape, position: change.after.position, revision: shape.revision + 1 } : { ...shape, frame: change.after.frame, revision: shape.revision + 1 }; void commitWithUndo({ type: "my-story-shape-update", pageId: page.id, shape: next }, { type: "my-story-shape-update", pageId: page.id, shape }); }}
          onDelete={() => void commitWithUndo({ type: "my-story-shape-delete", pageId: page.id, shapeId: shape.id }, { type: "my-story-shape-add", pageId: page.id, shape })}
          onMoveBackward={() => { if (index === 0) return; const previous = shapes.map(({ id }) => id); const ids = [...previous]; [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!]; void commitWithUndo({ type: "my-story-shapes-reorder", pageId: page.id, shapeIds: ids }, { type: "my-story-shapes-reorder", pageId: page.id, shapeIds: previous }); }}
          onMoveForward={() => { if (index === shapes.length - 1) return; const previous = shapes.map(({ id }) => id); const ids = [...previous]; [ids[index], ids[index + 1]] = [ids[index + 1]!, ids[index]!]; void commitWithUndo({ type: "my-story-shapes-reorder", pageId: page.id, shapeIds: ids }, { type: "my-story-shapes-reorder", pageId: page.id, shapeIds: previous }); }}
          onSelect={() => { setSelection(undefined); setSelectedRecordingId(undefined); setSelectedShapeId(shape.id); }}
          onToggleLayer={() => { const next = { ...shape, layer: shape.layer === "behind-sketch" ? "above-sketch" as const : "behind-sketch" as const, revision: shape.revision + 1 }; void commitWithUndo({ type: "my-story-shape-update", pageId: page.id, shape: next }, { type: "my-story-shape-update", pageId: page.id, shape }); }}
          pageRef={paperRef} position={shape.position} selected={selectedShapeId === shape.id} showShortcuts={false}
        ><ShapeCard arrange={tool === "arrange"} onUpdate={(next) => void commitWithUndo({ type: "my-story-shape-update", pageId: page.id, shape: next }, { type: "my-story-shape-update", pageId: page.id, shape })} selected={selectedShapeId === shape.id} shape={shape} /></ArrangeablePageObject>)}


        {selection && tool === "arrange" ? (
          <MyStoryInspector
            onClose={() => setSelection(undefined)}
            onDelete={() => {
              if (selection.kind === "text") {
                setTextPendingDeletion(selection.block);
                return;
              } else if (selection.kind === "photo") {
                void commitWithUndo(
                  {
                    type: "my-story-photo-delete",
                    pageId: page.id,
                    photoId: selection.photo.id,
                  },
                  {
                    type: "my-story-photo-add",
                    pageId: page.id,
                    photo: selection.photo,
                  },
                );
              } else if (selection.kind === "link") {
                void commitWithUndo(
                  {
                    type: "my-story-link-delete",
                    pageId: page.id,
                    linkId: selection.link.id,
                  },
                  {
                    type: "my-story-link-add",
                    pageId: page.id,
                    link: selection.link,
                  },
                );
              }
              setSelection(undefined);
            }}
            onEditLink={() => {
              if (selection.kind === "link") {
                void openLinkComposer(selection.link);
              }
            }}
            onMove={moveSelection}
            onPhotoWidthChange={(width) =>
              updateSelectedPhoto((photo) => ({
                ...photo,
                width,
                revision: photo.revision + 1,
              }))
            }
            onTextBackgroundChange={updateTextBackground}
            onTextColorChange={updatePageTextColor}
            onTextRoleChange={(role) =>
              updateSelectedText((block) => ({
                ...block,
                role,
                revision: block.revision + 1,
              }))
            }
            selection={selection}
            textBackgroundColor={page.textBackgroundColor}
            textColor={pageTextColor}
          />
        ) : null}
      </div>

      <DiaryPageStrip
        activePageId={page.id}
        addPageLabel="Add another My Story page"
        arrange={tool === "arrange"}
        collectionLabel={`${displayName} My Story pages`}
        collectionType="story"
        displayName={displayName}
        onAddPage={onAddPage}
        onDeletePage={onDeletePage}
        onReorderPages={onReorderPages}
        onSelectPage={(pageId) => {
          void suspendOverlay().then((hidden) => {
            if (hidden) onSelectPage(pageId);
          });
        }}
        pages={pages}
      />

      <p aria-live="polite" className="save-status">
        {notice ??
          (health.localDurability === "saving"
            ? "Saving My Story…"
            : health.localDurability === "error"
              ? health.message ?? "My Story could not be saved."
              : "My Story is saved ... and so am I")}
      </p>

      {textPendingDeletion ? (
        <ConfirmDialog
          cancelLabel="Keep it"
          confirmClassName="confirm-delete"
          confirmLabel="Delete"
          icon={<Trash2 aria-hidden="true" />}
          onCancel={() => setTextPendingDeletion(undefined)}
          onConfirm={() => deleteStoryText(textPendingDeletion)}
          title="Delete text block?"
        >
          <p>
            Do you want to delete “
            {textPendingDeletion.text.trim() || "Empty text block"}”?
          </p>
        </ConfirmDialog>
      ) : null}

      {textEditing !== undefined ? (
        <StoryTextDialog
          initialText={textEditing?.text ?? ""}
          onCancel={() => setTextEditing(undefined)}
          onSave={(text) => void saveText(text, textEditing ?? undefined)}
        />
      ) : null}

      {linkEditing !== undefined ? (
        <LinkComposer
          initialTitle={linkEditing?.title}
          initialUrl={linkEditing?.url}
          onClose={() => setLinkEditing(undefined)}
          onSave={(url, title) => void saveLink(url, title)}
        />
      ) : null}

      {shareChooserOpen ? (
        <ShareChooser
          hasRecordings={storyShareRecordings(page).hasRecordings}
          onCancel={() => setShareChooserOpen(false)}
          onSharePdf={() => void sharePage("pdf")}
          onSharePicture={() => void sharePage("jpg")}
        />
      ) : null}

      {voiceDialogOpen ? (
        <VoiceRecordingDialog
          audio={audio}
          files={files}
          initialRecording={recording}
          onCancel={() => { setVoiceDialogOpen(false); setRecording(undefined); }}
          onPlace={(reviewed) => void placeReviewedVoice(reviewed)}
          recordingLimitMinutes={recordingLimitMinutes}
        />
      ) : null}
    </section>
  );
}
