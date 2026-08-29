import type {
  AppleTranscriptionPlugin,
  JournalAudioPlugin,
  JournalFilesPlugin,
  RecordingSnapshot,
  TranscriptionResult,
} from "./contracts";
import { finalizeStoppedRecording } from "./durableAudio";

export type EphemeralTranscriptionFailure =
  | "finalization"
  | "missing-asset"
  | "permission"
  | "transcription";

export class EphemeralTranscriptionError extends Error {
  readonly failure: EphemeralTranscriptionFailure;

  constructor(failure: EphemeralTranscriptionFailure, cause?: unknown) {
    super(`Ephemeral transcription failed during ${failure}.`, { cause });
    this.name = "EphemeralTranscriptionError";
    this.failure = failure;
  }
}

export async function transcribeEphemeralRecording({
  audio,
  contextualStrings,
  files,
  locale = "en-AU",
  onFinalized,
  requestPermission = true,
  transcription,
}: {
  audio: JournalAudioPlugin;
  contextualStrings?: string[];
  files: JournalFilesPlugin;
  locale?: string;
  onFinalized?: (recording: RecordingSnapshot) => void;
  requestPermission?: boolean;
  transcription: AppleTranscriptionPlugin;
}): Promise<TranscriptionResult> {
  let stopped: RecordingSnapshot;
  try {
    stopped = await finalizeStoppedRecording(audio, files);
  } catch (error) {
    throw new EphemeralTranscriptionError("finalization", error);
  }

  onFinalized?.(stopped);
  if (!stopped.asset) {
    throw new EphemeralTranscriptionError("missing-asset");
  }

  try {
    if (requestPermission) {
      const permission = await transcription.requestPermission();
      if (!permission.granted) {
        throw new EphemeralTranscriptionError("permission");
      }
    }

    try {
      return await transcription.transcribe({
        recordingId: stopped.id,
        asset: stopped.asset,
        locale,
        ...(contextualStrings ? { contextualStrings } : {}),
      });
    } catch (error) {
      throw new EphemeralTranscriptionError("transcription", error);
    }
  } finally {
    await files
      .removeToTrash({ assetId: stopped.asset.id })
      .catch(() => undefined);
  }
}
