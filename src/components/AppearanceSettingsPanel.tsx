import { Contrast, Text } from "lucide-react";

import type {
  DocumentOperationInput,
  JournalSettings,
} from "../domain/models";
import { SettingToggle } from "./SettingToggle";

export function AppearanceSettingsPanel({
  commit,
  settings,
}: {
  commit: (operation: DocumentOperationInput) => void;
  settings: JournalSettings;
}) {
  return (
    <div
      aria-labelledby="settings-tab-appearance"
      className="setting-group"
      id="settings-panel-appearance"
      role="tabpanel"
    >
      <Contrast aria-hidden="true" />
      <div>
        <h2>Appearance</h2>
        <section
          aria-labelledby="appearance-text-size-heading"
          className="appearance-setting-section"
        >
          <h3 id="appearance-text-size-heading">
            <Text aria-hidden="true" />
            Text size
          </h3>
          <div aria-label="Text size" className="segmented-setting">
            {(["standard", "large", "extra-large"] as const).map((scale) => (
              <button
                aria-pressed={settings.textScale === scale}
                key={scale}
                onClick={() =>
                  commit({
                    type: "settings-update",
                    settings: { textScale: scale },
                  })
                }
                type="button"
              >
                {scale === "standard"
                  ? "Standard"
                  : scale === "large"
                    ? "Large"
                    : "Extra large"}
              </button>
            ))}
          </div>
        </section>
        <SettingToggle
          checked={settings.contrast === "high"}
          description="Use stronger borders and darker text."
          label="High contrast"
          onChange={(highContrast) =>
            commit({
              type: "settings-update",
              settings: { contrast: highContrast ? "high" : "warm" },
            })
          }
        />
        <SettingToggle
          checked={settings.reducedMotion}
          description="Stop decorative movement and animation."
          label="Reduce motion"
          onChange={(reducedMotion) =>
            commit({
              type: "settings-update",
              settings: { reducedMotion },
            })
          }
        />
      </div>
    </div>
  );
}
