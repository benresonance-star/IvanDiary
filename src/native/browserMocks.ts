import { createId } from "../utils/id";
import type {
  AppleTranscriptionPlugin,
  JournalAudioPlugin,
  RecordingSnapshot,
  TranscriptionResult,
} from "./contracts";

export class BrowserJournalAudioMock implements JournalAudioPlugin {
  readonly isSimulation = true;
  #recording: RecordingSnapshot = {
    id: "",
    state: "idle",
    elapsedMs: 0,
  };
  #startedAt = 0;

  async start(): Promise<RecordingSnapshot> {
    this.#startedAt = Date.now();
    this.#recording = {
      id: createId(),
      state: "recording",
      elapsedMs: 0,
      message: "Browser demonstration only. No microphone audio is captured.",
    };
    return this.#recording;
  }

  async status(): Promise<RecordingSnapshot> {
    if (this.#recording.state !== "recording") {
      return this.#recording;
    }
    return {
      ...this.#recording,
      elapsedMs: Date.now() - this.#startedAt,
    };
  }

  async stop(): Promise<RecordingSnapshot> {
    const elapsedMs = Math.max(1_000, Date.now() - this.#startedAt);
    this.#recording = {
      ...this.#recording,
      state: "saved",
      elapsedMs,
      asset: {
        id: createId(),
        localUri: `demo://recording/${this.#recording.id}`,
        mimeType: "audio/mp4",
        byteLength: 0,
        checksum: "browser-demonstration",
      },
      message: "Browser demonstration saved. No microphone audio was captured.",
    };
    return this.#recording;
  }

  async recoverInterrupted(): Promise<{ recordings: RecordingSnapshot[] }> {
    return { recordings: [] };
  }
}

export class BrowserAppleTranscriptionMock
  implements AppleTranscriptionPlugin
{
  readonly isSimulation = true;

  async requestPermission(): Promise<{ granted: boolean }> {
    return { granted: true };
  }

  async transcribe({
    recordingId,
  }: {
    recordingId: string;
  }): Promise<TranscriptionResult> {
    return {
      recordingId,
      rawText: "Browser transcription demonstration. Edit this text if needed.",
      locale: "en-AU",
      engine: "apple-speech",
    };
  }
}
