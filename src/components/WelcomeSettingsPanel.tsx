import { BookHeart, Play } from "lucide-react";

import type { WelcomeCopy } from "./WelcomeScreen";

export const DEFAULT_GREETING = "Welcome back Ivan!";
export const DEFAULT_TAGLINE = "It's a Wonderful World!";

type WelcomeField = "welcomeGreeting" | "welcomeTagline" | "welcomeMessage";

export function WelcomeSettingsPanel({
  greeting,
  message,
  onGreetingChange,
  onMessageChange,
  onPreviewWelcome,
  onSaveText,
  onTaglineChange,
  tagline,
}: {
  greeting: string;
  message: string;
  onGreetingChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onPreviewWelcome: (copy: WelcomeCopy) => void;
  onSaveText: (field: WelcomeField, value: string) => void;
  onTaglineChange: (value: string) => void;
  tagline: string;
}) {
  return (
    <div
      aria-labelledby="settings-tab-welcome"
      className="setting-group welcome-setting-group"
      id="settings-panel-welcome"
      role="tabpanel"
    >
      <BookHeart aria-hidden="true" />
      <div>
        <h2>Welcome screen</h2>
        <p className="setting-description">
          Choose what you want to see on the Welcome screen.
        </p>
        <div className="welcome-setting-fields">
          <label>
            Greeting
            <input
              maxLength={100}
              onBlur={() => onSaveText("welcomeGreeting", greeting)}
              onChange={(event) => onGreetingChange(event.target.value)}
              value={greeting}
            />
          </label>
          <label>
            Second line
            <input
              maxLength={140}
              onBlur={() => onSaveText("welcomeTagline", tagline)}
              onChange={(event) => onTaglineChange(event.target.value)}
              value={tagline}
            />
          </label>
          <label>
            Personal message or Bible verse
            <textarea
              maxLength={500}
              onBlur={() => onSaveText("welcomeMessage", message)}
              onChange={(event) => onMessageChange(event.target.value)}
              placeholder="Optional"
              rows={3}
              value={message}
            />
          </label>
          <button
            className="preview-welcome-action"
            onClick={() =>
              onPreviewWelcome({
                greeting: greeting.trim() || DEFAULT_GREETING,
                tagline: tagline.trim() || DEFAULT_TAGLINE,
                message: message.trim(),
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
  );
}
