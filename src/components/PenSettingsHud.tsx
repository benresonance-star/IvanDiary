import { Grid3X3, Hand, Highlighter, Paintbrush, PenLine, Pencil, Pipette } from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";

import {
  clampOpacity,
  colourWithOpacity,
  hexToHsl,
  hslToHex,
  isHexColor,
} from "../utils/colour";
import type { DrawingGridSettings } from "../domain/models";
import type { PenNib } from "../sketch/types";
import { DEFAULT_FAVOURITE_PEN_COLOURS, favouriteColourName } from "./penColours";


export const PEN_WIDTH_MIN = 1;
export const PEN_WIDTH_MAX = 28;
const GRID_SIZES = [36, 60, 96] as const;
const GRID_SIZE_NAMES = ["Small", "Medium", "Large"] as const;
const ROTATION_LONG_PRESS_MS = 600;

export type PenSettings = {
  color: string;
  width: number;
  opacity: number;
  fingerDrawing?: boolean;
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
}: {
  grid?: DrawingGridSettings;
  onChange: (settings: PenSettings) => void;
  onDone: () => void;
  onGridChange?: (grid: DrawingGridSettings) => void;
  settings: PenSettings;
}) {
  const inkColours = settings.favouriteColours ?? DEFAULT_FAVOURITE_PEN_COLOURS;
  const swatchSelected = inkColours.includes(settings.color);
  const activeNib = settings.nib ?? "pen";
  const [pickerOpen, setPickerOpen] = useState(!swatchSelected);
  const rotationTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const rotationLongPressedRef = useRef(false);
  const hsl = hexToHsl(isHexColor(settings.color) ? settings.color : "#171410");
  const opacityPercent = Math.round(clampOpacity(settings.opacity) * 100);
  const sampleStyle = {
    "--sample-colour": colourWithOpacity(settings.color, settings.opacity),
    "--sample-width": `${Math.max(2, Math.min(settings.width, 28))}px`,
  } as CSSProperties;

  const setHsl = (next: { h?: number; s?: number; l?: number }) => {
    changeSettings({
      ...settings,
      color: hslToHex(next.h ?? hsl.h, next.s ?? hsl.s, next.l ?? hsl.l),
    });
  };

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

  const cycleGridSize = () => {
    if (!grid || !onGridChange) return;
    const currentIndex = GRID_SIZES.indexOf(grid.spacing);
    const nextIndex = (currentIndex + 1) % GRID_SIZES.length;
    onGridChange({ ...grid, spacing: GRID_SIZES[nextIndex] ?? GRID_SIZES[0] });
  };

  const cycleGridRotation = () => {
    if (!grid || !onGridChange) return;
    if (rotationLongPressedRef.current) {
      rotationLongPressedRef.current = false;
      return;
    }
    const nextRotation = grid.rotationDegrees >= 75
      ? 0
      : grid.rotationDegrees + 15;
    onGridChange({ ...grid, rotationDegrees: nextRotation });
  };

  const startRotationReset = () => {
    if (!grid || !onGridChange) return;
    rotationLongPressedRef.current = false;
    rotationTimerRef.current = setTimeout(() => {
      rotationLongPressedRef.current = true;
      onGridChange({ ...grid, rotationDegrees: 0 });
    }, ROTATION_LONG_PRESS_MS);
  };

  const cancelRotationReset = () => {
    if (rotationTimerRef.current !== undefined) {
      clearTimeout(rotationTimerRef.current);
      rotationTimerRef.current = undefined;
    }
  };

  return (
    <div
      aria-label="Draw colour and thickness"
      aria-modal="true"
      className="pen-settings-hud"
      role="dialog"
    >
      <div className="pen-hud-heading">
        <div className="pen-hud-title">
          <PenLine aria-hidden="true" />
          <strong>Pen</strong>
        </div>
        <button onClick={onDone} type="button">
          Done
        </button>
      </div>
      <button
        aria-checked={settings.fingerDrawing !== false}
        className={`finger-toggle${settings.fingerDrawing !== false ? " selected" : ""}`}
        onClick={() => changeSettings({
          ...settings,
          fingerDrawing: settings.fingerDrawing === false,
        })}
        role="switch"
        type="button"
      >
        <Hand aria-hidden="true" />
        <span>Draw with Finger</span>
        <span aria-hidden="true" className="grid-switch-track"><span /></span>
        <strong>{settings.fingerDrawing !== false ? "On" : "Off"}</strong>
      </button>

      <div aria-label="Pen nib" className="pen-nib-selector" role="group">
        {NIBS.map(({ id, label, Icon }) => (
          <button
            aria-pressed={activeNib === id}
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
        <button
          aria-expanded={pickerOpen}
          aria-label="Custom colour"
          aria-pressed={!swatchSelected || pickerOpen}
          className="pen-custom-colour"
          onClick={() => setPickerOpen((current) => !current)}
          style={{ backgroundColor: settings.color }}
          type="button"
        >
          <Pipette aria-hidden="true" />
          <span>Custom</span>
        </button>

        <div
          aria-label="Pen colours"
          className="pen-colour-palette"
          role="group"
        >
          {inkColours.map((colour, index) => (
            <button
              aria-label={favouriteColourName(index)}
              aria-pressed={settings.color === colour}
              className="pen-colour-swatch"
              key={`${index}-${colour}`}
              onClick={() => {
                setPickerOpen(false);
                changeSettings({ ...settings, color: colour });
              }}
              style={{ backgroundColor: colour }}
              type="button"
            />
          ))}
        </div>
      </div>

      {pickerOpen ? (
        <div
          aria-label="Custom colour picker"
          className="pen-colour-picker"
          role="group"
        >
          <p className="pen-colour-picker-help">
            Use the large sliders below. No fine dragging needed.
          </p>
          <div
            aria-hidden="true"
            className="pen-colour-picker-preview"
            style={{ backgroundColor: settings.color }}
          />
          <label className="pen-width-control">
            <span>Hue {Math.round(hsl.h)}°</span>
            <input
              aria-label="Hue"
              max="360"
              min="0"
              onChange={(event) =>
                setHsl({ h: Number(event.target.value) })
              }
              step="1"
              type="range"
              value={Math.round(hsl.h)}
            />
          </label>
          <label className="pen-width-control">
            <span>Colour strength {Math.round(hsl.s)}%</span>
            <input
              aria-label="Colour strength"
              max="100"
              min="0"
              onChange={(event) =>
                setHsl({ s: Number(event.target.value) })
              }
              step="1"
              type="range"
              value={Math.round(hsl.s)}
            />
          </label>
          <label className="pen-width-control">
            <span>Lightness {Math.round(hsl.l)}%</span>
            <input
              aria-label="Lightness"
              max="100"
              min="0"
              onChange={(event) =>
                setHsl({ l: Number(event.target.value) })
              }
              step="1"
              type="range"
              value={Math.round(hsl.l)}
            />
          </label>
        </div>
      ) : null}

      <label className="pen-width-control">
        <span>Thickness</span>
        <input
          aria-label="Pen thickness"
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

      <div aria-label="Pen preview" className="pen-sample" style={sampleStyle}>
        <span />
      </div>

      {grid && onGridChange ? (
        <section className="grid-settings" aria-labelledby="grid-settings-heading">
          <div className="grid-settings-heading">
            <Grid3X3 aria-hidden="true" />
            <strong id="grid-settings-heading">Drawing grid</strong>
          </div>
          <button
            aria-checked={grid.enabled}
            className={`grid-toggle${grid.enabled ? " selected" : ""}`}
            onClick={() => onGridChange({ ...grid, enabled: !grid.enabled })}
            role="switch"
            type="button"
          >
            <span>Grid</span>
            <span aria-hidden="true" className="grid-switch-track">
              <span />
            </span>
            <strong>{grid.enabled ? "On" : "Off"}</strong>
          </button>
          {grid.enabled ? (
            <div className="grid-cycle-controls">
              <button onClick={cycleGridSize} type="button">
                Grid size: {GRID_SIZE_NAMES[GRID_SIZES.indexOf(grid.spacing)]}
              </button>
              <button
                onClick={cycleGridRotation}
                onPointerCancel={cancelRotationReset}
                onPointerDown={startRotationReset}
                onPointerLeave={cancelRotationReset}
                onPointerUp={cancelRotationReset}
                type="button"
              >
                Grid rotation: {grid.rotationDegrees}°
                <small>Hold to straighten</small>
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

    </div>
  );
}
