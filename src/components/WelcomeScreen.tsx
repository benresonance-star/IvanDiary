import { ChevronLeft, Eraser, PenLine, Redo2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useNativeDrawingOverlay } from "../hooks/useNativeDrawingOverlay";
import {
  hasNativePencilKit,
  redoNativeDrawingOverlay,
  undoNativeDrawingOverlay,
} from "../native/pencilKit";
import { measureDrawingOverlayLayout } from "../sketch/drawingOverlayLayout";
import { NativeSketchPreview } from "../sketch/NativeSketchPreview";
import {
  SketchSurface,
  type SketchSurfaceHandle,
} from "../sketch/SketchSurface";
import type { SketchRepository, SketchTool } from "../sketch/types";
import { WELCOME_DRAWING_DOCUMENT_ID } from "../sketch/specialDocuments";
import { PenSettingsHud, type PenSettings } from "./PenSettingsHud";

export type WelcomeCopy = {
  greeting: string;
  tagline: string;
  message: string;
};

export function WelcomeScreen({
  copy,
  editing = false,
  onDismiss,
  onPenSettingsChange,
  onReturnToSettings,
  penColor,
  fingerDrawingEnabled = true,
  favouriteColourLongPressEnabled = true,
  favouriteColourLongPressSeconds = 2,
  favouritePenColours,
  interactionObscured = false,
  penNib = "pen",
  penNibProfiles,
  penOpacity,
  penWidth,
  reducedMotion,
  sketchRepository,
}: {
  copy: WelcomeCopy;
  editing?: boolean;
  onDismiss: () => void;
  onPenSettingsChange?: (settings: PenSettings) => void;
  onReturnToSettings?: () => void;
  penColor: string;
  fingerDrawingEnabled?: boolean;
  favouriteColourLongPressEnabled?: boolean;
  favouriteColourLongPressSeconds?: number;
  favouritePenColours?: string[];
  interactionObscured?: boolean;
  penNib?: "pen" | "marker" | "pencil" | "brush";
  penNibProfiles?: PenSettings["profiles"];
  penOpacity: number;
  penWidth: number;
  reducedMotion: boolean;
  sketchRepository: SketchRepository;
}) {
  const paperRef = useRef<HTMLDivElement>(null);
  const toolPaletteRef = useRef<HTMLDivElement>(null);
  const sketchRef = useRef<SketchSurfaceHandle>(null);
  const [tool, setTool] = useState<SketchTool>("pen");
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
  const [leaving, setLeaving] = useState(false);
  const [previewInsetTop, setPreviewInsetTop] = useState(0);
  const dismissRef = useRef(onDismiss);
  const finishTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  const { overlayActive, overlayReady } = useNativeDrawingOverlay({
    documentId: WELCOME_DRAWING_DOCUMENT_ID,
    enabled:
      editing && !interactionObscured && !penHudOpen && hasNativePencilKit(),
    tool,
    color: penSettings.color,
    nib: penSettings.nib,
    width: penSettings.width,
    opacity: penSettings.opacity,
    fingerDrawing: penSettings.fingerDrawing !== false,
    paperRef,
    toolPaletteRef,
    sketchRepository,
  });

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper) return;
    const updateInset = () => {
      const { contentInsetTop } = measureDrawingOverlayLayout(
        paper,
        toolPaletteRef.current,
      );
      setPreviewInsetTop(contentInsetTop);
    };
    updateInset();
    const observer = new ResizeObserver(updateInset);
    observer.observe(paper);
    if (toolPaletteRef.current) observer.observe(toolPaletteRef.current);
    return () => observer.disconnect();
  }, [editing]);

  const dismiss = useCallback(() => {
    if (reducedMotion) {
      dismissRef.current();
      return;
    }
    setLeaving(true);
    window.clearTimeout(finishTimerRef.current);
    finishTimerRef.current = window.setTimeout(
      () => dismissRef.current(),
      350,
    );
  }, [reducedMotion]);

  useEffect(
    () => () => window.clearTimeout(finishTimerRef.current),
    [],
  );

  const undo = () => {
    if (overlayActive) {
      void undoNativeDrawingOverlay();
    } else {
      sketchRef.current?.undo();
    }
  };

  const redo = () => {
    if (overlayActive) {
      void redoNativeDrawingOverlay();
    } else {
      sketchRef.current?.redo();
    }
  };

  const accessibleText = [copy.greeting, copy.tagline, copy.message]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`welcome-screen${editing ? " editing" : ""}${leaving ? " leaving" : ""}`}
      data-reduced-motion={reducedMotion}
      ref={paperRef}
    >
      <SketchSurface
        capabilities={
          editing && !overlayReady
            ? { kind: "ipad", tools: ["pen", "eraser"], fingerDrawing: penSettings.fingerDrawing !== false, pressure: true }
            : { kind: "readonly", tools: [], fingerDrawing: false, pressure: false }
        }
        documentId={WELCOME_DRAWING_DOCUMENT_ID}
          penColor={penSettings.color}
          penNib={penSettings.nib}
        penOpacity={penSettings.opacity}
        penWidth={penSettings.width}
        ref={sketchRef}
        repository={sketchRepository}
        tool={tool}
      />
      {overlayActive ? null : (
        <NativeSketchPreview
          className="welcome-native-preview"
          contentInsetTop={Math.max(previewInsetTop, 104)}
          documentId={WELCOME_DRAWING_DOCUMENT_ID}
        />
      )}

      <span aria-hidden="true" className="welcome-content">
        <strong>{copy.greeting}</strong>
        <span>{copy.tagline}</span>
        {copy.message ? <span className="welcome-personal-message">{copy.message}</span> : null}
      </span>

      {editing ? (
          <button
            className="welcome-return"
            data-help-topic="return-settings"
            onClick={onReturnToSettings}
            type="button"
          >
            <ChevronLeft aria-hidden="true" />
            Return to Settings
          </button>
      ) : (
        <button
          aria-label={`${accessibleText}. Open diary`}
          className="welcome-continue"
          data-help-topic="welcome-continue"
          onClick={dismiss}
          type="button"
        />
      )}

      {editing ? <div
        aria-label="Welcome drawing tools"
        className="welcome-drawing-tools"
        ref={toolPaletteRef}
        role="toolbar"
      >
            <button
              aria-expanded={penHudOpen}
              aria-haspopup="dialog"
              aria-pressed={tool === "pen"}
              data-help-topic="draw"
              onClick={() => {
                if (tool === "pen") {
                  setPenHudOpen(true);
                } else {
                  setTool("pen");
                }
              }}
              type="button"
            >
              <PenLine aria-hidden="true" />
              Draw
            </button>
            <button
              aria-pressed={tool === "eraser"}
              data-help-topic="erase"
              onClick={() => setTool("eraser")}
              type="button"
            >
              <Eraser aria-hidden="true" />
              Erase
            </button>
            <button data-help-topic="undo" onClick={undo} type="button">
              <Undo2 aria-hidden="true" />
              Undo
            </button>
            <button data-help-topic="redo" onClick={redo} type="button">
              <Redo2 aria-hidden="true" />
              Redo
            </button>
      </div> : null}
      {editing && penHudOpen ? (
        <>
          <button
            aria-label="Close pen settings"
            className="pen-hud-backdrop welcome-pen-backdrop"
            onClick={() => {
              setPenHudOpen(false);
              onPenSettingsChange?.(penSettings);
            }}
            type="button"
          />
          <PenSettingsHud
            favouriteColourLongPressEnabled={
              favouriteColourLongPressEnabled
            }
            favouriteColourLongPressMs={
              favouriteColourLongPressSeconds * 1000
            }
            onChange={setPenSettings}
            onDone={() => {
              setPenHudOpen(false);
              onPenSettingsChange?.(penSettings);
            }}
            settings={penSettings}
          />
        </>
      ) : null}
      <span className="visually-hidden">{accessibleText}</span>
    </div>
  );
}
