import { Mic, Plus, Trash2, Volume2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import type {
  DocumentOperationInput,
  JournalSettings,
  MyWord,
} from "../domain/models";
import type {
  JournalAudioPlugin,
  JournalFilesPlugin,
  RecordingSnapshot,
} from "../native/contracts";
import {
  finalizeStoppedRecording,
  recordingStorageAvailable,
} from "../native/durableAudio";
import { createId } from "../utils/id";

export function MyWordsSettingsPanel({
  audio,
  commit,
  files,
  settings,
}: {
  audio: JournalAudioPlugin;
  commit: (operation: DocumentOperationInput) => void;
  files: JournalFilesPlugin;
  settings: JournalSettings;
}) {
  const [newWord, setNewWord] = useState("");
  const [sampleRecording, setSampleRecording] = useState<{
    wordId: string;
    snapshot: RecordingSnapshot;
  }>();
  const [sampleStatus, setSampleStatus] = useState<string>();
  const atWordLimit = settings.myWords.length >= 100;

  const saveMyWords = (myWords: MyWord[]) =>
    commit({ type: "settings-update", settings: { myWords } });

  const addMyWord = (event: FormEvent) => {
    event.preventDefault();
    const text = newWord.trim();
    if (!text || atWordLimit) return;
    const existing = settings.myWords.some(
      (word) => word.text.toLocaleLowerCase() === text.toLocaleLowerCase(),
    );
    if (!existing) {
      saveMyWords([
        ...settings.myWords,
        { id: createId(), text, enabled: true, correctionCount: 0 },
      ]);
    }
    setNewWord("");
  };

  const toggleWordSample = async (word: MyWord) => {
    if (
      sampleRecording?.wordId === word.id &&
      sampleRecording.snapshot.state === "recording"
    ) {
      try {
        const saved = await finalizeStoppedRecording(audio, files);
        if (!saved.asset) return;
        if (word.sample) {
          await files.removeToTrash({ assetId: word.sample.id });
        }
        saveMyWords(
          settings.myWords.map((candidate) =>
            candidate.id === word.id
              ? { ...candidate, sample: saved.asset }
              : candidate,
          ),
        );
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

  const deleteWord = async (word: MyWord) => {
    if (word.sample) {
      await files.removeToTrash({ assetId: word.sample.id });
    }
    saveMyWords(
      settings.myWords.filter((candidate) => candidate.id !== word.id),
    );
  };

  return (
    <section
      aria-labelledby="voice-words-heading"
      className="voice-setting-section voice-words-section"
    >
      <div className="my-words-heading">
        <h3 id="voice-words-heading">My Words</h3>
        <span>
          {settings.myWords.length} of 100
        </span>
      </div>
      <p className="setting-description">
        Add short names or phrases. An optional voice sample helps the App
        recognise exactly how you say them.
      </p>
      {sampleStatus ? (
        <p aria-live="polite" className="my-words-status" role="status">
          {sampleStatus}
        </p>
      ) : null}
      <form className="my-word-form" onSubmit={addMyWord}>
        <label className="my-word-add-field">
          <span>Word or short phrase</span>
          <input
            autoCapitalize="words"
            enterKeyHint="done"
            inputMode="text"
            maxLength={80}
            onChange={(event) => setNewWord(event.target.value)}
            value={newWord}
          />
        </label>
        <button
          className="my-word-add-button"
          disabled={!newWord.trim() || atWordLimit}
          type="submit"
        >
          <Plus aria-hidden="true" />
          Add word
        </button>
      </form>
      {atWordLimit ? (
        <p className="my-words-limit" role="status">
          You have reached the limit of 100 saved words.
        </p>
      ) : null}
      {settings.myWords.length === 0 ? (
        <div className="my-words-empty">
          <strong>No saved words yet</strong>
          <span>Names and short phrases you add will appear here.</span>
        </div>
      ) : (
        <div className="my-words-list">
          {settings.myWords.map((word) => {
            const recording =
              sampleRecording?.wordId === word.id &&
              sampleRecording.snapshot.state === "recording";
            const groupLabelId = `my-word-${word.id}-label`;
            return (
              <article
                aria-labelledby={groupLabelId}
                className="my-word-row"
                key={word.id}
              >
                <span className="visually-hidden" id={groupLabelId}>
                  Controls for {word.text}
                </span>
                <div className="my-word-main-row">
                  <label className="my-word-edit-field">
                    <span>Word or phrase</span>
                    <input
                      aria-label={`Edit ${word.text}`}
                      defaultValue={word.text}
                      maxLength={80}
                      onBlur={(event) => {
                        const text = event.target.value.trim();
                        if (!text) return;
                        saveMyWords(
                          settings.myWords.map((candidate) =>
                            candidate.id === word.id
                              ? { ...candidate, text }
                              : candidate,
                          ),
                        );
                      }}
                    />
                  </label>
                  <label className="my-word-toggle">
                    <span className="my-word-toggle-copy">
                      <strong>Use for voice recognition</strong>
                      <small>{word.enabled ? "On" : "Off"}</small>
                    </span>
                    <span className="setting-switch">
                      <input
                        aria-label={`Use ${word.text} for voice recognition`}
                        checked={word.enabled}
                        onChange={(event) =>
                          saveMyWords(
                            settings.myWords.map((candidate) =>
                              candidate.id === word.id
                                ? {
                                    ...candidate,
                                    enabled: event.target.checked,
                                  }
                                : candidate,
                            ),
                          )
                        }
                        type="checkbox"
                      />
                      <span aria-hidden="true" className="setting-switch-track">
                        <span />
                      </span>
                    </span>
                  </label>
                </div>
                <div className="my-word-actions">
                  <button
                    aria-pressed={recording}
                    className={`my-word-sample-action${recording ? " recording" : ""}`}
                    onClick={() => void toggleWordSample(word)}
                    type="button"
                  >
                    <Mic aria-hidden="true" />
                    {recording
                      ? "Stop sample"
                      : word.sample
                        ? "Replace sample"
                        : "Record sample"}
                  </button>
                  {word.sample ? (
                    <button
                      aria-label={`Play sample for ${word.text}`}
                      className="my-word-icon-action"
                      onClick={() =>
                        void audio.play({ assetUri: word.sample!.localUri })
                      }
                      type="button"
                    >
                      <Volume2 aria-hidden="true" />
                    </button>
                  ) : null}
                  <button
                    aria-label={`Delete ${word.text}`}
                    className="my-word-delete-action"
                    onClick={() => void deleteWord(word)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
