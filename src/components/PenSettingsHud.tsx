import { Grid3X3, Highlighter, Paintbrush, PenLine, Pencil } from "lucide-react";
import { useState, type CSSProperties } from "react";

import {
  clampOpacity,
  colourWithOpacity,
} from "../utils/colour";
import type { DrawingGridSettings } from "../domain/models";
import type { PenNib } from "../sketch/types";
import { DEFAULT_FAVOURITE_PEN_COLOURS, favouriteColourName } from "./penColours";


export const PEN_WIDTH_MIN = 1;
export const PEN_WIDTH_MAX = 28;
const GRID_SIZES = [36, 60, 96] as const;
const GRID_SIZE_NAMES = ["Small", "Medium", "Large"] as const;
const GRID_ROTATIONS = [0, 15, 30, 45, 60, 75] as const;

export type PenSettings = {
  color: string;
  width: number;
  opacity: number;
  fingerDrawing?: boolean;
  fingerErasing?: boolean;
  nib?: PenNib;
  profiles?: Record<PenNib, { color: string; width: number; opacity: number }>;
  favouriteColours?: readonly string[];
};

const NIBS = [
  { id: "pen", label: "Pen", Icon: PenLine },
  { id: "marker", label: "Marker", Icon: Highlighter },
  { id: "pencil", label: "Pencil", Icon: Pencil },
  { id: "brush", label: "Brush", Icon: Paintbrush },
] as const;

function clampWidth(value: number): number {
  if (!Number.isFinite(value)) {
    return 4.2;
  }
  return Math.min(PEN_WIDTH_MAX, Math.max(PEN_WIDTH_MIN, value));
}

