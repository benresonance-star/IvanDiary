import { useRef, useState } from "react";
import {
  ChevronDown,
  Eye,
  Mic,
  Palette,
} from "lucide-react";

import type {
  BackupStatus,
  BackupHistoryEntry,
  BackupHistoryStatus,
  DocumentOperationInput,
  JournalSettings,
  SettingsTabId,
} from "../domain/models";
import type {
  AppleTranscriptionPlugin,
  JournalAudioPlugin,
  JournalFilesPlugin,
  RecordingSnapshot,
} from "../native/contracts";
import { recordingStorageAvailable } from "../native/durableAudio";
import {
  EphemeralTranscriptionError,
  transcribeEphemeralRecording,
} from "../native/ephemeralTranscription";
import type { SketchRepository } from "../sketch/types";
import type { WelcomeCopy } from "./WelcomeScreen";
import { AboutSettingsPanel } from "./AboutSettingsPanel";
import { AppearanceSettingsPanel } from "./AppearanceSettingsPanel";
import { BackupSettingsPanel } from "./BackupSettingsPanel";
import { BackupHistorySettingsPanel } from "./BackupHistorySettingsPanel";
import { CanvasSettingsPanel } from "./CanvasSettingsPanel";
import { MyWordsSettingsPanel } from "./MyWordsSettingsPanel";
import { PrivacySettingsPanel } from "./PrivacySettingsPanel";
import { SettingToggle } from "./SettingToggle";
import {
  DEFAULT_GREETING,
  DEFAULT_TAGLINE,
  WelcomeSettingsPanel,
} from "./WelcomeSettingsPanel";

const SETTINGS_TABS = [
  { id: "about", label: "About Me" },
  { id: "welcome", label: "Welcome" },
  { id: "canvas", label: "Canvas" },
  { id: "voice", label: "Voice" },
  { id: "appearance", label: "Appearance" },
  { id: "backup", label: "iCloud Sync" },
  { id: "history", label: "History" },
  { id: "privacy", label: "Privacy" },
] as const;

