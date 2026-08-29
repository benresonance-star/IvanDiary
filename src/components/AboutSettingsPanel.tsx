import type { RefObject } from "react";
import { Mic, UserRound } from "lucide-react";

import type { RecordingSnapshot } from "../native/contracts";
import type { SketchRepository } from "../sketch/types";
import { ProfilePortrait } from "./ProfilePortrait";

export function AboutSettingsPanel({
  displayName,
  displayNameInputRef,
  nameRecording,
  nameStatus,
  onDisplayNameChange,
  onEditPortrait,
  onSaveDisplayName,
  onToggleSpokenName,
  sketchRepository,
}: {
  displayName: string;
  displayNameInputRef: RefObject<HTMLInputElement | null>;
  nameRecording?: RecordingSnapshot;
  nameStatus?: string;
  onDisplayNameChange: (name: string) => void;
  onEditPortrait: () => void;
  onSaveDisplayName: (name: string) => void;
  onToggleSpokenName: () => void;
  sketchRepository: SketchRepository;
}) {
  return (
    <div
      aria-labelledby="settings-tab-about"
      className="setting-group about-me-setting-group"
      id="settings-panel-about"
      role="tabpanel"
    >
      <UserRound aria-hidden="true" />
      <div>
        <h2>About Me</h2>
        <p className="setting-description">
          Please write your name and draw your portrait.
        </p>
        <div className="display-name-controls">
          <label className="display-name-setting">
            My Name
            <input
              autoCapitalize="words"
              enterKeyHint="done"
              inputMode="text"
              maxLength={60}
              onBlur={() => onSaveDisplayName(displayName)}
              onChange={(event) => onDisplayNameChange(event.target.value)}
              ref={displayNameInputRef}
              type="text"
              value={displayName}
            />
          </label>
          <button
            aria-pressed={nameRecording?.state === "recording"}
            className={`speak-name-button${
              nameRecording?.state === "recording" ? " recording" : ""
            }`}
            disabled={nameRecording?.state === "finalising"}
            onClick={onToggleSpokenName}
            type="button"
          >
            <Mic aria-hidden="true" />
            {nameRecording?.state === "recording" ||
            nameRecording?.state === "interrupted"
              ? "Stop and use my name"
              : nameRecording?.state === "finalising"
                ? "Saving your name…"
                : "Speak your name"}
          </button>
        </div>
        <p aria-live="polite" className="speak-name-status" role="status">
          {nameStatus}
        </p>
        <div className="portrait-setting">
          <ProfilePortrait sketchRepository={sketchRepository} />
          <div>
            <h3>My portrait</h3>
            <p>Draw a picture of your face. It will appear beside your name.</p>
            <button onClick={onEditPortrait} type="button">
              Draw or edit my portrait
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
