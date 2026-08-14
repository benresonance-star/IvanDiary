import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";

import type { VoiceRecordingObject } from "../domain/models";
import type { JournalAudioPlugin } from "../native/contracts";

export function AudioCard({
  disabled = false,
  audio,
  onConvertToText,
  recording,
}: {
  disabled?: boolean;
  audio: JournalAudioPlugin;
  onConvertToText?: () => void;
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
        <span>{playing ? "Pause" : "Play"}</span>
      </button>
      {recording.transcriptionStatus !== "complete" && onConvertToText ? (
        <button
          className="audio-convert-button"
          disabled={
            disabled || recording.transcriptionStatus === "transcribing"
          }
          onClick={onConvertToText}
          type="button"
        >
          {recording.transcriptionStatus === "transcribing"
            ? "Converting…"
            : recording.transcriptionStatus === "failed"
              ? "Try again"
              : "Convert to text"}
        </button>
      ) : null}
      {recording.transcriptionStatus === "transcribing" ? (
        <p aria-live="polite" className="audio-transcription-status">
          Converting recording to text…
        </p>
      ) : null}
      {recording.transcriptionStatus === "failed" ? (
        <p aria-live="polite" className="audio-transcription-status error">
          Text could not be generated. Your recording is still saved.
        </p>
      ) : null}
    </article>
  );
}
