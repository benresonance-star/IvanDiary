import { useRef, useState } from "react";
import {
  ChevronDown,
  Eye,
  Mic,
  Palette,
  Trash2,
  Volume2,
} from "lucide-react";

import type {
  BackupStatus,
  DocumentOperationInput,
  JournalSettings,
  MyWord,
  SettingsTabId,
} from "../domain/models";
import type {
  AppleTranscriptionPlugin,
  JournalAudioPlugin,
  JournalFilesPlugin,
  RecordingSnapshot,
} from "../native/contracts";
import {
  finalizeStoppedRecording,
  recordingStorageAvailable,
} from "../native/durableAudio";
import {
  EphemeralTranscriptionError,
  transcribeEphemeralRecording,
} from "../native/ephemeralTranscription";
import { createId } from "../utils/id";
import type { SketchRepository } from "../sketch/types";
import type { WelcomeCopy } from "./WelcomeScreen";
import { AboutSettingsPanel } from "./AboutSettingsPanel";
import { AppearanceSettingsPanel } from "./AppearanceSettingsPanel";
import { BackupSettingsPanel } from "./BackupSettingsPanel";
import { CanvasSettingsPanel } from "./CanvasSettingsPanel";
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
  { id: "backup", label: "Backup" },
] as const;

export function SettingsView({
  settings,
  commit,
  audio,
  files,
  onEditPortrait,
  onBackupNow,
  onCheckBackup,
  onRestore,
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
  onRestore: () => void;
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
  const [newWord, setNewWord] = useState("");
  const [activeTab, setActiveTab] = useState<SettingsTabId>(settings.lastSettingsTab);
  const [sampleRecording, setSampleRecording] = useState<{ wordId: string; snapshot: RecordingSnapshot }>();
  const [sampleStatus, setSampleStatus] = useState<string>();

  const saveMyWords = (myWords: MyWord[]) =>
    commit({ type: "settings-update", settings: { myWords } });

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

  const addMyWord = () => {
    const text = newWord.trim();
    if (!text || settings.myWords.length >= 100) return;
    const existing = settings.myWords.some((word) => word.text.toLocaleLowerCase() === text.toLocaleLowerCase());
    if (!existing) {
      saveMyWords([...settings.myWords, { id: createId(), text, enabled: true, correctionCount: 0 }]);
    }
    setNewWord("");
  };

  const toggleWordSample = async (word: MyWord) => {
    if (sampleRecording?.wordId === word.id && sampleRecording.snapshot.state === "recording") {
      try {
        const saved = await finalizeStoppedRecording(audio, files);
        if (!saved.asset) return;
        if (word.sample) await files.removeToTrash({ assetId: word.sample.id });
        saveMyWords(settings.myWords.map((candidate) =>
          candidate.id === word.id ? { ...candidate, sample: saved.asset } : candidate));
        setSampleStatus(`Voice sample saved for ${word.text}.`);
      } catch {
        setSampleStatus("The voice sample could not be saved.");
      } finally {
        setSampleRecording(undefined);
      }
      return;
    }
    try {
      if (!await recordingStorageAvailable(files)) {
        setSampleStatus(
          "Storage is too low to record a voice sample safely.",
        );
        return;
      }
      const snapshot = await audio.start({ maximumDurationMs: 30_000 });
      setSampleRecording({ wordId: word.id, snapshot });
      setSampleStatus(`Recording a voice sample for ${word.text}.`);
    } catch {
      setSampleStatus("The microphone could not start.");
    }
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
          <p className="eyebrow">Make the diary comfortable</p>
          <h1 id="settings-heading">Settings</h1>
        </div>
        <Eye aria-hidden="true" />
      </header>

      <nav className="settings-tabs" aria-label="Settings sections" role="tablist">
        {SETTINGS_TABS.map((tab) => (
          <button
            aria-controls={`settings-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
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
      </nav>

      <div className="settings-panel">
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
            <section className="voice-setting-section voice-words-section" aria-labelledby="voice-words-heading">
              <h3 id="voice-words-heading">My Words</h3>
              <p className="setting-description">Add short names or phrases. A voice sample is optional and stays with the diary on this device.</p>
              <p aria-live="polite" role="status">{sampleStatus}</p>
              <form className="my-word-form" onSubmit={(event) => { event.preventDefault(); addMyWord(); }}>
                <label>
                  Word or short phrase
                  <input maxLength={80} onChange={(event) => setNewWord(event.target.value)} value={newWord} />
                </label>
                <button disabled={!newWord.trim() || settings.myWords.length >= 100} type="submit">Add word</button>
              </form>
              <div className="my-words-list">
                {settings.myWords.map((word) => (
                  <article key={word.id} className="my-word-row">
                    <input aria-label={`Intended words for ${word.text}`} maxLength={80} onBlur={(event) => { const text = event.target.value.trim(); if (text) saveMyWords(settings.myWords.map((candidate) => candidate.id === word.id ? { ...candidate, text } : candidate)); }} defaultValue={word.text} />
                    <label className="my-word-toggle">
                      <input aria-label={`Use ${word.text} for voice recognition`} checked={word.enabled} onChange={(event) => saveMyWords(settings.myWords.map((candidate) => candidate.id === word.id ? { ...candidate, enabled: event.target.checked } : candidate))} type="checkbox" />
                      <span aria-hidden="true" className="setting-switch-track"><span /></span>
                      <span>{word.enabled ? "Used" : "Not used"}</span>
                    </label>
                    <button onClick={() => void toggleWordSample(word)} type="button"><Mic aria-hidden="true" />{sampleRecording?.wordId === word.id ? "Stop sample" : word.sample ? "Replace sample" : "Record sample"}</button>
                    {word.sample ? <button aria-label={`Play sample for ${word.text}`} onClick={() => void audio.play({ assetUri: word.sample!.localUri })} type="button"><Volume2 aria-hidden="true" /></button> : null}
                    <button aria-label={`Delete ${word.text}`} onClick={() => void (async () => { if (word.sample) await files.removeToTrash({ assetId: word.sample.id }); saveMyWords(settings.myWords.filter((candidate) => candidate.id !== word.id)); })()} type="button"><Trash2 aria-hidden="true" /></button>
                  </article>
                ))}
              </div>
            </section>
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
            onRestore={onRestore}
            settings={settings}
          />
        ) : null}
      </div>
    </section>
  );
}
