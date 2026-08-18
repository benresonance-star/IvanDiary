import type {
  AppleTranscriptionPlugin,
  AppLifecyclePlugin,
  CloudBackupPlugin,
  CloudBackupResult,
  JournalAudioPlugin,
  JournalFilesPlugin,
  NativeSharePlugin,
  RecordingSnapshot,
  TranscriptionResult,
} from "./contracts";
import { normalizeNativeError } from "./errors";

export type CapacitorPluginContracts = {
  audio: JournalAudioPlugin;
  transcription: AppleTranscriptionPlugin;
  files: JournalFilesPlugin;
  lifecycle: AppLifecyclePlugin;
  backup: CloudBackupPlugin;
  share: NativeSharePlugin;
};

async function nativeCall<T>(
  service: "audio" | "transcription" | "files" | "lifecycle" | "backup" | "share",
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw normalizeNativeError(error, service);
  }
}

function cloudBackupShape(value: CloudBackupResult): CloudBackupResult {
  return {
    state: value.state,
    message: value.message,
    ...(value.lastSuccessfulBackupAt
      ? { lastSuccessfulBackupAt: value.lastSuccessfulBackupAt }
      : {}),
    ...(value.accountDescription ? { accountDescription: value.accountDescription } : {}),
    ...(value.containerIdentifier ? { containerIdentifier: value.containerIdentifier } : {}),
    ...(value.databaseDescription ? { databaseDescription: value.databaseDescription } : {}),
    ...(value.recordIdentifier ? { recordIdentifier: value.recordIdentifier } : {}),
    ...(value.uploadedItemCount === undefined ? {} : { uploadedItemCount: value.uploadedItemCount }),
    ...(value.failedItemCount === undefined ? {} : { failedItemCount: value.failedItemCount }),
    ...(value.failedItems ? { failedItems: value.failedItems.map((item) => ({
      id: item.id,
      kind: item.kind,
      reason: item.reason,
    })) } : {}),
    ...(value.backedUpRevision === undefined ? {} : { backedUpRevision: value.backedUpRevision }),
    ...(value.backupDeviceName ? { backupDeviceName: value.backupDeviceName } : {}),
    ...(value.backupDeviceIdentifier ? { backupDeviceIdentifier: value.backupDeviceIdentifier } : {}),
    ...(value.currentDeviceName ? { currentDeviceName: value.currentDeviceName } : {}),
    ...(value.currentDeviceIdentifier ? { currentDeviceIdentifier: value.currentDeviceIdentifier } : {}),
    ...(value.contentFingerprint ? { contentFingerprint: value.contentFingerprint } : {}),
  };
}

export class CapacitorCloudBackupAdapter implements CloudBackupPlugin {
  constructor(private readonly plugin: CloudBackupPlugin) {}

  async status() {
    return cloudBackupShape(await nativeCall("backup", () => this.plugin.status()));
  }

  async backupSnapshot(options: Parameters<CloudBackupPlugin["backupSnapshot"]>[0]) {
    return cloudBackupShape(
      await nativeCall("backup", () => this.plugin.backupSnapshot(options)),
    );
  }

  async backupAssets(options: Parameters<CloudBackupPlugin["backupAssets"]>[0]) {
    return cloudBackupShape(
      await nativeCall("backup", () => this.plugin.backupAssets(options)),
    );
  }

  async restore() {
    return nativeCall("backup", () => this.plugin.restore());
  }

  async listHistory() {
    return nativeCall("backup", () => this.plugin.listHistory());
  }

  async createHistory(options: Parameters<CloudBackupPlugin["createHistory"]>[0]) {
    return nativeCall("backup", () => this.plugin.createHistory(options));
  }

  async restoreHistory(options: Parameters<CloudBackupPlugin["restoreHistory"]>[0]) {
    return nativeCall("backup", () => this.plugin.restoreHistory(options));
  }

  async deleteHistory(options: Parameters<CloudBackupPlugin["deleteHistory"]>[0]) {
    return nativeCall("backup", () => this.plugin.deleteHistory(options));
  }

  async deleteCloudData() {
    return nativeCall("backup", () => this.plugin.deleteCloudData());
  }
}

function recordingShape(value: RecordingSnapshot): RecordingSnapshot {
  return {
    id: value.id,
    state: value.state,
    elapsedMs: value.elapsedMs,
    ...(value.temporaryUri ? { temporaryUri: value.temporaryUri } : {}),
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

  async acknowledgeSaved() {
    return recordingShape(
      await nativeCall("audio", () => this.plugin.acknowledgeSaved()),
    );
  }

  async play(options: { assetUri: string }) {
    return nativeCall("audio", () => this.plugin.play(options));
  }

  async pausePlayback() {
    return nativeCall("audio", () => this.plugin.pausePlayback());
  }

  async addListener(
    eventName: "playbackEnded",
    listener: (event: { assetUri: string }) => void,
  ) {
    return this.plugin.addListener(eventName, listener);
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

  async openUrl(options: { url: string }) {
    const result = await nativeCall("lifecycle", () =>
      this.plugin.openUrl(options),
    );
    return { opened: result.opened === true };
  }
}

export class CapacitorNativeShareAdapter implements NativeSharePlugin {
  constructor(private readonly plugin: NativeSharePlugin) {}

  async exportPage(options: Parameters<NativeSharePlugin["exportPage"]>[0]) {
    const result = await nativeCall("share", () => this.plugin.exportPage(options));
    return {
      fileUri: result.fileUri,
      fileName: result.fileName,
    };
  }

  async share(options: Parameters<NativeSharePlugin["share"]>[0]) {
    const result = await nativeCall("share", () => this.plugin.share(options));
    return {
      completed: result.completed === true,
      ...(result.activityType ? { activityType: result.activityType } : {}),
    };
  }
}
