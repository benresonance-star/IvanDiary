import type { AssetRef, EntityId } from "../domain/models";

export type RecordingState =
  | "idle"
  | "recording"
  | "finalising"
  | "saved"
  | "interrupted"
  | "error";

export type RecordingSnapshot = {
  id: EntityId;
  state: RecordingState;
  elapsedMs: number;
  asset?: AssetRef;
  message?: string;
};

export interface JournalAudioPlugin {
  start(options?: { preferredFormat?: "m4a" }): Promise<RecordingSnapshot>;
  status(): Promise<RecordingSnapshot>;
  stop(): Promise<RecordingSnapshot>;
  recoverInterrupted(): Promise<{ recordings: RecordingSnapshot[] }>;
}

export type TranscriptionResult = {
  recordingId: EntityId;
  rawText: string;
  locale: string;
  engine: "apple-speech";
  segments?: Array<{
    text: string;
    startMs: number;
    durationMs: number;
  }>;
};

export interface AppleTranscriptionPlugin {
  requestPermission(): Promise<{ granted: boolean }>;
  transcribe(options: {
    recordingId: EntityId;
    asset: AssetRef;
    locale?: string;
  }): Promise<TranscriptionResult>;
}

export interface JournalFilesPlugin {
  finaliseTemporaryAsset(options: {
    temporaryUri: string;
    assetId: EntityId;
    mimeType: string;
  }): Promise<AssetRef>;
  removeToTrash(options: { assetId: EntityId }): Promise<void>;
  storageHealth(): Promise<{
    availableBytes?: number;
    lowStorage: boolean;
  }>;
}

export interface AppLifecyclePlugin {
  flushRequested(): Promise<{ requestedAt: string }>;
}

export interface NativeSharePlugin {
  share(options: {
    title: string;
    text?: string;
    assetUris?: string[];
  }): Promise<void>;
}

export interface PencilKitPlugin {
  open(options: {
    documentId: EntityId;
    color: string;
    width: number;
  }): Promise<{ saved: boolean }>;
}
