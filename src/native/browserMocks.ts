import { createId } from "../utils/id";
import type {
  AppleTranscriptionPlugin,
  AppLifecyclePlugin,
  CloudBackupPlugin,
  JournalFilesPlugin,
  JournalAudioPlugin,
  NativeSharePlugin,
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

  async startMonitoring() { return { powerLevel: 0.45 }; }
  async monitorLevel() { return { powerLevel: 0.25 + Math.random() * 0.55 }; }
  async stopMonitoring() {}

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
      powerLevel: 0.65,
    };
  }

  async pauseRecording(): Promise<RecordingSnapshot> {
    this.#recording = { ...(await this.status()), state: "paused", powerLevel: 0 };
    return this.#recording;
  }

  async resumeRecording(): Promise<RecordingSnapshot> {
    this.#startedAt = Date.now() - this.#recording.elapsedMs;
    this.#recording = { ...this.#recording, state: "recording" };
    return this.#recording;
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

  async acknowledgeSaved() { return this.#recording; }
  async play(): Promise<{ playing: boolean }> { return { playing: true }; }
  async pausePlayback(): Promise<{ playing: boolean }> { return { playing: false }; }
  async addListener(
    _eventName: "playbackEnded",
    _listener: (event: { assetUri: string }) => void,
  ): Promise<{ remove: () => Promise<void> }> {
    void _eventName;
    void _listener;
    return { remove: async () => undefined };
  }
}

export class BrowserJournalFilesMock implements JournalFilesPlugin {
  readonly isSimulation = true;

  async finaliseTemporaryAsset({
    assetId,
    mimeType,
  }: {
    temporaryUri: string;
    assetId: string;
    mimeType: string;
  }) {
    return {
      id: assetId,
      localUri: `demo://asset/${assetId}`,
      mimeType,
      byteLength: 0,
      checksum: "browser-demonstration",
    };
  }

  async removeToTrash(): Promise<void> {}

  async resolveStoredAssets({
    assets,
  }: Parameters<JournalFilesPlugin["resolveStoredAssets"]>[0]) {
    return {
      resolvedAssetUris: Object.fromEntries(
        assets.map((asset) => [asset.id, asset.localUri]),
      ),
      unresolvedAssetIds: [],
    };
  }

  async storageHealth(): Promise<{
    availableBytes?: number;
    lowStorage: boolean;
  }> {
    return { lowStorage: false };
  }
}

export class BrowserAppLifecycleMock implements AppLifecyclePlugin {
  readonly isSimulation = true;

  async flushRequested(): Promise<{ requestedAt: string }> {
    return { requestedAt: new Date().toISOString() };
  }

  async openUrl({ url }: { url: string }): Promise<{ opened: boolean }> {
    window.open(url, "_blank", "noopener,noreferrer");
    return { opened: true };
  }
}

export class BrowserCloudBackupMock implements CloudBackupPlugin {
  readonly isSimulation = true;

  async status() {
    return {
      state: "error" as const,
      message: "iCloud backup is only available in the iPad app.",
    };
  }

  async backupSnapshot() {
    return this.status();
  }

  async backupAssets() {
    return this.status();
  }

  async restore(): Promise<never> {
    throw new Error("iCloud restore is only available in the iPad app.");
  }

  async listHistory() {
    return { entries: [] };
  }

  async createHistory(): Promise<never> {
    throw new Error("iCloud backup history is only available in the iPad app.");
  }

  async restoreHistory(): Promise<never> {
    throw new Error("iCloud backup history is only available in the iPad app.");
  }

  async deleteHistory(): Promise<void> {
    throw new Error("iCloud backup history is only available in the iPad app.");
  }

  async deleteCloudData(): Promise<void> {
    throw new Error("iCloud backup is only available in the iPad app.");
  }
}

export class BrowserNativeShareMock implements NativeSharePlugin {
  readonly isSimulation = true;

  async exportDiary() {
    return {
      pdfFileUri: "demo://share/iPad-App-Diary.pdf",
      archiveFileUri: "demo://share/iPad-App-Diary.tar",
      missingAssetIDs: [],
    };
  }

  async exportPage({
    format,
    fileStem,
  }: Parameters<NativeSharePlugin["exportPage"]>[0]) {
    return {
      fileUri: `demo://share/${fileStem}.${format === "pdf" ? "pdf" : "jpg"}`,
      fileName: `${fileStem}.${format === "pdf" ? "pdf" : "jpg"}`,
    };
  }

  async share(): Promise<{ completed: boolean; activityType?: string }> {
    return { completed: true, activityType: "browser" };
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
