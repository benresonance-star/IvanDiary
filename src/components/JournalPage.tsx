import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChevronLeft,
  Eraser,
  Eye,
  ImagePlus,
  Link as LinkIcon,
  Mail,
  Mic,
  Move,
  PenLine,
  Pencil,
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
  PageTextStack,
  PhotoObject,
  Position,
  SaveHealth,
  ShapeKind,
  ShapeObject,
  Sketchbook,
  TextObject,
  TranscriptObject,
  VoiceRecordingObject,
} from "../domain/models";
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
import { transcribeEphemeralRecording } from "../native/ephemeralTranscription";
import { useNativeDrawingOverlay } from "../hooks/useNativeDrawingOverlay";
import {
  hasNativePencilKit,
  redoNativeDrawingOverlay,
  undoNativeDrawingOverlay,
} from "../native/pencilKit";
import {
  hasNativeTextEditor,
  openNativeTextEditor,
} from "../native/textEditor";
import type { BrowserSketchRepository } from "../repository/browserSketchRepository";
import { measureDrawingOverlayLayout } from "../sketch/drawingOverlayLayout";
import {
  SketchSurface,
  type SketchSurfaceHandle,
} from "../sketch/SketchSurface";
import { NativeSketchPreview } from "../sketch/NativeSketchPreview";
import { nativeOverlayShapes } from "../sketch/nativeDrawingLayering";
import type { SketchTool } from "../sketch/types";
import { browserFileToAsset, readImageSize } from "../utils/assets";
import { localDateKey } from "../utils/date";
import { createId } from "../utils/id";
import {
  defaultPaperBackgroundColour,
  effectivePaperBackgroundColour,
} from "../domain/paperBackground";
import { displayAssetUri } from "../utils/displayAssetUri";
import { openExternalUrl } from "../utils/openExternalUrl";
import { AudioCard } from "./AudioCard";
import { CanvasBackgroundChooser } from "./CanvasBackgroundChooser";
import { CanvasTextInspector } from "./CanvasTextInspector";
import {
  ArrangeablePageObject,
  type LayoutChange,
} from "./ArrangeablePageObject";
import {
  containFrameInAspect,
  defaultObjectFrame,
  defaultPhotoFrame,
  defaultPhotoPosition,
  clampPosition,
  MAXIMUM_PHOTO_FRAME,
  pageAspectFromImage,
  VOICE_FRAME,
} from "./arrangeGeometry";
import { DiaryCalendar } from "./DiaryCalendar";
import { DiaryPageStrip } from "./DiaryPageStrip";
import { insertSpokenText, type TextSelection } from "./textInsertion";
import { FlowerPhoto } from "./JournalIllustrations";
import { FavouriteConfirmation } from "./FavouriteConfirmation";
import { ShapeEditor } from "./ShapeEditor";
import { PolygonDraftEditor } from "./PolygonDraftEditor";
import { FreeformDraftEditor } from "./FreeformDraftEditor";
import { LinkComposer } from "./LinkComposer";
import {
  PenSettingsHud,
  type PenSettings,
} from "./PenSettingsHud";
import {
  controlShareRect,
  pageShareLinks,
  pageShareRecordings,
  pageShareTitle,
  paperShareRect,
  shareFileStem,
  waitForShareCapture,
  withShareTimeout,
} from "./pageShare";
import { ShareChooser } from "./ShareChooser";
import { TextCard } from "./TextCard";
import {
  TextComposer,
  type TextDraft,
} from "./TextComposer";
import { TranscriptEditor } from "./TranscriptEditor";
import { TwoFingerTapRecognizer } from "./twoFingerTap";
import { VoiceRecordingDialog } from "./VoiceRecordingDialog";
import { DEFAULT_DRAWING_GRID } from "../sketch/gridGeometry";

export { LinkComposer, TextComposer };