export function PenSettingsHud({
  grid,
  onChange,
  onDone,
  onGridChange,
  settings,
  tool = "pen",
}: {
  grid?: DrawingGridSettings;
  onChange: (settings: PenSettings) => void;
  onDone: () => void;
  onGridChange?: (grid: DrawingGridSettings) => void;
  settings: PenSettings;
  tool?: "pen" | "eraser";
}) {
  const inkColours = settings.favouriteColours ?? DEFAULT_FAVOURITE_PEN_COLOURS;
  const swatchSelected = inkColours.includes(settings.color);
  const activeNib = settings.nib ?? "pen";
  const [activePanel, setActivePanel] = useState<"pen" | "grid">("pen");
  const opacityPercent = Math.round(clampOpacity(settings.opacity) * 100);
  const sampleStyle = {
    "--sample-colour": colourWithOpacity(settings.color, settings.opacity),
    "--sample-width": `${Math.max(2, Math.min(settings.width, 28))}px`,
  } as CSSProperties;
  const fingerDrawingActive = settings.fingerDrawing !== false;
  const fingerErasingActive = settings.fingerErasing === true;

  function changeSettings(next: PenSettings) {
    const nib = next.nib ?? activeNib;
    const profiles = Object.fromEntries(
      (["pen", "marker", "pencil", "brush"] as PenNib[]).map((profileNib) => [
        profileNib,
        { color: next.color, width: next.width, opacity: next.opacity },
      ]),
    ) as NonNullable<PenSettings["profiles"]>;
    const complete = { ...next, nib, profiles };
    onChange(complete);
  }

  return (
    <div
      aria-label={tool === "eraser" ? "Erase settings" : "Draw settings"}
      aria-modal="true"
      className="pen-settings-hud"
      role="dialog"
    >
      <div className="pen-hud-heading">
        <div className="pen-hud-title">
          {tool === "eraser" ? null : <PenLine aria-hidden="true" />}
          <strong>{tool === "eraser" ? "Erase" : "Draw"}</strong>
        </div>
        <button onClick={onDone} type="button">
          Done
        </button>
      </div>
      {tool === "pen" && grid && onGridChange ? (
        <div aria-label="Draw settings section" className="pen-panel-tabs" role="tablist">
          <button
            aria-controls="pen-settings-panel"
            aria-selected={activePanel === "pen"}
            data-help-topic="pen-tab"
            id="pen-settings-tab"
            onClick={() => setActivePanel("pen")}
            role="tab"
            type="button"
          >
            Pen
          </button>
          <button
            aria-controls="grid-settings-panel"
            aria-selected={activePanel === "grid"}
            data-help-topic="grid-tab"
            id="grid-settings-tab"
            onClick={() => setActivePanel("grid")}
            role="tab"
            type="button"
          >
            Grid
          </button>
        </div>
      ) : null}

      {tool === "eraser" ? (
        <div className="pen-settings-panel">
          <button
            aria-checked={fingerErasingActive}
            className={`finger-toggle${fingerErasingActive ? " selected" : ""}`}
            data-help-topic="finger-erasing"
            onClick={() => changeSettings({
              ...settings,
              fingerErasing: !fingerErasingActive,
            })}
            role="switch"
            type="button"
          >
            <span aria-hidden="true" className="grid-switch-track"><span /></span>
            <span>Erase with finger</span>
          </button>
        </div>
      ) : activePanel === "pen" || !grid || !onGridChange ? (
        <div
          aria-labelledby={grid ? "pen-settings-tab" : undefined}
          className="pen-settings-panel"
          id="pen-settings-panel"
          role={grid ? "tabpanel" : undefined}
        >
          <button
            aria-checked={fingerDrawingActive}
            className={`finger-toggle${fingerDrawingActive ? " selected" : ""}`}
            data-help-topic="finger-drawing"
            onClick={() => changeSettings({
              ...settings,
              fingerDrawing: settings.fingerDrawing === false,
            })}
            role="switch"
            type="button"
          >
            <span aria-hidden="true" className="grid-switch-track"><span /></span>
            <span>Draw with finger</span>
          </button>

          <div
            aria-label={`${NIBS.find(({ id }) => id === activeNib)?.label ?? "Pen"} preview`}
            className={`pen-sample nib-${activeNib}`}
            data-help-topic="pen-preview"
            style={sampleStyle}
          >
            <span />
          </div>

          <div aria-label="Pen nib" className="pen-nib-selector" role="group">
            {NIBS.map(({ id, label, Icon }) => (
              <button
                aria-pressed={activeNib === id}
                data-help-topic="pen-nib"
                key={id}
                onClick={() => {
                  changeSettings({ ...settings, nib: id });
                }}
                type="button"
              >
                <Icon aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <div className="pen-colour-layout">
            <input
              aria-label="Custom colour"
              className={`pen-custom-colour${swatchSelected ? "" : " selected"}`}
              data-help-topic="pen-colour"
              onChange={(event) =>
                changeSettings({ ...settings, color: event.target.value })
              }
              type="color"
              value={settings.color}
            />

            <div
              aria-label="Pen colours"
              className="pen-colour-palette"
              role="group"
            >
              {inkColours.map((colour, index) => (
                <span className="pen-colour-favourite" key={index}>
                  <button
                    aria-label={favouriteColourName(index)}
                    aria-pressed={settings.color === colour}
                    className="pen-colour-swatch"
                    data-help-topic="pen-colour"
                    onClick={() => changeSettings({ ...settings, color: colour })}
                    style={{ backgroundColor: colour }}
                    type="button"
                  />
                </span>
              ))}
            </div>
          </div>

          <label className="pen-width-control">
            <span>Thickness</span>
            <input
              aria-label="Pen thickness"
              data-help-topic="pen-thickness"
              max={PEN_WIDTH_MAX}
              min={PEN_WIDTH_MIN}
              onChange={(event) =>
                changeSettings({
                  ...settings,
                  width: clampWidth(Number(event.target.value)),
                })
              }
              step="0.5"
              type="range"
              value={settings.width}
            />
          </label>

          <label className="pen-width-control">
            <span>Opacity {opacityPercent}%</span>
            <input
              aria-label="Pen opacity"
              data-help-topic="pen-opacity"
              max="100"
              min="5"
              onChange={(event) =>
                changeSettings({
                  ...settings,
                  opacity: clampOpacity(Number(event.target.value) / 100),
                })
              }
              step="1"
              type="range"
              value={opacityPercent}
            />
          </label>
        </div>
      ) : (
        <section
          aria-labelledby="grid-settings-tab"
          className="grid-settings"
          id="grid-settings-panel"
          role="tabpanel"
        >
          <button
            aria-checked={grid.enabled}
            className={`grid-toggle${grid.enabled ? " selected" : ""}`}
            data-help-topic="drawing-grid"
            onClick={() => onGridChange({ ...grid, enabled: !grid.enabled })}
            role="switch"
            type="button"
          >
            <Grid3X3 aria-hidden="true" />
            <span>Drawing grid</span>
            <span aria-hidden="true" className="grid-switch-track">
              <span />
            </span>
            <strong>{grid.enabled ? "On" : "Off"}</strong>
          </button>
          {grid.enabled ? (
            <div className="grid-detail-controls">
              <button
                aria-checked={grid.snapToGrid}
                className={`grid-toggle grid-snap-toggle${grid.snapToGrid ? " selected" : ""}`}
                onClick={() =>
                  onGridChange({ ...grid, snapToGrid: !grid.snapToGrid })
                }
                role="switch"
                type="button"
              >
                <Grid3X3 aria-hidden="true" />
                <span>Snap pen to grid</span>
                <span aria-hidden="true" className="grid-switch-track">
                  <span />
                </span>
                <strong>{grid.snapToGrid ? "On" : "Off"}</strong>
              </button>
              <div aria-label="Grid size" className="grid-segmented-control" role="group">
                {GRID_SIZES.map((spacing, index) => (
                  <button
                    aria-pressed={grid.spacing === spacing}
                    data-help-topic="grid-size"
                    key={spacing}
                    onClick={() => onGridChange({ ...grid, spacing })}
                    type="button"
                  >
                    {GRID_SIZE_NAMES[index]}
                  </button>
                ))}
              </div>
              <div aria-label="Grid type" className="grid-segmented-control" role="group">
                {(["lines", "dots"] as const).map((type) => (
                  <button
                    aria-pressed={grid.type === type}
                    data-help-topic="grid-type"
                    key={type}
                    onClick={() => onGridChange({ ...grid, type })}
                    type="button"
                  >
                    {type === "lines" ? "Lines" : "Dots"}
                  </button>
                ))}
              </div>
              <label className="grid-colour-control">
                <input
                  aria-label="Grid colour"
                  data-help-topic="grid-colour"
                  onChange={(event) =>
                    onGridChange({ ...grid, color: event.target.value })
                  }
                  type="color"
                  value={grid.color}
                />
                <span>Grid colour</span>
              </label>
              <div
                aria-label="Grid rotation"
                className="grid-segmented-control grid-rotation-control"
                role="group"
              >
                {GRID_ROTATIONS.map((rotationDegrees) => (
                  <button
                    aria-pressed={grid.rotationDegrees === rotationDegrees}
                    data-help-topic="grid-rotation"
                    key={rotationDegrees}
                    onClick={() =>
                      onGridChange({ ...grid, rotationDegrees })
                    }
                    type="button"
                  >
                    {rotationDegrees}°
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      )}

    </div>
  );
}
