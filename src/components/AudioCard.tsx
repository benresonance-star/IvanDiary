import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";

import type { VoiceRecordingObject } from "../domain/models";
import type { JournalAudioPlugin } from "../native/contracts";

export function AudioCard({
  disabled = false,
  audio,
  onRetryTranscription,
  recording,
}: {
  disabled?: boolean;
  audio: JournalAudioPlugin;
  onRetryTranscription?: () => void;
  recording: VoiceRecordingObject;
}) {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let disposed = false;
    let removeListener: (() => Promise<void>) | undefined;

    void audio.addListener("playbackEnded", ({ assetUri }) => {
      if (assetUri === recording.asset.localUri) setPlaying(false);
    }).then((handle) => {
      if (disposed) void handle.remove();
      else removeListener = handle.remove;
    });

    return () => {
      disposed = true;
      if (removeListener) void removeListener();
    };
  }, [audio, recording.asset.localUri]);

  return (
    <article className="memory-card audio-memory">
      <button
        aria-label={playing ? "Pause voice recording" : "Play voice recording"}
        className="audio-player"
        data-recording-id={recording.id}
        disabled={disabled}
        onClick={() => void (playing
          ? audio.pausePlayback().then(() => setPlaying(false))
          : audio.play({ assetUri: recording.asset.localUri }).then(() => setPlaying(true)))}
        type="button"
      >
        {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </button>
      {recording.transcriptionStatus === "pending" ||
      recording.transcriptionStatus === "transcribing" ? (
        <div>
          <p aria-live="polite">
            {recording.transcriptionStatus === "pending"
              ? "This recording is ready to turn into text."
              : "Turning this recording into text…"}
          </p>
          {recording.transcriptionStatus === "pending" && onRetryTranscription ? (
            <button disabled={disabled} onClick={onRetryTranscription} type="button">
              Generate text
            </button>
          ) : null}
        </div>
      ) : null}
      {recording.transcriptionStatus === "failed" ? (
        <div>
          <p aria-live="polite">Text could not be generated.</p>
          {onRetryTranscription ? (
            <button disabled={disabled} onClick={onRetryTranscription} type="button">
              Try text again
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
