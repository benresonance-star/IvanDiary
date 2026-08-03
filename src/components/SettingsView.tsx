import { useState } from "react";
import {
  BookHeart,
  Check,
  Contrast,
  Eye,
  Play,
  Text,
  WandSparkles,
} from "lucide-react";

import type {
  DocumentOperationInput,
  JournalSettings,
} from "../domain/models";
import type { WelcomeCopy } from "./WelcomeScreen";

const DEFAULT_GREETING = "Welcome back Ivan!";
const DEFAULT_TAGLINE = "It's a Wonderful World!";

function SettingToggle({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-pressed={checked}
      className="setting-row"
      onClick={() => onChange(!checked)}
      type="button"
    >
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className={checked ? "setting-check checked" : "setting-check"}>
        {checked ? <Check aria-hidden="true" /> : null}
      </span>
    </button>
  );
}

export function SettingsView({
  settings,
  commit,
  onPreviewWelcome,
}: {
  settings: JournalSettings;
  commit: (operation: DocumentOperationInput) => void;
  onPreviewWelcome: (copy: WelcomeCopy) => void;
}) {
  const [welcomeGreeting, setWelcomeGreeting] = useState(
    settings.welcomeGreeting,
  );
  const [welcomeTagline, setWelcomeTagline] = useState(
    settings.welcomeTagline,
  );
  const [welcomeMessage, setWelcomeMessage] = useState(
    settings.welcomeMessage,
  );

  const saveWelcomeText = (
    field: "welcomeGreeting" | "welcomeTagline" | "welcomeMessage",
    value: string,
  ) => {
    const cleaned =
      field === "welcomeMessage"
        ? value.trim()
        : value.trim() ||
          (field === "welcomeGreeting" ? DEFAULT_GREETING : DEFAULT_TAGLINE);
    if (field === "welcomeGreeting") {
      setWelcomeGreeting(cleaned);
    } else if (field === "welcomeTagline") {
      setWelcomeTagline(cleaned);
    } else {
      setWelcomeMessage(cleaned);
    }
    if (cleaned !== settings[field]) {
      commit({ type: "settings-update", settings: { [field]: cleaned } });
    }
  };

  return (
    <section className="library-view" aria-labelledby="settings-heading">
      <header className="library-heading">
        <div>
          <p className="eyebrow">Make the diary comfortable</p>
          <h1 id="settings-heading">Settings</h1>
        </div>
        <Eye aria-hidden="true" />
      </header>

      <div className="settings-panel">
        <div className="setting-group welcome-setting-group">
          <BookHeart aria-hidden="true" />
          <div>
            <h2>Welcome screen</h2>
            <p className="setting-description">
              Choose what Ivan sees when the diary opens.
            </p>
            <div className="welcome-setting-fields">
              <label>
                Greeting
                <input
                  maxLength={100}
                  onBlur={() =>
                    saveWelcomeText("welcomeGreeting", welcomeGreeting)
                  }
                  onChange={(event) =>
                    setWelcomeGreeting(event.target.value)
                  }
                  value={welcomeGreeting}
                />
              </label>
              <label>
                Second line
                <input
                  maxLength={140}
                  onBlur={() =>
                    saveWelcomeText("welcomeTagline", welcomeTagline)
                  }
                  onChange={(event) =>
                    setWelcomeTagline(event.target.value)
                  }
                  value={welcomeTagline}
                />
              </label>
              <label>
                Personal message or Bible verse
                <textarea
                  maxLength={500}
                  onBlur={() =>
                    saveWelcomeText("welcomeMessage", welcomeMessage)
                  }
                  onChange={(event) =>
                    setWelcomeMessage(event.target.value)
                  }
                  placeholder="Optional"
                  rows={3}
                  value={welcomeMessage}
                />
              </label>
              <button
                className="preview-welcome-action"
                onClick={() =>
                  onPreviewWelcome({
                    greeting: welcomeGreeting.trim() || DEFAULT_GREETING,
                    tagline: welcomeTagline.trim() || DEFAULT_TAGLINE,
                    message: welcomeMessage.trim(),
                  })
                }
                type="button"
              >
                <Play aria-hidden="true" />
                Preview welcome screen
              </button>
            </div>
          </div>
        </div>

        <div className="setting-group">
          <WandSparkles aria-hidden="true" />
          <div>
            <h2>Simple controls</h2>
            <SettingToggle
              checked={settings.simpleMode}
              description="Keep advanced choices out of the main diary."
              label="Simple mode"
              onChange={(simpleMode) =>
                commit({ type: "settings-update", settings: { simpleMode } })
              }
            />
          </div>
        </div>

        <div className="setting-group">
          <Text aria-hidden="true" />
          <div>
            <h2>Text size</h2>
            <div className="segmented-setting" aria-label="Text size">
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
          </div>
        </div>

        <div className="setting-group">
          <Contrast aria-hidden="true" />
          <div>
            <h2>Appearance</h2>
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
      </div>
    </section>
  );
}
