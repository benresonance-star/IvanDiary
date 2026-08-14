import { useState } from "react";

import type { TranscriptObject } from "../domain/models";
import type { JournalAudioPlugin } from "../native/contracts";

export function TranscriptEditor({
  audio,
  assetUri,
  transcript,
  readOnly,
  onSave,
  onSuggestMyWord,
}: {
  audio: JournalAudioPlugin;
  assetUri: string;
  readOnly: boolean;
  transcript: TranscriptObject;
  onSave: (next: TranscriptObject) => void;
  onSuggestMyWord: (text: string) => void;
}) {
  const [text, setText] = useState(
    transcript.editedText ?? transcript.rawText,
  );
  const [suggestion, setSuggestion] = useState<string>();

  return (
    <div className="transcript-editor-wrap">
    <textarea
      aria-label="Edit voice transcript"
      className="transcript-editor"
      onBlur={() => {
        if (text !== (transcript.editedText ?? transcript.rawText)) {
          onSave({
            ...transcript,
            editedText: text,
            revision: transcript.revision + 1,
          });
          const rawWords = new Set(transcript.rawText.toLocaleLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? []);
          const corrected = text.match(/[\p{L}\p{N}'’-]+/gu)?.find((word) => word.length > 1 && !rawWords.has(word.toLocaleLowerCase()));
          setSuggestion(corrected);
        }
      }}
      onChange={(event) => setText(event.target.value)}
      readOnly={readOnly}
      value={text}
    />
    {suggestion ? (
      <button onClick={() => { onSuggestMyWord(suggestion); setSuggestion(undefined); }} type="button">
        Add “{suggestion}” to My Words
      </button>
    ) : null}
    {transcript.segments?.some((segment) => typeof segment.confidence === "number" && segment.confidence < 0.5) ? (
      <div className="uncertain-words" aria-label="Words to check">
        <span>Words to check:</span>
        {transcript.segments.filter((segment) => typeof segment.confidence === "number" && segment.confidence < 0.5).map((segment, index) => (
          <button
            key={`${segment.startMs}-${index}`}
            onClick={() => void audio.play({ assetUri, startMs: segment.startMs, durationMs: Math.max(800, segment.durationMs + 400) })}
            title={segment.alternatives?.length ? `Other possibilities: ${segment.alternatives.join(", ")}` : undefined}
            type="button"
          >
            ▶ {segment.text}
          </button>
        ))}
      </div>
    ) : null}
    </div>
  );
}
