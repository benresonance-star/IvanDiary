import { Eraser, Highlighter, Paintbrush, PenLine, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { DocumentOperationInput, JournalSettings } from "../domain/models";
import { useNativeDrawingOverlay } from "../hooks/useNativeDrawingOverlay";
import { clearNativeDrawingOverlay, hasNativePencilKit } from "../native/pencilKit";
import { NativeSketchPreview } from "../sketch/NativeSketchPreview";
import { CANVAS_TEST_DOCUMENT_ID } from "../sketch/specialDocuments";
import { SKETCH_SCHEMA_VERSION, type PenNib, type SketchRepository, type SketchTool } from "../sketch/types";
import { clampOpacity, hexToHsl, hslToHex } from "../utils/colour";
import { SketchSurface } from "../sketch/SketchSurface";
import { favouriteColourName } from "./penColours";
import { PEN_WIDTH_MAX, PEN_WIDTH_MIN } from "./PenSettingsHud";

const NIBS = [
  { id: "pen", label: "Pen", Icon: PenLine },
  { id: "marker", label: "Marker", Icon: Highlighter },
  { id: "pencil", label: "Pencil", Icon: Pencil },
  { id: "brush", label: "Brush", Icon: Paintbrush },
] as const;

export function CanvasSettingsPanel({
  commit,
  settings,
  sketchRepository,
}: {
  commit: (operation: DocumentOperationInput) => void;
  settings: JournalSettings;
  sketchRepository: SketchRepository;
}) {
  const initialIndex = Math.max(0, settings.favouritePenColours.indexOf(settings.penColor));
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [colours, setColours] = useState(settings.favouritePenColours);
  const [colour, setColour] = useState(colours[initialIndex] ?? settings.penColor);
  const [nib, setNib] = useState<PenNib>(settings.penNib);
  const [tool, setTool] = useState<SketchTool>("pen");
  const [penWidth, setPenWidth] = useState(settings.penWidth);
  const [penOpacity, setPenOpacity] = useState(settings.penOpacity);
  const [canvasVersion, setCanvasVersion] = useState(0);
  const inkSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const hsl = hexToHsl(colour);

  const { overlayActive, overlayRequested } = useNativeDrawingOverlay({
    documentId: CANVAS_TEST_DOCUMENT_ID,
    enabled: hasNativePencilKit(),
    tool,
    color: colour,
    nib,
    width: penWidth,
    opacity: penOpacity,
    fingerDrawing: settings.fingerDrawingEnabled,
    paperRef: canvasRef,
    toolPaletteRef: toolsRef,
    sketchRepository,
  });

  useEffect(() => () => {
    if (inkSaveTimerRef.current) clearTimeout(inkSaveTimerRef.current);
  }, []);

  const saveColour = (nextColour: string) => {
    const nextColours = colours.map((candidate, index) =>
      index === selectedIndex ? nextColour : candidate,
    );
    setColour(nextColour);
    setColours(nextColours);
    commit({
      type: "settings-update",
      settings: {
        favouritePenColours: nextColours,
        penColor: nextColour,
        penNibProfiles: Object.fromEntries(
          (["pen", "marker", "pencil", "brush"] as PenNib[]).map((profileNib) => [
            profileNib,
            { color: nextColour, width: settings.penWidth, opacity: settings.penOpacity },
          ]),
        ) as JournalSettings["penNibProfiles"],
      },
    });
  };

  const setHsl = (next: { h?: number; s?: number; l?: number }) => {
    saveColour(hslToHex(next.h ?? hsl.h, next.s ?? hsl.s, next.l ?? hsl.l));
  };

  const saveInkSettings = (width: number, opacity: number) => {
    commit({
      type: "settings-update",
      settings: {
        penWidth: width,
        penOpacity: opacity,
        penNibProfiles: Object.fromEntries(
          (["pen", "marker", "pencil", "brush"] as PenNib[]).map((profileNib) => [
            profileNib,
            { color: colour, width, opacity },
          ]),
        ) as JournalSettings["penNibProfiles"],
      },
    });
  };

  const updateInkSettings = (width: number, opacity: number) => {
    setPenWidth(width);
    setPenOpacity(opacity);
    if (inkSaveTimerRef.current) clearTimeout(inkSaveTimerRef.current);
    inkSaveTimerRef.current = setTimeout(() => {
      saveInkSettings(width, opacity);
      inkSaveTimerRef.current = null;
    }, 150);
  };

  const clearTestCanvas = async () => {
    const document = await sketchRepository.load(CANVAS_TEST_DOCUMENT_ID);
    await sketchRepository.save({
      ...document,
      schemaVersion: SKETCH_SCHEMA_VERSION,
      strokes: [],
      revision: document.revision + 1,
    });
    if (overlayActive) {
      await clearNativeDrawingOverlay(CANVAS_TEST_DOCUMENT_ID);
    }
    setCanvasVersion((current) => current + 1);
  };

  return (
    <div className="canvas-settings-content">
      <h2>Canvas</h2>
      <p className="setting-description">Choose ten favourite drawing colours and try them below.</p>

      <section aria-labelledby="favourite-colours-heading" className="canvas-colour-editor">
        <h3 id="favourite-colours-heading">My favourite colours</h3>
        <p className="canvas-colour-instructions">
          Select one of the round colour swatches then move the sliders to change it to one of your favourite colours
        </p>
        <div aria-label="Favourite pen colours" className="canvas-favourite-colours" role="group">
          {colours.map((candidate, index) => (
            <button
              aria-label={favouriteColourName(index)}
              aria-pressed={selectedIndex === index}
              className="canvas-colour-swatch"
              key={index}
              onClick={() => {
                setSelectedIndex(index);
                setColour(candidate);
                commit({ type: "settings-update", settings: { penColor: candidate } });
              }}
              style={{ backgroundColor: candidate }}
              type="button"
            />
          ))}
        </div>

        <div className="canvas-colour-sliders">
          <label className="pen-width-control">Hue {Math.round(hsl.h)}°<input aria-label="Canvas colour hue" max="360" min="0" onChange={(event) => setHsl({ h: Number(event.target.value) })} step="1" type="range" value={Math.round(hsl.h)} /></label>
          <label className="pen-width-control">Colour strength {Math.round(hsl.s)}%<input aria-label="Canvas colour strength" max="100" min="0" onChange={(event) => setHsl({ s: Number(event.target.value) })} step="1" type="range" value={Math.round(hsl.s)} /></label>
          <label className="pen-width-control">Lightness {Math.round(hsl.l)}%<input aria-label="Canvas colour lightness" max="100" min="0" onChange={(event) => setHsl({ l: Number(event.target.value) })} step="1" type="range" value={Math.round(hsl.l)} /></label>
        </div>
        <div aria-label="Selected colour preview" className="canvas-large-colour-preview" role="img" style={{ backgroundColor: colour }} />
      </section>

      <section aria-labelledby="test-canvas-heading" className="canvas-test-section">
        <div className="canvas-test-heading">
          <div><h3 id="test-canvas-heading">Test sketch canvas</h3><p>Try the selected colour and nib here.</p></div>
          <button onClick={() => void clearTestCanvas()} type="button"><Trash2 aria-hidden="true" />Clear</button>
        </div>
        <div aria-label="Test canvas tools" className="canvas-test-tools" ref={toolsRef} role="toolbar">
          {NIBS.map(({ id, label, Icon }) => (
            <button aria-pressed={tool === "pen" && nib === id} key={id} onClick={() => { setNib(id); setTool("pen"); }} type="button"><Icon aria-hidden="true" />{label}</button>
          ))}
          <button aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")} type="button"><Eraser aria-hidden="true" />Erase</button>
        </div>
        <div className="canvas-test-ink-controls">
          <label className="pen-width-control">
            <span>Thickness</span>
            <input
              aria-label="Test pen thickness"
              max={PEN_WIDTH_MAX}
              min={PEN_WIDTH_MIN}
              onChange={(event) =>
                updateInkSettings(Number(event.target.value), penOpacity)
              }
              step="0.5"
              type="range"
              value={penWidth}
            />
          </label>
          <label className="pen-width-control">
            <span>Opacity {Math.round(clampOpacity(penOpacity) * 100)}%</span>
            <input
              aria-label="Test pen opacity"
              max="100"
              min="5"
              onChange={(event) =>
                updateInkSettings(
                  penWidth,
                  clampOpacity(Number(event.target.value) / 100),
                )
              }
              step="1"
              type="range"
              value={Math.round(clampOpacity(penOpacity) * 100)}
            />
          </label>
        </div>
        <div className="canvas-test-surface" ref={canvasRef}>
          <SketchSurface
            capabilities={overlayRequested
              ? { kind: "readonly", tools: [], fingerDrawing: false, pressure: false }
              : { kind: "ipad", tools: ["pen", "eraser"], fingerDrawing: settings.fingerDrawingEnabled, pressure: true }}
            documentId={CANVAS_TEST_DOCUMENT_ID}
            key={canvasVersion}
            penColor={colour}
            penNib={nib}
            penOpacity={penOpacity}
            penWidth={penWidth}
            repository={sketchRepository}
            tool={tool}
          />
          {overlayActive ? null : <NativeSketchPreview documentId={CANVAS_TEST_DOCUMENT_ID} />}
        </div>
      </section>
    </div>
  );
}
