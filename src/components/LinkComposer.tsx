import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Mic } from "lucide-react";

import type {
  AppleTranscriptionPlugin,
  JournalAudioPlugin,
  JournalFilesPlugin,
  RecordingSnapshot,
} from "../native/contracts";
import { recordingStorageAvailable } from "../native/durableAudio";
import { transcribeEphemeralRecording } from "../native/ephemeralTranscription";

export function LinkComposer({
  initialTitle = "",
  initialUrl = "",
  audio,
  contextualStrings,
  files,
  onClose,
  onSave,
  transcription,
}: {
  initialTitle?: string;
  initialUrl?: string;
  audio?: JournalAudioPlugin;
  contextualStrings?: string[];
  files?: JournalFilesPlugin;
  onClose: () => void;
  onSave: (url: string, title: string) => void;
  transcription?: AppleTranscriptionPlugin;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [title, setTitle] = useState(initialTitle);
  const [error, setError] = useState<string>();
  const [recording, setRecording] = useState<RecordingSnapshot>();
  const [speechStatus, setSpeechStatus] = useState<string>();
  const urlInputRef = useRef<HTMLInputElement>(null);
  const editing = initialUrl.length > 0;
  const recordingName = recording?.state === "recording";

  useEffect(() => {
    urlInputRef.current?.focus({ preventScroll: true });
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("Unsupported protocol");
      }
      onSave(parsed.toString(), title.trim() || parsed.hostname);
    } catch {
      setError("Enter a complete web address, such as https://example.com");
    }
  };

  const toggleSpokenName = async () => {
    if (!audio || !files || !transcription) return;
    setSpeechStatus(undefined);
    if (recording?.state === "recording") {
      try {
        setRecording({ ...recording, state: "finalising" });
        setSpeechStatus("Turning your voice into a link name…");
        const result = await transcribeEphemeralRecording({
          audio,
          contextualStrings,
          files,
          requestPermission: false,
          transcription,
        });
        const spokenName = result.rawText.trim();
        if (spokenName) {
          setTitle(spokenName);
          setSpeechStatus("Spoken link name added. Check it before saving.");
        } else {
          setSpeechStatus("No link name was recognised. Type it instead.");
        }
      } catch {
        setSpeechStatus("The link name was not understood. Try again or type it.");
      } finally {
        setRecording(undefined);
      }
      return;
    }

    try {
      const permission = await transcription.requestPermission();
      if (!permission.granted) {
        setSpeechStatus("Speech permission is off. Type the link name instead.");
        return;
      }
      if (!await recordingStorageAvailable(files)) {
        setSpeechStatus("Storage is too low to record safely. Type the link name instead.");
        return;
      }
      setRecording(await audio.start({ maximumDurationMs: 30_000 }));
      setSpeechStatus("Listening. Say the link name, then tap Stop.");
    } catch {
      setSpeechStatus("The microphone could not start. Type the link name instead.");
    }
  };

  return createPortal(
    // The backdrop is pointer-only; the dialog includes a keyboard-accessible
    // Cancel button and focus remains inside the dialog form.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="link-composer-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        aria-labelledby="link-composer-title"
        aria-modal="true"
        className="link-composer"
        onSubmit={submit}
        role="dialog"
      >
        <h2 id="link-composer-title">
          {editing ? "Edit web link" : "Add a web link"}
        </h2>
        <label>
          Paste Web Link Address Here:
          <input
            inputMode="url"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://youtube.com"
            ref={urlInputRef}
            value={url}
          />
        </label>
        <label>
          Link Name on the Canvas:
          <span className="link-name-input-row">
            <input
              onChange={(event) => setTitle(event.target.value)}
              placeholder="My Favourite Song"
              value={title}
            />
            {audio && files && transcription ? (
              <button
                aria-label={recordingName ? "Stop speaking link name" : "Speak link name"}
                aria-pressed={recordingName}
                className="link-name-microphone"
                onClick={() => void toggleSpokenName()}
                type="button"
              >
                <Mic aria-hidden="true" />
              </button>
            ) : null}
          </span>
        </label>
        {speechStatus ? <p aria-live="polite">{speechStatus}</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        <div>
          <button className="secondary-action" disabled={recordingName} onClick={onClose} type="button">
            Cancel
          </button>
          <button className="large-action" disabled={recordingName} type="submit">
            {editing ? "Save changes" : "Add link"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