export function SettingsView({
  settings,
  commit,
  audio,
  files,
  onEditPortrait,
  onBackupNow,
  onCheckBackup,
  onKeepThisIPad,
  onSaveLocalCopy,
  onUseICloud,
  historyStatus,
  onCreateHistory,
  onDeleteHistory,
  onDeleteCloudData,
  onRefreshHistory,
  onRestoreHistory,
  onPreviewWelcome,
  sketchRepository,
  backupStatus,
  transcription,
}: {
  settings: JournalSettings;
  commit: (operation: DocumentOperationInput) => void;
  audio: JournalAudioPlugin;
  files: JournalFilesPlugin;
  onEditPortrait: () => void;
  onBackupNow: () => void;
  onCheckBackup: () => void;
  onKeepThisIPad: () => void;
  onSaveLocalCopy: () => void;
  onUseICloud: () => void;
  historyStatus: BackupHistoryStatus;
  onCreateHistory: () => void;
  onDeleteHistory: (entry: BackupHistoryEntry) => void;
  onDeleteCloudData: () => void;
  onRefreshHistory: () => void;
  onRestoreHistory: (entry: BackupHistoryEntry) => void;
  onPreviewWelcome: (copy: WelcomeCopy) => void;
  sketchRepository: SketchRepository;
  backupStatus: BackupStatus;
  transcription: AppleTranscriptionPlugin;
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
  const [displayName, setDisplayName] = useState(settings.displayName);
  const displayNameInputRef = useRef<HTMLInputElement>(null);
  const [nameRecording, setNameRecording] = useState<RecordingSnapshot>();
  const [nameStatus, setNameStatus] = useState<string>();
  const [activeTab, setActiveTab] = useState<SettingsTabId>(settings.lastSettingsTab);

  const saveDisplayName = (name: string) => {
    const cleaned = name.trim() || "Ivan";
    setDisplayName(cleaned);
    if (cleaned !== settings.displayName) {
      commit({
        type: "settings-update",
        settings: { displayName: cleaned },
      });
    }
  };

  const toggleSpokenName = async () => {
    if (
      nameRecording?.state === "recording" ||
      nameRecording?.state === "interrupted" ||
      nameRecording?.state === "finalising"
    ) {
      try {
        setNameRecording({ ...nameRecording, state: "finalising" });
        setNameStatus("Turning your voice into your name…");
        const result = await transcribeEphemeralRecording({
          audio,
          contextualStrings: settings.myWords
            .filter((word) => word.enabled)
            .map((word) => word.text)
            .slice(0, 100),
          files,
          transcription,
        });
        const spokenName = result.rawText.trim();
        if (!spokenName) {
          setNameStatus("No name was recognised. Your typed name is unchanged.");
          return;
        }
        saveDisplayName(spokenName);
        setNameStatus(`Name saved as ${spokenName}.`);
      } catch (error) {
        if (
          error instanceof EphemeralTranscriptionError &&
          error.failure === "finalization"
        ) {
          setNameStatus("Your spoken name could not be saved. Your typed name is unchanged.");
        } else if (
          error instanceof EphemeralTranscriptionError &&
          error.failure === "missing-asset"
        ) {
          setNameStatus("No spoken name was recorded. Your typed name is unchanged.");
        } else if (
          error instanceof EphemeralTranscriptionError &&
          error.failure === "permission"
        ) {
          setNameStatus("Speech permission is off. Your typed name is unchanged.");
        } else {
          setNameStatus("Your spoken name was not understood. Your typed name is unchanged.");
        }
      } finally {
        setNameRecording(undefined);
      }
      return;
    }

    try {
      if (!await recordingStorageAvailable(files)) {
        setNameStatus(
          "Storage is too low to record safely. Type your name instead.",
        );
        return;
      }
      const started = await audio.start({ maximumDurationMs: 30_000 });
      setNameRecording(started);
      setNameStatus("Listening. Say your name, then tap Stop.");
    } catch {
      setNameStatus("The microphone could not start. Type your name instead.");
    }
  };

  const selectTab = (lastSettingsTab: SettingsTabId) => {
    setActiveTab(lastSettingsTab);
    commit({ type: "settings-update", settings: { lastSettingsTab } });
  };

  const selectAdjacentTab = (current: SettingsTabId, direction: -1 | 1) => {
    const currentIndex = SETTINGS_TABS.findIndex((tab) => tab.id === current);
    const nextIndex = (currentIndex + direction + SETTINGS_TABS.length) % SETTINGS_TABS.length;
    const next = SETTINGS_TABS[nextIndex] ?? SETTINGS_TABS[0];
    selectTab(next.id);
    document.getElementById(`settings-tab-${next.id}`)?.focus();
  };

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
          <p className="eyebrow">Change the Settings to Suit you</p>
          <h1 id="settings-heading">Settings</h1>
        </div>
        <Eye aria-hidden="true" />
      </header>

      <div className="settings-tabs" aria-label="Settings sections" role="tablist">
        {SETTINGS_TABS.map((tab) => (
          <button
            aria-controls={`settings-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            data-help-topic={`settings-${tab.id}`}
            id={`settings-tab-${tab.id}`}
            key={tab.id}
            onClick={() => selectTab(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                selectAdjacentTab(tab.id, 1);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                selectAdjacentTab(tab.id, -1);
              }
            }}
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className="settings-panel"
        data-help-topic={`settings-${activeTab}`}
      >
        {activeTab === "about" ? (
          <AboutSettingsPanel
            displayName={displayName}
            displayNameInputRef={displayNameInputRef}
            nameRecording={nameRecording}
            nameStatus={nameStatus}
            onDisplayNameChange={setDisplayName}
            onEditPortrait={onEditPortrait}
            onSaveDisplayName={saveDisplayName}
            onToggleSpokenName={() => void toggleSpokenName()}
            sketchRepository={sketchRepository}
          />
        ) : null}

        {activeTab === "welcome" ? (
          <WelcomeSettingsPanel
            greeting={welcomeGreeting}
            message={welcomeMessage}
            onGreetingChange={setWelcomeGreeting}
            onMessageChange={setWelcomeMessage}
            onPreviewWelcome={onPreviewWelcome}
            onSaveText={saveWelcomeText}
            onTaglineChange={setWelcomeTagline}
            tagline={welcomeTagline}
          />
        ) : null}

        {activeTab === "canvas" ? (
        <div className="setting-group canvas-setting-group" id="settings-panel-canvas" role="tabpanel" aria-labelledby="settings-tab-canvas">
          <Palette aria-hidden="true" />
          <CanvasSettingsPanel commit={commit} settings={settings} sketchRepository={sketchRepository} />
        </div>
        ) : null}

        {activeTab === "voice" ? (
        <div className="setting-group" id="settings-panel-voice" role="tabpanel" aria-labelledby="settings-tab-voice">
          <Mic aria-hidden="true" />
          <div>
            <h2>Voice</h2>
            <p className="setting-description">Choose a safety limit and words Apple should expect to hear.</p>
            <section
              aria-labelledby="voice-text-editor-heading"
              className="voice-setting-section"
            >
              <h3 id="voice-text-editor-heading">Text entry</h3>
              <SettingToggle
                checked={settings.textEditorPreference === "native"}
                description="Turn this off to use the standard editor. Both editors use Apple speech recognition."
                label="Use native Apple text editor"
                onChange={(enabled) =>
                  commit({
                    type: "settings-update",
                    settings: {
                      textEditorPreference: enabled ? "native" : "standard",
                    },
                  })
                }
              />
            </section>
            <section className="voice-setting-section" aria-labelledby="voice-recording-heading">
              <h3 id="voice-recording-heading">Recording time</h3>
              <p className="setting-description">Choose how long one recording can continue before it stops safely.</p>
              <label className="recording-limit-setting">
                <span>Recording time limit</span>
                <span className="recording-limit-control">
                <select
                  aria-label="Recording time limit"
                  onChange={(event) => commit({
                    type: "settings-update",
                    settings: { recordingLimitMinutes: event.target.value === "none" ? null : Number(event.target.value) as 2 | 5 | 10 | 30 },
                  })}
                  value={settings.recordingLimitMinutes ?? "none"}
                >
                  <option value="2">2 minutes</option>
                  <option value="5">5 minutes</option>
                  <option value="10">10 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="none">No limit</option>
                </select>
                  <ChevronDown aria-hidden="true" />
                </span>
              </label>
            </section>
            <MyWordsSettingsPanel
              audio={audio}
              commit={commit}
              files={files}
              settings={settings}
            />
          </div>
        </div>
        ) : null}

        {activeTab === "appearance" ? (
          <AppearanceSettingsPanel commit={commit} settings={settings} />
        ) : null}

        {activeTab === "backup" ? (
          <BackupSettingsPanel
            backupStatus={backupStatus}
            commit={commit}
            onBackupNow={onBackupNow}
            onCheckBackup={onCheckBackup}
            onKeepThisIPad={onKeepThisIPad}
            onSaveLocalCopy={onSaveLocalCopy}
            onUseICloud={onUseICloud}
            settings={settings}
          />
        ) : null}

        {activeTab === "history" ? (
          <BackupHistorySettingsPanel
            historyStatus={historyStatus}
            onCreate={onCreateHistory}
            onDelete={onDeleteHistory}
            onRefresh={onRefreshHistory}
            onRestore={onRestoreHistory}
          />
        ) : null}

        {activeTab === "privacy" ? (
          <PrivacySettingsPanel
            deletingCloudData={
              backupStatus.state === "syncing" &&
              backupStatus.message.startsWith("Deleting")
            }
            onDeleteCloudData={onDeleteCloudData}
          />
        ) : null}
      </div>
    </section>
  );
}
