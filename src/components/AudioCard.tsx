import { useState } from "react";
import { Pause, Play } from "lucide-react";

import type { VoiceRecordingObject } from "../domain/models";

export function AudioCard({
  disabled = false,
  recording,
}: {
  disabled?: boolean;
  recording: VoiceRecordingObject;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <article className="memory-card audio-memory">
      <button
        aria-label={playing ? "Pause voice recording" : "Play voice recording"}
        className="audio-player"
        data-recording-id={recording.id}
        disabled={disabled}
        onClick={() => setPlaying((current) => !current)}
        type="button"
      >
        {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </button>
    </article>
  );
}
