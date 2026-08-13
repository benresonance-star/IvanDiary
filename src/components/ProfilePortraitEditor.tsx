import { ChevronLeft, Eraser, PenLine, Redo2, Undo2 } from "lucide-react";
import { useRef, useState } from "react";

import { useNativeDrawingOverlay } from "../hooks/useNativeDrawingOverlay";
import {
  hasNativePencilKit,
  redoNativeDrawingOverlay,
  undoNativeDrawingOverlay,
} from "../native/pencilKit";
import { NativeSketchPreview } from "../sketch/NativeSketchPreview";
import { PROFILE_PORTRAIT_DOCUMENT_ID } from "../sketch/specialDocuments";
import { SketchSurface, type SketchSurfaceHandle } from "../sketch/SketchSurface";
import type { SketchRepository, SketchTool } from "../sketch/types";
import { PenSettingsHud, type PenSettings } from "./PenSettingsHud";

export function ProfilePortraitEditor({
  initialPenSettings,
  onPenSettingsChange,
  onReturn,
  sketchRepository,
}: {
  initialPenSettings: PenSettings;
  onPenSettingsChange: (settings: PenSettings) => void;
  onReturn: () => void;
  sketchRepository: SketchRepository;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const sketchRef = useRef<SketchSurfaceHandle>(null);
  const [tool, setTool] = useState<SketchTool>("pen");
  const [penHudOpen, setPenHudOpen] = useState(false);
  const [penSettings, setPenSettings] = useState(initialPenSettings);
  const { overlayActive, overlayRequested } = useNativeDrawingOverlay({
    documentId: PROFILE_PORTRAIT_DOCUMENT_ID,
    enabled: !penHudOpen && hasNativePencilKit(),
    tool,
    color: penSettings.color,
    nib: penSettings.nib,
    width: penSettings.width,
    opacity: penSettings.opacity,
    fingerDrawing: penSettings.fingerDrawing !== false,
    paperRef: canvasRef,
    toolPaletteRef: toolsRef,
    sketchRepository,
    clipShape: "circle",
  });

  const undo = () => overlayActive
    ? void undoNativeDrawingOverlay()
    : sketchRef.current?.undo();
  const redo = () => overlayActive
    ? void redoNativeDrawingOverlay()
    : sketchRef.current?.redo();
  const closePenSettings = () => {
    setPenHudOpen(false);
    onPenSettingsChange(penSettings);
  };

  return (
    <section className="portrait-editor" aria-label="Draw my portrait">
      <button className="portrait-editor-return" onClick={onReturn} type="button">
        <ChevronLeft aria-hidden="true" />
        Return to About Me
      </button>
      <div className="portrait-editor-tools" ref={toolsRef} role="toolbar" aria-label="Portrait drawing tools">
        <button
          aria-expanded={penHudOpen}
          aria-pressed={tool === "pen"}
          onClick={() => tool === "pen" ? setPenHudOpen(true) : setTool("pen")}
          type="button"
        ><PenLine aria-hidden="true" />Draw</button>
        <button aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")} type="button">
          <Eraser aria-hidden="true" />Erase
        </button>
        <button onClick={undo} type="button"><Undo2 aria-hidden="true" />Undo</button>
        <button onClick={redo} type="button"><Redo2 aria-hidden="true" />Redo</button>
      </div>
      <div className="portrait-editor-canvas" ref={canvasRef}>
        <SketchSurface
          capabilities={overlayRequested
            ? { kind: "readonly", tools: [], fingerDrawing: false, pressure: false }
            : { kind: "ipad", tools: ["pen", "eraser"], fingerDrawing: penSettings.fingerDrawing !== false, pressure: true }}
          documentId={PROFILE_PORTRAIT_DOCUMENT_ID}
          penColor={penSettings.color}
          penNib={penSettings.nib}
          penOpacity={penSettings.opacity}
          penWidth={penSettings.width}
          ref={sketchRef}
          repository={sketchRepository}
          tool={tool}
        />
        {overlayActive ? null : (
          <NativeSketchPreview documentId={PROFILE_PORTRAIT_DOCUMENT_ID} />
        )}
      </div>
      {penHudOpen ? (
        <>
          <button aria-label="Close pen settings" className="pen-hud-backdrop portrait-pen-backdrop" onClick={closePenSettings} type="button" />
          <PenSettingsHud onChange={setPenSettings} onDone={closePenSettings} settings={penSettings} />
        </>
      ) : null}
    </section>
  );
}
