import { useState } from "react";
import {
  BookHeart,
  ChevronDown,
  CloudOff,
  Cloud,
  Contrast,
  Eye,
  Mic,
  Palette,
  Play,
  Text,
  Trash2,
  UserRound,
  Volume2,
} from "lucide-react";

import type {
  BackupStatus,
  DocumentOperationInput,
  JournalSettings,
  MyWord,
  SettingsTabId,
} from "../domain/models";
import type { JournalAudioPlugin, JournalFilesPlugin, RecordingSnapshot } from "../native/contracts";
import { finalizeStoppedRecording } from "../native/durableAudio";
import { createId } from "../utils/id";
import type { SketchRepository } from "../sketch/types";
import { ProfilePortrait } from "./ProfilePortrait";
import type { WelcomeCopy } from "./WelcomeScreen";
import { CanvasSettingsPanel } from "./CanvasSettingsPanel";

const DEFAULT_GREETING = "Welcome back Ivan!";
const DEFAULT_TAGLINE = "It's a Wonderful World!";

const SETTINGS_TABS = [
  { id: "about", label: "About Me" },
  { id: "welcome", label: "Welcome" },
  { id: "canvas", label: "Canvas" },
  { id: "voice", label: "Voice" },
  { id: "appearance", label: "Appearance" },
  { id: "backup", label: "Backup" },
] as const;

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
    <label className="setting-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className="setting-switch">
        <input aria-label={label} checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
        <span aria-hidden="true" className="setting-switch-track"><span /></span>
      </span>
    </label>
  );
}

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
  const [newWord, setNewWord] = useState("");
  const [activeTab, setActiveTab] = useState<SettingsTabId>(settings.lastSettingsTab);
  const [sampleRecording, setSampleRecording] = useState<{ wordId: string; snapshot: RecordingSnapshot }>();

  const saveMyWords = (myWords: MyWord[]) =>
    commit({ type: "settings-update", settings: { myWords } });

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
      const saved = await finalizeStoppedRecording(audio, files);
      if (!saved.asset) return;
      if (word.sample) await files.removeToTrash({ assetId: word.sample.id });
      saveMyWords(settings.myWords.map((candidate) =>
        candidate.id === word.id ? { ...candidate, sample: saved.asset } : candidate));
      setSampleRecording(undefined);
      return;
    }
    const snapshot = await audio.start({ maximumDurationMs: 30_000 });
    setSampleRecording({ wordId: word.id, snapshot });
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
        <div className="setting-group about-me-setting-group" id="settings-panel-about" role="tabpanel" aria-labelledby="settings-tab-about">
          <UserRound aria-hidden="true" />
          <div>
            <h2>About Me</h2>
            <p className="setting-description">Choose the name and portrait shown in the diary.</p>
            <label className="display-name-setting">
              Display name
              <input
                maxLength={60}
                onBlur={() => {
                  const cleaned = displayName.trim() || "Ivan";
                  setDisplayName(cleaned);
                  if (cleaned !== settings.displayName) {
                    commit({ type: "settings-update", settings: { displayName: cleaned } });
                  }
                }}
                onChange={(event) => setDisplayName(event.target.value)}
                value={displayName}
              />
            </label>
            <div className="portrait-setting">
              <ProfilePortrait sketchRepository={sketchRepository} />
              <div>
                <h3>My portrait</h3>
                <p>Draw a picture of your face. It will appear beside your name.</p>
                <button onClick={onEditPortrait} type="button">Draw or edit my portrait</button>
              </div>
            </div>
          </div>
        </div>
        ) : null}

        {activeTab === "welcome" ? (
        <div className="setting-group welcome-setting-group" id="settings-panel-welcome" role="tabpanel" aria-labelledby="settings-tab-welcome">
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
        <div className="setting-group" id="settings-panel-appearance" role="tabpanel" aria-labelledby="settings-tab-appearance">
          <Contrast aria-hidden="true" />
          <div>
            <h2>Appearance</h2>
            <section className="appearance-setting-section" aria-labelledby="appearance-text-size-heading">
              <h3 id="appearance-text-size-heading"><Text aria-hidden="true" />Text size</h3>
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
        ) : null}

        {activeTab === "backup" ? (
        <div className="setting-group backup-setting-group" id="settings-panel-backup" role="tabpanel" aria-labelledby="settings-tab-backup">
          {backupStatus.state === "synced" || backupStatus.state === "available" ? <Cloud aria-hidden="true" /> : <CloudOff aria-hidden="true" />}
          <div>
            <h2>iCloud backup</h2>
            <div className="backup-status-card" data-state={backupStatus.state} role="status">
              {backupStatus.state === "synced" || backupStatus.state === "available" ? <Cloud aria-hidden="true" /> : <CloudOff aria-hidden="true" />}
              <div>
                <strong>{backupStatus.state === "syncing" ? "Backup in progress" : backupStatus.state === "waiting" ? "Backup needs attention" : backupStatus.state === "synced" ? "Backup is up to date" : backupStatus.state === "available" ? "Backup is ready" : "Backup is not connected"}</strong>
                <p>{backupStatus.message}</p>
              </div>
            </div>
            <p className="setting-description backup-explanation">
              Your diary is always saved on this iPad. iCloud backup includes diary information, original recordings, photos and drawings.
            </p>
            <button className="backup-setup-action" disabled={backupStatus.state === "syncing"} onClick={onCheckBackup} type="button">
              Check iCloud connection
            </button>
            <button className="backup-now-action" disabled={backupStatus.state === "syncing" || backupStatus.state === "error"} onClick={onBackupNow} type="button">
              {backupStatus.state === "syncing" ? "Backing up…" : "Back up diary information now"}
            </button>
            <button className="backup-restore-action" disabled={backupStatus.state === "syncing" || !backupStatus.lastSuccessfulBackupAt} onClick={onRestore} type="button">
              Restore diary from iCloud
            </button>
            <details className="backup-details">
              <summary>Backup details <ChevronDown aria-hidden="true" /></summary>
              <div>
                {backupStatus.lastSuccessfulBackupAt ? (
                  <p className="backup-availability-note">Last diary information backup: {new Date(backupStatus.lastSuccessfulBackupAt).toLocaleString()}</p>
                ) : (
                  <p className="backup-availability-note">No successful iCloud backup has been recorded yet.</p>
                )}
                <div className="backup-location-details">
                  <h3>iCloud storage details</h3>
                  <dl>
                    <div><dt>iCloud account</dt><dd>{backupStatus.accountDescription ?? "Account details unavailable"}</dd></div>
                    <div><dt>Container</dt><dd>{backupStatus.containerIdentifier ?? "Not connected"}</dd></div>
                    <div><dt>Database</dt><dd>{backupStatus.databaseDescription ?? "Not available"}</dd></div>
                    <div><dt>Diary record</dt><dd>{backupStatus.recordIdentifier ?? "Not created yet"}</dd></div>
                    <div><dt>File location</dt><dd>Stored securely inside CloudKit. It does not appear as a folder in iCloud Drive or the Files app.</dd></div>
                  </dl>
                </div>
              </div>
            </details>
            {backupStatus.failedItems?.length ? (
              <div className="backup-failed-items" aria-labelledby="backup-waiting-heading">
                <h3 id="backup-waiting-heading">Files still waiting</h3>
                <p>These originals remain on this iPad and will be retried the next time you back up.</p>
                <ul>
                  {backupStatus.failedItems.map((item) => (
                    <li key={`${item.kind}-${item.id}`}>
                      <strong>{item.kind === "audio" ? "Voice recording" : item.kind === "photo" ? "Photo" : item.kind === "drawing" ? "Drawing" : "File"}</strong>
                      <code>{item.id}</code>
                      <span>{item.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <h3>Backup preferences</h3>
            <SettingToggle
              checked={settings.automaticBackup}
              description="Automatically back up changes after you finish editing. Failed items retry after the next change or app launch."
              label="Automatic backup"
              onChange={(automaticBackup) => commit({
                type: "settings-update",
                settings: { automaticBackup },
              })}
            />
            <SettingToggle
              checked={settings.backupOnWifiOnly}
              description="Wait for Wi-Fi before uploading recordings, drawings and photos."
              label="Use Wi-Fi for large files"
              onChange={(backupOnWifiOnly) => commit({
                type: "settings-update",
                settings: { backupOnWifiOnly },
              })}
            />
          </div>
        </div>
        ) : null}
      </div>
    </section>
  );
}
