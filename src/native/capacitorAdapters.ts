import type {
  AppleTranscriptionPlugin,
  AppLifecyclePlugin,
  JournalAudioPlugin,
  JournalFilesPlugin,
  RecordingSnapshot,
  TranscriptionResult,
} from "./contracts";
import { normalizeNativeError } from "./errors";

export type CapacitorPluginContracts = {
  audio: JournalAudioPlugin;
  transcription: AppleTranscriptionPlugin;
  files: JournalFilesPlugin;
  lifecycle: AppLifecyclePlugin;
};

async function nativeCall<T>(
  service: "audio" | "transcription" | "files" | "lifecycle",
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw normalizeNativeError(error, service);
  }
}

function recordingShape(value: RecordingSnapshot): RecordingSnapshot {
  return {
    id: value.id,
    state: value.state,
    elapsedMs: value.elapsedMs,
    ...(value.asset ? { asset: value.asset } : {}),
    ...(value.message ? { message: value.message } : {}),
  };
}

export class CapacitorJournalAudioAdapter implements JournalAudioPlugin {
  constructor(private readonly plugin: JournalAudioPlugin) {}

  async start(options?: { preferredFormat?: "m4a" }) {
    return recordingShape(
      await nativeCall("audio", () => this.plugin.start(options)),
    );
  }

  async status() {
    return recordingShape(
      await nativeCall("audio", () => this.plugin.status()),
    );
  }

  async stop() {
    return recordingShape(await nativeCall("audio", () => this.plugin.stop()));
  }

  async recoverInterrupted() {
    const result = await nativeCall("audio", () =>
      this.plugin.recoverInterrupted(),
    );
    return { recordings: result.recordings.map(recordingShape) };
  }
}

export class CapacitorAppleTranscriptionAdapter
  implements AppleTranscriptionPlugin
{
  constructor(private readonly plugin: AppleTranscriptionPlugin) {}

  async requestPermission() {
    const result = await nativeCall("transcription", () =>
      this.plugin.requestPermission(),
    );
    return { granted: result.granted === true };
  }

  async transcribe(options: Parameters<AppleTranscriptionPlugin["transcribe"]>[0]) {
    const result = await nativeCall("transcription", () =>
      this.plugin.transcribe(options),
    );
    return transcriptionShape(result);
  }
}

function transcriptionShape(value: TranscriptionResult): TranscriptionResult {
  return {
    recordingId: value.recordingId,
    rawText: value.rawText,
    locale: value.locale,
    engine: "apple-speech",
    ...(value.segments ? { segments: value.segments } : {}),
  };
}

export class CapacitorJournalFilesAdapter implements JournalFilesPlugin {
  constructor(private readonly plugin: JournalFilesPlugin) {}

  async finaliseTemporaryAsset(
    options: Parameters<JournalFilesPlugin["finaliseTemporaryAsset"]>[0],
  ) {
    return nativeCall("files", () =>
      this.plugin.finaliseTemporaryAsset(options),
    );
  }

  async removeToTrash(
    options: Parameters<JournalFilesPlugin["removeToTrash"]>[0],
  ) {
    await nativeCall("files", () => this.plugin.removeToTrash(options));
  }

  async storageHealth() {
    const result = await nativeCall("files", () => this.plugin.storageHealth());
    return {
      ...(result.availableBytes === undefined
        ? {}
        : { availableBytes: result.availableBytes }),
      lowStorage: result.lowStorage === true,
    };
  }
}

export class CapacitorAppLifecycleAdapter implements AppLifecyclePlugin {
  constructor(private readonly plugin: AppLifecyclePlugin) {}

  async flushRequested() {
    const result = await nativeCall("lifecycle", () =>
      this.plugin.flushRequested(),
    );
    return { requestedAt: result.requestedAt };
  }
}
