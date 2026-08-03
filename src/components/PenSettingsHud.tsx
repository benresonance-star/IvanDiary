import type { CSSProperties } from "react";

const INK_COLOURS = [
  { name: "Black", value: "#171410" },
  { name: "Blue", value: "#245b8a" },
  { name: "Green", value: "#426b3a" },
  { name: "Red", value: "#9b352f" },
  { name: "Purple", value: "#6b4f82" },
  { name: "Brown", value: "#76512f" },
  { name: "Orange", value: "#c86f24" },
  { name: "Grey", value: "#686868" },
] as const;

export type PenSettings = {
  color: string;
  width: number;
};

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
  const colours = simpleMode ? INK_COLOURS.slice(0, 6) : INK_COLOURS;
  const sampleStyle = {
    "--sample-colour": settings.color,
    "--sample-width": `${Math.max(2, settings.width)}px`,
  } as CSSProperties;

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
      <div aria-label="Pen colours" className="pen-colour-palette" role="group">
        {colours.map((colour) => (
          <button
            aria-label={colour.name}
            aria-pressed={settings.color === colour.value}
            className="pen-colour-swatch"
            key={colour.value}
            onClick={() =>
              onChange({ ...settings, color: colour.value })
            }
            style={{ backgroundColor: colour.value }}
            type="button"
          />
        ))}
      </div>
      <label className="pen-width-control">
        <span>Thickness</span>
        <input
          aria-label="Pen thickness"
          max="14"
          min="1"
          onChange={(event) =>
            onChange({
              ...settings,
              width: Number(event.target.value),
            })
          }
          step="0.5"
          type="range"
          value={settings.width}
        />
      </label>
      {simpleMode ? (
        <div aria-label="Quick pen thickness" className="pen-width-presets" role="group">
          {[
            { label: "Thin", width: 2.5 },
            { label: "Medium", width: 5 },
            { label: "Thick", width: 9 },
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
