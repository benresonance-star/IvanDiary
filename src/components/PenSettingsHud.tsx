import { Pipette } from "lucide-react";
import { useState, type CSSProperties } from "react";

import {
  clampOpacity,
  colourWithOpacity,
  hexToHsl,
  hslToHex,
  isHexColor,
} from "../utils/colour";

const INK_COLOURS = [
  { name: "Black", value: "#171410" },
  { name: "Blue", value: "#245b8a" },
  { name: "Green", value: "#426b3a" },
  { name: "Red", value: "#9b352f" },
  { name: "Purple", value: "#6b4f82" },
  { name: "Brown", value: "#76512f" },
  { name: "Orange", value: "#c86f24" },
  { name: "Teal", value: "#2f6f6d" },
  { name: "Rose", value: "#a64b6b" },
  { name: "Grey", value: "#686868" },
] as const;

export const PEN_WIDTH_MIN = 1;
export const PEN_WIDTH_MAX = 28;

export type PenSettings = {
  color: string;
  width: number;
  opacity: number;
};

function clampWidth(value: number): number {
  if (!Number.isFinite(value)) {
    return 4.2;
  }
  return Math.min(PEN_WIDTH_MAX, Math.max(PEN_WIDTH_MIN, value));
}

export function PenSettingsHud({
  onChange,
  onDone,
  settings,
  simpleMode,
}: {
  onChange: (settings: PenSettings) => void;
  onDone: () => void;
  settings: PenSettings;
  simpleMode: boolean;
}) {
  const swatchSelected = INK_COLOURS.some(
    (colour) => colour.value === settings.color,
  );
  const [pickerOpen, setPickerOpen] = useState(!swatchSelected);
  const hsl = hexToHsl(isHexColor(settings.color) ? settings.color : "#171410");
  const opacityPercent = Math.round(clampOpacity(settings.opacity) * 100);
  const sampleStyle = {
    "--sample-colour": colourWithOpacity(settings.color, settings.opacity),
    "--sample-width": `${Math.max(2, Math.min(settings.width, 28))}px`,
  } as CSSProperties;

  const setHsl = (next: { h?: number; s?: number; l?: number }) => {
    onChange({
      ...settings,
      color: hslToHex(next.h ?? hsl.h, next.s ?? hsl.s, next.l ?? hsl.l),
    });
  };

  return (
    <div
      aria-label="Draw colour and thickness"
      aria-modal="true"
      className="pen-settings-hud"
      role="dialog"
    >
      <div className="pen-hud-heading">
        <strong>Pen</strong>
        <button onClick={onDone} type="button">
          Done
        </button>
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
          {INK_COLOURS.map((colour) => (
            <button
              aria-label={colour.name}
              aria-pressed={settings.color === colour.value}
              className="pen-colour-swatch"
              key={colour.value}
              onClick={() => {
                setPickerOpen(false);
                onChange({ ...settings, color: colour.value });
              }}
              style={{ backgroundColor: colour.value }}
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
            onChange({
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
            onChange({
              ...settings,
              opacity: clampOpacity(Number(event.target.value) / 100),
            })
          }
          step="1"
          type="range"
          value={opacityPercent}
        />
      </label>

      {simpleMode ? (
        <div
          aria-label="Quick pen thickness"
          className="pen-width-presets"
          role="group"
        >
          {[
            { label: "Thin", width: 2.5 },
            { label: "Medium", width: 8 },
            { label: "Thick", width: 18 },
          ].map((preset) => (
            <button
              aria-pressed={settings.width === preset.width}
              key={preset.label}
              onClick={() =>
                onChange({ ...settings, width: preset.width })
              }
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>
      ) : null}

      <div aria-label="Pen preview" className="pen-sample" style={sampleStyle}>
        <span />
      </div>
    </div>
  );
}