type Commit = (operation: DocumentOperationInput) => Promise<boolean>;
export type PageTool = SketchTool | "arrange" | "view";
const MAX_PHOTOS_PER_PAGE = 5;
const EMPTY_TEXT_DRAFT: TextDraft = {
  text: "",
  textScale: 2.5,
  textAlign: "left",
};
export type PageWorkspaceContext =
  | {
      kind: "diary";
      date: string;
      favourite: boolean;
      journalDayId: string;
      isFirstPage: boolean;
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
  | { kind: "create"; objects: PageObject[] }
  | { kind: "update"; before: PageObject; after: PageObject }
  | { kind: "reorder"; beforeIds: string[]; afterIds: string[] }
  | { kind: "text-stack"; before?: PageTextStack; after?: PageTextStack }
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
    case "shape":
      return `${object.shapeKind} shape`;
    default: {
      const exhaustiveObject: never = object;
      throw new Error(`Unsupported page object: ${exhaustiveObject}`);
    }
  }
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
  fingerErasingEnabled,
  twoFingerUndoEnabled = true,
  favouritePenColours,
  penNib,
  penNibProfiles,
  penOpacity,
  penWidth,
  myWords,
  navigationObscured = false,
  shapeEditingObscured = false,
  recordingLimitMinutes,
  textEditorPreference,
  share,
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
  fingerErasingEnabled: boolean;
  twoFingerUndoEnabled?: boolean;
  favouritePenColours: string[];
  penNib: "pen" | "marker" | "pencil" | "brush";
  penNibProfiles: PenSettings["profiles"];
  penOpacity: number;
  penWidth: number;
  myWords: MyWord[];
  navigationObscured?: boolean;
  shapeEditingObscured?: boolean;
  recordingLimitMinutes: 2 | 5 | 10 | 30 | null;
  textEditorPreference: "native" | "standard";
  share: NativeSharePlugin;
  sketchRepository: BrowserSketchRepository;
  tool: PageTool;
  transcription: AppleTranscriptionPlugin;
}) {
  const sketchRef = useRef<SketchSurfaceHandle>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const pageHeaderRef = useRef<HTMLElement>(null);
  const toolPaletteRef = useRef<HTMLDivElement>(null);
  const shareToolRef = useRef<HTMLButtonElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const actionTimelineRef = useRef<PageAction[]>([]);
  const twoFingerTapRecognizerRef = useRef(new TwoFingerTapRecognizer());
  const transcriptionInFlightRef = useRef(new Set<string>());
  const setTool = onToolChange;
  const [penHudOpen, setPenHudOpen] = useState(false);
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
  const drawingGrid = page.drawingGrid ?? DEFAULT_DRAWING_GRID;
  const photoCount = page.objects.filter((object) => object.type === "photo").length;
  const [selectedObjectId, setSelectedObjectId] = useState<string>();
  const [favouriteConfirmation, setFavouriteConfirmation] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [linkComposerOpen, setLinkComposerOpen] = useState(false);
  const [linkComposerRequested, setLinkComposerRequested] = useState(false);
  const [textComposerOpen, setTextComposerOpen] = useState(false);
  const [textBeingEdited, setTextBeingEdited] = useState<TextObject>();
  const [draggedTextId, setDraggedTextId] = useState<string>();
  const [textComposerRequested, setTextComposerRequested] = useState(false);
  const [nativeTextEditorUnavailable, setNativeTextEditorUnavailable] =
    useState(false);
  const [textDraft, setTextDraft] = useState<TextDraft>(EMPTY_TEXT_DRAFT);
  const textSelectionRef = useRef<TextSelection>({ start: 0, end: 0 });
  const [textRecording, setTextRecording] = useState<RecordingSnapshot>();
  const [textStatus, setTextStatus] = useState<string>();
  const [placingTextId, setPlacingTextId] = useState<string>();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [shareChooserOpen, setShareChooserOpen] = useState(false);
  const [shareChooserRequested, setShareChooserRequested] = useState(false);
  const [shareInProgress, setShareInProgress] = useState(false);
  const [shareCapturing, setShareCapturing] = useState(false);
  const [linkBeingEdited, setLinkBeingEdited] = useState<LinkObject>();
  const [recording, setRecording] = useState<RecordingSnapshot>();
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const [voiceDialogRequested, setVoiceDialogRequested] = useState(false);
  const [polygonDraft, setPolygonDraft] = useState<Position[] | null>(null);
  const [freeformDraft, setFreeformDraft] = useState(false);
  const autoStopStartedRef = useRef(false);
  const toggleVoiceRef = useRef<() => Promise<void>>(async () => undefined);
  useEffect(() => {
    twoFingerTapRecognizerRef.current.reset();
  }, [page.id, tool]);

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

  const { overlayActive, overlayReady, suspendOverlay } = useNativeDrawingOverlay({
    documentId: page.drawingDocumentId,
    enabled: hasNativePencilKit() && polygonDraft === null && !freeformDraft && !navigationObscured && !penHudOpen && !calendarOpen && !favouriteConfirmation && !linkComposerOpen && !linkComposerRequested && !textComposerOpen && !textComposerRequested && !voiceDialogOpen && !voiceDialogRequested && !shareChooserOpen && !shareChooserRequested && !shareInProgress,
    tool,
    color: penSettings.color,
    nib: penSettings.nib,
    width: penSettings.width,
    opacity: penSettings.opacity,
    fingerDrawing: tool === "eraser"
      ? penSettings.fingerErasing === true
      : penSettings.fingerDrawing !== false,
    twoFingerUndo: twoFingerUndoEnabled,
    grid: drawingGrid,
    overlayShapes: nativeOverlayShapes(page.objects.filter((object): object is ShapeObject => object.type === "shape")),
    paperRef,
    protectedHeaderRef: pageHeaderRef,
    toolPaletteRef,
    sketchRepository,
    onError: setNotice,
  });

  const openLinkComposerAboveSketch = async (link?: LinkObject) => {
    setTool("view");
    setSelectedObjectId(undefined);
    setLinkBeingEdited(link);
    setLinkComposerRequested(true);
    const hidden = await suspendOverlay();
    setLinkComposerRequested(false);
    if (hidden) {
      setLinkComposerOpen(true);
    } else {
      setLinkBeingEdited(undefined);
      setNotice("The drawing is still saving. Try Link again in a moment.");
    }
  };

  const openVoiceDialogAboveSketch = async () => {
    setSelectedObjectId(undefined);
    setVoiceDialogRequested(true);
    const hidden = await suspendOverlay();
    setVoiceDialogRequested(false);
    if (hidden) {
      setVoiceDialogOpen(true);
    } else {
      setNotice("The drawing is still saving. Try Voice again in a moment.");
    }
  };

  const openTextComposerAboveSketch = async () => {
    setTextBeingEdited(undefined);
    setTextDraft(EMPTY_TEXT_DRAFT);
    setSelectedObjectId(undefined);
    setTool("view");
    setTextComposerRequested(true);
    const hidden = await suspendOverlay();
    if (!hidden) {
      setTextComposerRequested(false);
      setNotice("The drawing is still saving. Try Text again in a moment.");
      return;
    }
    if (
      textEditorPreference === "native" &&
      hasNativeTextEditor() &&
      !nativeTextEditorUnavailable
    ) {
      try {
        const result = await openNativeTextEditor({
          initialText: "",
          mode: "add",
          contextualStrings: myWords
            .filter((word) => word.enabled)
            .map((word) => word.text)
            .slice(0, 100),
          recordingLimitMilliseconds:
            recordingLimitMinutes === null
              ? undefined
              : recordingLimitMinutes * 60_000,
          localeIdentifier: "en-AU",
        });
        setTextComposerRequested(false);
        if (result.cancelled) {
          return;
        }
        if (!result.text.trim()) {
          setNotice("No text was added.");
          return;
        }
        await addText(result.text);
        return;
      } catch {
        setNativeTextEditorUnavailable(true);
        setNotice(
          "The native editor was unavailable. The standard editor is open.",
        );
      }
    }

    setTextComposerRequested(false);
    setTextComposerOpen(true);
  };

  const openShareChooser = async () => {
    if (
      recording?.state === "recording" ||
      recording?.state === "interrupted" ||
      recording?.state === "finalising"
    ) {
      setNotice("Stop recording first, then share.");
      return;
    }
    setTool("view");
    setPenHudOpen(false);
    setCalendarOpen(false);
    setSelectedObjectId(undefined);
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
    const title = pageShareTitle({ displayName, context });
    const recordings = pageShareRecordings(page);
    const links = format === "pdf" ? pageShareLinks(page) : [];
    try {
      const exported = await withShareTimeout(
        share.exportPage({
          format,
          title,
          fileStem: shareFileStem(title),
          paperRect,
          captureMode: "webview",
          documentId: page.drawingDocumentId,
          previewInsetTop: sketchPreviewInsetTop,
          ...(recordings.transcripts.length > 0
            ? { transcripts: recordings.transcripts }
            : {}),
          ...(links.length > 0 ? { links } : {}),
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
    object: TextObject | TranscriptObject | LinkObject | ShapeObject,
  ) => {
    void commit({
      type: "page-object-update",
      pageId: page.id,
      object,
    });
  };

  const placeShape = async (shapeKind: Exclude<ShapeKind, "polygon" | "freeform">) => {
    const shape: ShapeObject = {
      id: createId(), type: "shape", shapeKind, pageId: page.id,
      position: { x: 0.38, y: 0.34 }, frame: { width: 0.24, height: 0.24 },
      fillColor: penSettings.color, outlineColor: "#3f3528", outlineWidth: 3,
      layer: "behind-sketch", revision: 0, createdAt: new Date().toISOString(),
    };
    setPenHudOpen(false); setTool("arrange"); setSelectedObjectId(shape.id);
    const saved = await commit({ type: "page-object-add", pageId: page.id, object: shape });
    if (!saved) {
      setSelectedObjectId(undefined);
      setTool("pen");
      setPenHudOpen(true);
      setNotice("The shape could not be saved. Choose it again to retry.");
      return;
    }
    actionTimelineRef.current.push({ kind: "create", objects: [shape] });
  };

  const startShapePlacement = (kind: ShapeKind) => {
    if (kind === "freeform") {
      setPenHudOpen(false); setTool("view"); setSelectedObjectId(undefined); setFreeformDraft(true);
      setNotice("Draw one continuous outline, then release to fill the shape."); return;
    }
    if (kind !== "polygon") { void placeShape(kind); return; }
    setPenHudOpen(false); setTool("view"); setSelectedObjectId(undefined);
    setPolygonDraft([]); setNotice(undefined);
  };

  const finishFreeform = async (anchors: Position[]) => {
    const xs = anchors.map(({ x }) => x); const ys = anchors.map(({ y }) => y);
    const minX = Math.min(...xs); const minY = Math.min(...ys);
    const frame = { width: Math.max(0.08, Math.max(...xs) - minX), height: Math.max(0.08, Math.max(...ys) - minY) };
    const position = clampPosition({ x: minX, y: minY }, frame);
    const shape: ShapeObject = {
      id: createId(), type: "shape", shapeKind: "freeform", pageId: page.id, position, frame,
      points: anchors.map(({ x, y }) => ({ x: (x - position.x) / frame.width, y: (y - position.y) / frame.height })),
      fillColor: penSettings.color, outlineColor: "#3f3528", outlineWidth: 3,
      layer: "behind-sketch", revision: 0, createdAt: new Date().toISOString(),
    };
    if (await commit({ type: "page-object-add", pageId: page.id, object: shape })) {
      actionTimelineRef.current.push({ kind: "create", objects: [shape] });
      setFreeformDraft(false); setNotice(undefined); setTool("arrange"); setSelectedObjectId(shape.id);
    }
  };

  const finishPolygon = async () => {
    if (!polygonDraft || polygonDraft.length < 3) return;
    const xs = polygonDraft.map(({ x }) => x); const ys = polygonDraft.map(({ y }) => y);
    const minX = Math.min(...xs); const minY = Math.min(...ys);
    const frame = { width: Math.max(0.18, Math.max(...xs) - minX), height: Math.max(0.12, Math.max(...ys) - minY) };
    const position = clampPosition({ x: minX, y: minY }, frame);
    const shape: ShapeObject = {
      id: createId(), type: "shape", shapeKind: "polygon", pageId: page.id, position, frame,
      points: polygonDraft.map(({ x, y }) => ({ x: (x - position.x) / frame.width, y: (y - position.y) / frame.height })),
      fillColor: penSettings.color, outlineColor: "#3f3528", outlineWidth: 3,
      layer: "behind-sketch", revision: 0, createdAt: new Date().toISOString(),
    };
    if (await commit({ type: "page-object-add", pageId: page.id, object: shape })) {
      actionTimelineRef.current.push({ kind: "create", objects: [shape] });
      setPolygonDraft(null); setNotice(undefined); setTool("arrange"); setSelectedObjectId(shape.id);
    }
  };

  const moveObjectOrder = (objectId: string, direction: -1 | 1) => {
    const beforeIds = page.objects.map(({ id }) => id); const ids = [...beforeIds]; const index = ids.indexOf(objectId);
    let target = index + direction;
    while (target >= 0 && target < page.objects.length && page.objects[target]?.type === "transcript") target += direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    actionTimelineRef.current.push({ kind: "reorder", beforeIds, afterIds: ids });
    void commit({ type: "page-objects-reorder", pageId: page.id, objectIds: ids });
  };

  const movePageShapeInStack = (shape: ShapeObject, direction: -1 | 1) => {
    const index = page.objects.findIndex(({ id }) => id === shape.id);
    const hasRenderableObjectBelow = page.objects
      .slice(0, index)
      .some((object) => object.type !== "transcript");
    if (direction === -1 && shape.layer !== "behind-sketch" && !hasRenderableObjectBelow) {
      toggleObjectLayer(shape);
      return;
    }
    if (direction === 1 && shape.layer === "behind-sketch") {
      toggleObjectLayer(shape);
      return;
    }
    moveObjectOrder(shape.id, direction);
  };

  const updateShape = (shape: ShapeObject) => {
    const before = page.objects.find((object) => object.id === shape.id);
    if (before) actionTimelineRef.current.push({ kind: "update", before, after: shape });
    updateObject(shape);
  };

  const duplicatePageShape = (shape: ShapeObject) => {
    const frame = defaultObjectFrame(shape);
    const offset = clampPosition({ x: shape.position.x + 0.03, y: shape.position.y + 0.03 }, frame);
    const duplicate: ShapeObject = {
      ...shape,
      id: createId(),
      position: offset.x === shape.position.x && offset.y === shape.position.y
        ? clampPosition({ x: shape.position.x - 0.03, y: shape.position.y - 0.03 }, frame)
        : offset,
      points: shape.points?.map((point) => ({ ...point })),
      revision: 0,
      createdAt: new Date().toISOString(),
    };
    const sourceIndex = page.objects.findIndex(({ id }) => id === shape.id);
    void commit({ type: "page-object-add", pageId: page.id, object: duplicate, renderIndex: sourceIndex + 1 }).then((saved) => {
      if (!saved) return;
      actionTimelineRef.current.push({ kind: "create", objects: [duplicate] });
      setSelectedObjectId(duplicate.id);
    });
  };

  const editTextObjectNative = async (object: TextObject) => {
    if (tool !== "arrange") return;
    try {
      const result = await openNativeTextEditor({
        initialText: object.text,
        mode: "edit",
        contextualStrings: myWords
          .filter((word) => word.enabled)
          .map((word) => word.text)
          .slice(0, 100),
        recordingLimitMilliseconds:
          recordingLimitMinutes === null
            ? undefined
            : recordingLimitMinutes * 60_000,
        localeIdentifier: "en-AU",
      });
      if (result.cancelled || result.text === object.text) {
        return;
      }
      const saved = await commit({
        type: "page-object-update",
        pageId: page.id,
        object: {
          ...object,
          text: result.text,
          revision: object.revision + 1,
        },
      });
      if (!saved) {
        setNotice("The edited text could not be saved.");
      } else {
        actionTimelineRef.current.push({
          kind: "update",
          before: object,
          after: { ...object, text: result.text, revision: object.revision + 1 },
        });
      }
    } catch {
      setNativeTextEditorUnavailable(true);
      setTextBeingEdited(object);
      setTextDraft({ ...EMPTY_TEXT_DRAFT, text: object.text });
      setTextComposerOpen(true);
      setNotice("The native editor was unavailable. The standard editor is open.");
    }
  };

  const editTextObject = (object: TextObject) => {
    if (
      textEditorPreference === "native" &&
      hasNativeTextEditor() &&
      !nativeTextEditorUnavailable
    ) {
      void editTextObjectNative(object);
      return;
    }
    setTextBeingEdited(object);
    setTextDraft({ ...EMPTY_TEXT_DRAFT, text: object.text });
    setTextComposerOpen(true);
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

  const twoFingerGestureActive =
    twoFingerUndoEnabled &&
    (tool === "pen" || tool === "eraser" || tool === "arrange");
  const handleTwoFingerPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!twoFingerGestureActive) return;
    twoFingerTapRecognizerRef.current.pointerDown(event.nativeEvent);
  };
  const handleTwoFingerPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!twoFingerGestureActive) return;
    twoFingerTapRecognizerRef.current.pointerMove(event.nativeEvent);
  };
  const handleTwoFingerPointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!twoFingerGestureActive) return;
    if (twoFingerTapRecognizerRef.current.pointerUp(event.nativeEvent)) {
      event.preventDefault();
      globalThis.queueMicrotask(undoLastAction);
    }
  };
  const handleTwoFingerPointerCancel = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    twoFingerTapRecognizerRef.current.pointerCancel(event.nativeEvent);
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

  const togglePhotoAspectLock = (object: PhotoObject) => {
    const lockAspectRatio = object.lockAspectRatio === false;
    const aspectRatio = pageAspectFromImage(object.size);
    const currentFrame = defaultObjectFrame(object);
    void commit({
      type: "page-object-update",
      pageId: page.id,
      object: {
        ...object,
        lockAspectRatio,
        frame: lockAspectRatio
          ? containFrameInAspect(currentFrame, aspectRatio)
          : currentFrame,
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

  const restoreTextStack = async (target?: PageTextStack) => {
    const targetIds = new Set(target?.memberIds ?? []);
    for (const objectId of page.textStack?.memberIds ?? []) {
      if (targetIds.has(objectId)) continue;
      const object = page.objects.find((candidate) => candidate.id === objectId);
      if (!object || object.type !== "text") continue;
      await commit({
        type: "page-text-stack-membership-update",
        pageId: page.id,
        objectId,
        membership: {
          kind: "free",
          position: object.position,
          frame: defaultObjectFrame(object),
        },
      });
    }
    if (!target) return;
    await commit({
      type: "page-text-stack-layout-update",
      pageId: page.id,
      position: target.position,
      frame: target.frame,
    });
    for (const [index, objectId] of target.memberIds.entries()) {
      await commit({
        type: "page-text-stack-membership-update",
        pageId: page.id,
        objectId,
        membership: { kind: "stack", index },
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

    if (action.kind === "create") {
      for (const object of action.objects) void commit({ type: "page-object-delete", pageId: page.id, objectId: object.id });
      return;
    }

    if (action.kind === "update") {
      void commit({ type: "page-object-update", pageId: page.id, object: action.before });
      return;
    }
    if (action.kind === "reorder") {
      void commit({ type: "page-objects-reorder", pageId: page.id, objectIds: action.beforeIds });
      return;
    }
    if (action.kind === "text-stack") {
      void restoreTextStack(action.before);
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
      const [asset, size] = await Promise.all([
        browserFileToAsset(file),
        readImageSize(file),
      ]);
      const frame = defaultPhotoFrame(size);
      const photoId = createId();
      const saved = await commit({
        type: "page-object-add",
        pageId: page.id,
        object: {
          id: photoId,
          type: "photo",
          pageId: page.id,
          position: defaultPhotoPosition(frame),
          frame,
          createdAt: new Date().toISOString(),
          revision: 0,
          asset,
          size,
          lockAspectRatio: true,
          altText: file.name,
        },
      });
      if (saved) {
        setSelectedObjectId(photoId);
        setTool("arrange");
        setNotice(undefined);
      } else {
        setNotice("The photo could not be saved.");
      }
    } catch {
      setNotice("The photo could not be read.");
    }
  };

  async function addText(text = textDraft.text): Promise<boolean> {
    const width = 0.42;
    const object: TextObject = {
      id: createId(),
      type: "text",
      pageId: page.id,
      position: { x: (1 - width) / 2, y: 0.3 },
      frame: { width, height: 0.24 },
      createdAt: new Date().toISOString(),
      revision: 0,
      text: text.trim(),
      textScale: 1,
      textAlign: "left",
      role: "body",
      font: "system-sans",
      color: "#201c17",
      layer: "above-sketch",
    };
    const saved = await commit({
      type: "page-object-add",
      pageId: page.id,
      object,
    });
    if (saved) {
      const joinedStack = await commit({
        type: "page-text-stack-membership-update",
        pageId: page.id,
        objectId: object.id,
        membership: { kind: "stack" },
      });
      if (!joinedStack) {
        await commit({
          type: "page-object-delete",
          pageId: page.id,
          objectId: object.id,
        });
        setNotice("The text block could not be added to the page.");
        return false;
      }
      actionTimelineRef.current.push({ kind: "create", objects: [object] });
      setTextComposerOpen(false);
      setSelectedObjectId(object.id);
      setTool("arrange");
    } else {
      setNotice("The text box could not be added.");
    }
    return saved;
  }

  async function saveTextDraft(): Promise<void> {
    if (!textBeingEdited) {
      await addText();
      return;
    }
    const next = {
      ...textBeingEdited,
      text: textDraft.text.trim(),
      revision: textBeingEdited.revision + 1,
    };
    const saved = await commit({
      type: "page-object-update",
      pageId: page.id,
      object: next,
    });
    if (!saved) {
      setNotice("The edited text could not be saved.");
      return;
    }
    actionTimelineRef.current.push({
      kind: "update",
      before: textBeingEdited,
      after: next,
    });
    setTextBeingEdited(undefined);
    setTextComposerOpen(false);
    setTextDraft(EMPTY_TEXT_DRAFT);
  }

  const toggleTextVoice = async () => {
    if (textRecording?.state === "recording") {
      setTextStatus("Turning your voice into text…");
      try {
        const result = await transcribeEphemeralRecording({
          audio,
          contextualStrings: myWords
            .filter((word) => word.enabled)
            .map((word) => word.text)
            .slice(0, 100),
          files,
          onFinalized: setTextRecording,
          transcription,
        });
        setTextDraft((current) => {
          const inserted = insertSpokenText(current.text, result.rawText, textSelectionRef.current);
          textSelectionRef.current = { start: inserted.cursor, end: inserted.cursor };
          return { ...current, text: inserted.text };
        });
        setTextStatus(result.rawText.trim() ? "Voice added. Check or edit your words." : "No words were recognised. Try again or use the keyboard.");
      } catch {
        setTextStatus("Voice could not be turned into text. Try again or use the keyboard.");
      } finally {
        setTextRecording(undefined);
      }
      return;
    }
    try {
      if (!await recordingStorageAvailable(files)) {
        setTextStatus(
          "Storage is too low to record safely. Free some space or use the keyboard.",
        );
        return;
      }
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
    setNotice(saved ? undefined : "The link could not be saved.");
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
      saved ? undefined : "The link changes could not be saved.",
    );
  };

  const transcribeVoice = async (voice: VoiceRecordingObject) => {
    const markStatus = (status: VoiceRecordingObject["transcriptionStatus"], revision: number) =>
      commit({
        type: "page-object-update",
        pageId: page.id,
        object: { ...voice, transcriptionStatus: status, revision },
      });

    if (transcriptionInFlightRef.current.has(voice.id)) {
      return;
    }
    const existingTranscript = transcripts.get(voice.id);
    if (existingTranscript) {
      if (voice.transcriptionStatus !== "complete") {
        await markStatus("complete", voice.revision + 1);
      }
      return;
    }

    transcriptionInFlightRef.current.add(voice.id);
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
      setNotice(undefined);
    } catch {
      await markStatus("failed", voice.revision + 2).catch(() => false);
      setNotice("Text could not be generated. Your original recording is still saved.");
    } finally {
      transcriptionInFlightRef.current.delete(voice.id);
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
        transcriptionStatus: "not-requested",
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

      setNotice(undefined);
      return;
    }

    let started: RecordingSnapshot;
    try {
      if (!await recordingStorageAvailable(files)) {
        setNotice(
          "Storage is too low to record safely. Free some space and try again.",
        );
        return;
      }
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

  const placeReviewedVoice = async (savedRecording: RecordingSnapshot) => {
    if (!savedRecording.asset) return;
    const width = VOICE_FRAME.width;
    const voice: VoiceRecordingObject = {
      id: savedRecording.id,
      type: "voice",
      pageId: page.id,
      position: { x: (1 - width) / 2, y: 0.3 },
      frame: VOICE_FRAME,
      createdAt: new Date().toISOString(),
      revision: 0,
      asset: savedRecording.asset,
      durationMs: savedRecording.elapsedMs,
      transcriptionStatus: "not-requested",
      layer: "above-sketch",
    };
    const saved = await commit({ type: "page-object-add", pageId: page.id, object: voice });
    if (!saved) { setNotice("The recording could not be added to this page."); return; }
    setVoiceDialogOpen(false);
    setRecording(undefined);
    setPlacingTextId(voice.id);
    setSelectedObjectId(voice.id);
    setTool("arrange");
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
      penSettings.favouriteColours !== favouritePenColours ||
      Math.abs(penSettings.width - penWidth) > 0.001 ||
      Math.abs(penSettings.opacity - penOpacity) > 0.001 ||
      penSettings.fingerDrawing !== fingerDrawingEnabled ||
      penSettings.fingerErasing !== fingerErasingEnabled
    ) {
      void commit({
        type: "settings-update",
        settings: {
          penColor: penSettings.color,
          penNib: penSettings.nib ?? "pen",
          ...(penSettings.profiles ? { penNibProfiles: penSettings.profiles } : {}),
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

  const textStack = page.textStack;
  const textStackIds = new Set(textStack?.memberIds ?? []);
  const stackedTexts = (textStack?.memberIds ?? []).flatMap((id) => {
    const object = page.objects.find((candidate) => candidate.id === id);
    return object?.type === "text" ? [object] : [];
  });
  const selectedText = page.objects.find(
    (object): object is TextObject =>
      object.id === selectedObjectId && object.type === "text",
  );
  const selectedTextStackIndex = selectedText
    ? (textStack?.memberIds.indexOf(selectedText.id) ?? -1)
    : -1;

  const updateCanvasText = (object: TextObject) => {
    const before = page.objects.find(
      (candidate): candidate is TextObject =>
        candidate.id === object.id && candidate.type === "text",
    );
    if (!before) return;
    actionTimelineRef.current.push({ kind: "update", before, after: object });
    updateObject(object);
  };

  const reorderStackText = (objectId: string, direction: -1 | 1) => {
    if (!textStack) return;
    const index = textStack.memberIds.indexOf(objectId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= textStack.memberIds.length) return;
    const memberIds = [...textStack.memberIds];
    [memberIds[index], memberIds[target]] = [memberIds[target]!, memberIds[index]!];
    const after = { ...textStack, memberIds };
    actionTimelineRef.current.push({ kind: "text-stack", before: textStack, after });
    void commit({
      type: "page-text-stack-reorder",
      pageId: page.id,
      memberIds,
    });
  };

  const placeTextInStackAt = (objectId: string, targetIndex: number) => {
    const before = textStack;
    const memberIds = (before?.memberIds ?? []).filter((id) => id !== objectId);
    const index = Math.max(0, Math.min(targetIndex, memberIds.length));
    memberIds.splice(index, 0, objectId);
    const after: PageTextStack = {
      position: before?.position ?? { x: 0.1, y: 0.12 },
      frame: before?.frame ?? { width: 0.8, height: 0.76 },
      memberIds,
      layer: before?.layer ?? "above-sketch",
    };
    actionTimelineRef.current.push({ kind: "text-stack", before, after });
    if (before?.memberIds.includes(objectId)) {
      void commit({
        type: "page-text-stack-reorder",
        pageId: page.id,
        memberIds,
      });
    } else {
      void commit({
        type: "page-text-stack-membership-update",
        pageId: page.id,
        objectId,
        membership: { kind: "stack", index },
      });
    }
    setSelectedObjectId(objectId);
    setDraggedTextId(undefined);
  };

  const toggleTextStackMembership = (object: TextObject) => {
    const before = textStack;
    if (textStackIds.has(object.id)) {
      const index = textStack?.memberIds.indexOf(object.id) ?? 0;
      const element = document.querySelector<HTMLElement>(
        `[data-stack-text-id="${object.id}"]`,
      );
      const paperRect = paperRef.current?.getBoundingClientRect();
      const blockRect = element?.getBoundingClientRect();
      const frame = paperRect && blockRect
        ? {
            width: Math.min(0.5, blockRect.width / paperRect.width),
            height: Math.min(0.3, Math.max(0.1, blockRect.height / paperRect.height)),
          }
        : { width: 0.44, height: 0.16 };
      const position = paperRect && blockRect
        ? clampPosition({
            x: (blockRect.left - paperRect.left) / paperRect.width,
            y: (blockRect.top - paperRect.top) / paperRect.height,
          }, frame)
        : { x: 0.28, y: Math.min(0.72, 0.18 + index * 0.1) };
      const after = before
        ? { ...before, memberIds: before.memberIds.filter((id) => id !== object.id) }
        : undefined;
      actionTimelineRef.current.push({ kind: "text-stack", before, after });
      void commit({
        type: "page-text-stack-membership-update",
        pageId: page.id,
        objectId: object.id,
        membership: { kind: "free", position, frame },
      });
      return;
    }
    const after: PageTextStack = {
      position: before?.position ?? { x: 0.1, y: 0.12 },
      frame: before?.frame ?? { width: 0.8, height: 0.76 },
      memberIds: [...(before?.memberIds ?? []), object.id],
    };
    actionTimelineRef.current.push({ kind: "text-stack", before, after });
    void commit({
      type: "page-text-stack-membership-update",
      pageId: page.id,
      objectId: object.id,
      membership: { kind: "stack" },
    });
  };

  return (
    <section
      className={`journal-workspace${shareCapturing ? " share-capturing" : ""}`}
      aria-label={
        context.kind === "diary"
          ? "Today’s diary page"
          : `${context.sketchbook.name} sketchbook page`
      }
    >
      <p aria-atomic="true" aria-live="assertive" className="visually-hidden">
        {shareCapturing ? "Preparing to send" : ""}
      </p>
      <div
        className="tool-palette"
        aria-label="Page tools"
        ref={toolPaletteRef}
      >
        <div aria-label="View and edit tools" className="tool-hud" role="group">
          <button
          aria-pressed={tool === "view"}
          className={tool === "view" ? "tool selected" : "tool"}
          data-help-topic="view"
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
            className={tool === "arrange" ? "tool arrange-tool selected" : "tool arrange-tool"}
            data-help-topic="arrange"
            onClick={() => setTool("arrange")}
            type="button"
          >
            <Move aria-hidden="true" />
            <span>Edit</span>
          </button>
        </div>
        <div aria-label="Media tools" className="tool-hud content-tool-hud" role="group">
          <button
          aria-label={photoCount >= MAX_PHOTOS_PER_PAGE ? "Image limit reached" : "Image"}
          className="tool"
          data-help-topic="photo"
          disabled={photoCount >= MAX_PHOTOS_PER_PAGE}
          onClick={() => photoInputRef.current?.click()}
          type="button"
        >
          <ImagePlus aria-hidden="true" />
          <span>Image</span>
          </button>
          <button
          className="tool"
          data-help-topic="link"
          onClick={() => {
            void openLinkComposerAboveSketch();
          }}
          type="button"
        >
          <LinkIcon aria-hidden="true" />
          <span>Link</span>
          </button>
        </div>
        <div aria-label="Text and voice tools" className="tool-hud text-voice-tool-hud" role="group">
          <button className="tool" data-help-topic="text" onClick={() => {
            setTextDraft(EMPTY_TEXT_DRAFT);
            textSelectionRef.current = { start: 0, end: 0 };
            setTextStatus(undefined);
            void openTextComposerAboveSketch();
          }} type="button">
            <Type aria-hidden="true" />
            <span>Text</span>
          </button>
          <button
          aria-expanded={voiceDialogOpen}
          aria-haspopup="dialog"
          className="tool voice-tool"
          data-help-topic="voice"
          disabled={voiceDialogRequested}
          onClick={() => void openVoiceDialogAboveSketch()}
          type="button"
        >
          <Mic aria-hidden="true" />
          <span>Voice</span>
          </button>
        </div>
        <div aria-label="Drawing tools" className="tool-hud" role="group">
          <button
          aria-expanded={penHudOpen}
          aria-haspopup="dialog"
          aria-pressed={tool === "pen"}
          className={tool === "pen" ? "tool selected" : "tool"}
          data-help-topic="draw"
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
          data-help-topic="erase"
          onClick={() => {
            if (tool === "eraser") {
              setPenHudOpen(true);
              return;
            }
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
        <div aria-label="History tools" className="tool-hud" role="group">
          <button
            className="tool"
            data-help-topic="undo"
            disabled={tool !== "pen" && tool !== "eraser" && tool !== "arrange"}
            onClick={undoLastAction}
            type="button"
          >
            <Undo2 aria-hidden="true" />
            <span>Undo</span>
          </button>
          <button
            className="tool"
            data-help-topic="redo"
            disabled={tool !== "pen" && tool !== "eraser"}
            onClick={redoDrawing}
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
            data-help-topic="share"
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

      <header className="page-date" ref={pageHeaderRef}>
        {context.kind === "sketchbook" ? (
          <button
            aria-label="Back to sketchbooks"
            className="back-to-library"
            data-help-topic="back-sketchbooks"
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
              ? "Remove this page from favourites"
              : "Add this page to favourites"
          }
          aria-pressed={context.favourite}
          className="page-favourite"
          data-help-topic="favourite"
          onClick={() => void (async () => {
            const adding = !context.favourite;
            const saved = await commit({
              type: "favourite-set",
              targetType: "page",
              targetId: page.id,
              favourite: adding,
            });
            if (
              saved &&
              !adding &&
              context.kind === "diary" &&
              context.isFirstPage
            ) {
              await commit({
                type: "favourite-set",
                targetType: "journal-day",
                targetId: context.journalDayId,
                favourite: false,
              });
            }
            if (saved) {
              await suspendOverlay();
              setFavouriteConfirmation(
                adding
                  ? "Added to Your Favourites"
                  : "Removed from Your Favourites",
              );
            }
          })()}
          type="button"
        >
          <ThumbsUp aria-hidden="true" />
        </button>
      </header>

      {/* Canvas taps finish pointer-based text placement; the text object and
          toolbar retain their own keyboard-accessible controls. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className={`paper-page paper-${page.paperStyle}${
          tool === "pen" || tool === "eraser" ? " drawing-active" : ""
        }${tool === "arrange" ? " arranging" : ""}${
          tool === "view" ? " viewing" : ""
        }`}
        onClick={(event) => {
          if (polygonDraft && event.target instanceof Element && !event.target.closest("button")) {
            const bounds = paperRef.current?.getBoundingClientRect();
            if (bounds) setPolygonDraft([...polygonDraft, {
              x: Math.min(0.96, Math.max(0.04, (event.clientX - bounds.left) / bounds.width)),
              y: Math.min(0.96, Math.max(0.04, (event.clientY - bounds.top) / bounds.height)),
            }]);
            return;
          }
          if (!placingTextId || !(event.target instanceof Element)) return;
          const clickedObject = event.target.closest<HTMLElement>("[data-object-id]");
          if (clickedObject?.dataset.objectId === placingTextId) return;
          finishTextPlacement();
        }}
        onDragOver={(event) => {
          if (draggedTextId && tool === "arrange") event.preventDefault();
        }}
        onDrop={(event) => {
          if (!draggedTextId || tool !== "arrange") return;
          if (
            event.target instanceof Element &&
            event.target.closest(".canvas-text-stack")
          ) return;
          event.preventDefault();
          const object = page.objects.find(
            (candidate): candidate is TextObject =>
              candidate.id === draggedTextId && candidate.type === "text",
          );
          const bounds = paperRef.current?.getBoundingClientRect();
          if (!object || !bounds || !textStackIds.has(object.id)) {
            setDraggedTextId(undefined);
            return;
          }
          const frame = { width: 0.44, height: 0.16 };
          const position = clampPosition({
            x: (event.clientX - bounds.left) / bounds.width - frame.width / 2,
            y: (event.clientY - bounds.top) / bounds.height - frame.height / 2,
          }, frame);
          const after = textStack
            ? {
                ...textStack,
                memberIds: textStack.memberIds.filter((id) => id !== object.id),
              }
            : undefined;
          actionTimelineRef.current.push({
            kind: "text-stack",
            before: textStack,
            after,
          });
          void commit({
            type: "page-text-stack-membership-update",
            pageId: page.id,
            objectId: object.id,
            membership: { kind: "free", position, frame },
          });
          setSelectedObjectId(object.id);
          setDraggedTextId(undefined);
        }}
        onPointerCancelCapture={handleTwoFingerPointerCancel}
        onPointerDownCapture={handleTwoFingerPointerDown}
        onPointerMoveCapture={handleTwoFingerPointerMove}
        onPointerUpCapture={handleTwoFingerPointerUp}
        ref={paperRef}
        style={{
          "--page-background-colour": effectivePaperBackgroundColour(page),
        } as CSSProperties}
      >
        {tool === "arrange" ? (
          <CanvasBackgroundChooser
            control={{
              color: effectivePaperBackgroundColour(page),
              defaultColor: defaultPaperBackgroundColour(page.paperStyle),
              onChange: (backgroundColor) => {
                void commit({
                  type: "page-background-update",
                  pageId: page.id,
                  ...(backgroundColor ? { backgroundColor } : {}),
                });
              },
            }}
          />
        ) : null}
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
        {overlayReady ? null : (
          <NativeSketchPreview
            contentInsetTop={sketchPreviewInsetTop}
            documentId={page.drawingDocumentId}
          />
        )}

        {polygonDraft ? <PolygonDraftEditor color={penSettings.color} onCancel={() => { setPolygonDraft(null); setNotice(undefined); setTool("pen"); }} onChange={setPolygonDraft} onFinish={() => void finishPolygon()} pageRef={paperRef} points={polygonDraft} /> : null}
        {freeformDraft ? <FreeformDraftEditor color={penSettings.color} onCancel={() => { setFreeformDraft(false); setNotice(undefined); setTool("pen"); }} onFinish={(anchors) => void finishFreeform(anchors)} onInvalid={() => setNotice("Draw a larger closed outline to create a freeform shape.")} pageRef={paperRef} /> : null}

        {textStack && stackedTexts.length > 0 ? (
          <ArrangeablePageObject
            adaptiveEdgeControls
            arrange={tool === "arrange"}
            className="page-object canvas-text-stack"
            frame={textStack.frame}
            layer={textStack.layer ?? "above-sketch"}
            objectLabel="text column"
            objectId="page-text-stack"
            onCommit={(change) => {
              const after = {
                ...textStack,
                ...(change.kind === "move"
                  ? { position: change.after.position }
                  : { frame: change.after.frame }),
              };
              actionTimelineRef.current.push({
                kind: "text-stack",
                before: textStack,
                after,
              });
              void commit({
                type: "page-text-stack-layout-update",
                pageId: page.id,
                position: after.position,
                frame: after.frame,
              });
            }}
            onSelect={() => setSelectedObjectId("page-text-stack")}
            onToggleLayer={() => void commit({
              type: "page-text-stack-layer-update",
              pageId: page.id,
              layer: textStack.layer === "behind-sketch"
                ? "above-sketch"
                : "behind-sketch",
            })}
            pageRef={paperRef}
            position={textStack.position}
            selected={
              selectedObjectId === "page-text-stack" ||
              selectedTextStackIndex >= 0
            }
            showShortcuts={selectedObjectId === "page-text-stack"}
            stackIndex={page.objects.length + 1}
          >
            {/* Drag-and-drop supplements the inspector’s keyboard-accessible
                earlier/later and stack-membership controls. */}
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
            <section
              aria-label="Page text"
              className="canvas-text-stack-flow"
              onDragOver={(event) => {
                if (draggedTextId) event.preventDefault();
              }}
              onDrop={(event) => {
                if (!draggedTextId) return;
                event.preventDefault();
                event.stopPropagation();
                placeTextInStackAt(draggedTextId, stackedTexts.length);
              }}
            >
              {stackedTexts.map((object, stackIndex) => (
                // eslint-disable-next-line jsx-a11y/no-static-element-interactions
                <div
                  aria-label={tool === "arrange" ? `Select text block: ${object.text}` : undefined}
                  className={`canvas-text-stack-block${selectedObjectId === object.id ? " selected" : ""}`}
                  data-stack-text-id={object.id}
                  draggable={tool === "arrange"}
                  key={object.id}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    event.dataTransfer.effectAllowed = "move";
                    setDraggedTextId(object.id);
                  }}
                  onDragEnd={() => setDraggedTextId(undefined)}
                  onDragOver={(event) => {
                    if (draggedTextId && draggedTextId !== object.id) {
                      event.preventDefault();
                    }
                  }}
                  onDrop={(event) => {
                    if (!draggedTextId || draggedTextId === object.id) return;
                    event.preventDefault();
                    event.stopPropagation();
                    placeTextInStackAt(draggedTextId, stackIndex);
                  }}
                  onClick={(event) => {
                    if (tool !== "arrange") return;
                    event.stopPropagation();
                    setSelectedObjectId(object.id);
                  }}
                  onDoubleClick={() => tool === "arrange" && editTextObject(object)}
                  onKeyDown={(event) => {
                    if (
                      tool === "arrange" &&
                      (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      event.stopPropagation();
                      setSelectedObjectId(object.id);
                    }
                  }}
                  role={tool === "arrange" ? "button" : undefined}
                  tabIndex={tool === "arrange" ? 0 : undefined}
                >
                  <TextCard
                    object={object}
                    onSave={updateObject}
                    readOnly
                  />
                </div>
              ))}
            </section>
          </ArrangeablePageObject>
        ) : null}

        {page.objects.map((object, index) => {
          if (object.type === "transcript") {
            return null;
          }
          if (object.type === "text" && textStackIds.has(object.id)) {
            return null;
          }
          switch (object.type) {
            case "voice": {
              const transcript = transcripts.get(object.id);
              return (
                <ArrangeablePageObject
                  arrange={tool === "arrange"}
                  canResize={false}
                  className="page-object voice-object"
                  deleteDescription={deletionDescription(object, transcript)}
                  frame={defaultObjectFrame(object)}
                  key={object.id}
                  layer={object.layer ?? "above-sketch"}
                  objectLabel="voice recording"
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
                  stackIndex={index}
                >
                  <AudioCard
                    disabled={tool === "arrange"}
                    audio={audio}
                    onConvertToText={!transcript &&
                      object.transcriptionStatus !== "complete"
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
                      readOnly={tool !== "arrange"}
                      transcript={transcript}
                    />
                  ) : null}
                </ArrangeablePageObject>
              );
            }
            case "shape":
              return <ShapeEditor
                arrange={tool === "arrange" && !shapeEditingObscured}
                canMoveDown={object.layer !== "behind-sketch"}
                canMoveUp={object.layer === "behind-sketch" || index < page.objects.length - 1}
                key={object.id}
                onDelete={() => deletePageObject(object)}
                onDeselect={() => setSelectedObjectId(undefined)}
                onDuplicate={() => duplicatePageShape(object)}
                onMoveDown={() => movePageShapeInStack(object, -1)}
                onMoveUp={() => movePageShapeInStack(object, 1)}
                onSelect={() => setSelectedObjectId(object.id)}
                onUpdate={(next) => updateShape(next)}
                pageRef={paperRef}
                selected={selectedObjectId === object.id}
                shape={object}
                snapShapes={page.objects.filter((candidate): candidate is ShapeObject => candidate.type === "shape" && candidate.id !== object.id)}
                stackIndex={index}
              />;
            case "photo": {
              const lockAspectRatio = object.lockAspectRatio !== false;
              return (
                <ArrangeablePageObject
                  arrange={tool === "arrange"}
                  aspectLock={lockAspectRatio}
                  aspectRatio={pageAspectFromImage(object.size)}
                  className={`page-object photo-object${lockAspectRatio ? " keep-proportions" : ""}`}
                  deleteDescription={deletionDescription(object)}
                  frame={defaultObjectFrame(object)}
                  key={object.id}
                  layer={object.layer ?? "above-sketch"}
                  maximumFrame={MAXIMUM_PHOTO_FRAME}
                  objectLabel="image"
                  objectId={object.id}
                  onCommit={(change) =>
                    commitLayoutChange(object.id, change)
                  }
                  onDelete={() => deletePageObject(object)}
                  onSelect={() => setSelectedObjectId(object.id)}
                  onToggleAspectLock={() => togglePhotoAspectLock(object)}
                  onToggleLayer={() => toggleObjectLayer(object)}
                  pageRef={paperRef}
                  position={object.position}
                  selected={selectedObjectId === object.id}
                  showShortcuts={false}
                  stackIndex={index}
                >
                  {object.asset.localUri === "demo://garden-flowers" ? (
                    <FlowerPhoto />
                  ) : (
                    <img
                      alt={object.altText ?? "Journal photograph"}
                      src={displayAssetUri(object.asset.localUri)}
                    />
                  )}
                </ArrangeablePageObject>
              );
            }
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
                  onNativeDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    setDraggedTextId(object.id);
                  }}
                  onSelect={() => setSelectedObjectId(object.id)}
                  onToggleLayer={() => toggleObjectLayer(object)}
                  pageRef={paperRef}
                  position={object.position}
                  selected={selectedObjectId === object.id}
                  showShortcuts={false}
                  stackIndex={index}
                >
                  <TextCard
                    object={object}
                    onEdit={tool === "arrange" ? () => editTextObject(object) : undefined}
                    onSave={updateCanvasText}
                    readOnly={tool !== "arrange"}
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
                  objectLabel="web link"
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
                  stackIndex={index}
                >
                  {tool === "arrange" ? (
                    <div className="link-object">
                      <LinkIcon aria-hidden="true" />
                      <span>
                        <button
                          aria-label={`Edit link named ${object.title}`}
                          className="link-name-edit"
                          data-help-topic="arrange-edit-link"
                          onClick={(event) => {
                            event.stopPropagation();
                            void openLinkComposerAboveSketch(object);
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
                    <button
                      aria-label={`Open ${object.title}`}
                      className="link-object"
                      onClick={() => openExternalUrl(object.url)}
                      type="button"
                    >
                      <LinkIcon aria-hidden="true" />
                      <span>
                        <strong>{object.title}</strong>
                        <small>{new URL(object.url).hostname}</small>
                      </span>
                    </button>
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

        {tool === "arrange" && selectedText ? (
          <CanvasTextInspector
            canMoveEarlier={selectedTextStackIndex > 0}
            canMoveLater={
              selectedTextStackIndex >= 0 &&
              selectedTextStackIndex < (textStack?.memberIds.length ?? 0) - 1
            }
            key={selectedText.id}
            object={selectedText}
            onDelete={() => deletePageObject(selectedText)}
            onEdit={() => editTextObject(selectedText)}
            onMoveEarlier={() => reorderStackText(selectedText.id, -1)}
            onMoveLater={() => reorderStackText(selectedText.id, 1)}
            onToggleStack={() => toggleTextStackMembership(selectedText)}
            onUpdate={updateCanvasText}
            stacked={selectedTextStackIndex >= 0}
          />
        ) : null}

        {textComposerOpen ? (
          <TextComposer draft={textDraft} recording={textRecording?.state === "recording"} selectionRef={textSelectionRef} status={textStatus} onCancel={() => { setTextComposerOpen(false); setTextBeingEdited(undefined); setTextDraft(EMPTY_TEXT_DRAFT); textSelectionRef.current = { start: 0, end: 0 }; setTextStatus(undefined); }} onChange={setTextDraft} onSubmit={() => void saveTextDraft()} onToggleVoice={() => void toggleTextVoice()} />
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

        {shareChooserOpen ? (
          <ShareChooser
            hasRecordings={pageShareRecordings(page).hasRecordings}
            onCancel={() => setShareChooserOpen(false)}
            onSharePdf={() => void sharePage("pdf")}
            onSharePicture={() => void sharePage("jpg")}
          />
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
