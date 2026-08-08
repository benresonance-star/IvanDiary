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

export type JournalServiceErrorCode =
  | "permission-denied"
  | "interrupted"
  | "low-storage"
  | "asset-missing"
  | "asset-corrupt"
  | "service-unavailable"
  | "native-failure";

export type JournalServiceErrorDetails = {
  code: JournalServiceErrorCode;
  message: string;
  action: string;
  retryable: boolean;
  service: "audio" | "transcription" | "files" | "lifecycle";
};

export interface NativeSharePlugin {
  share(options: {
    title: string;
    text?: string;
    assetUris?: string[];
  }): Promise<void>;
}

export type PencilKitOverlayRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LegacyInkPoint = {
  x: number;
  y: number;
  pressure: number;
  timestamp: number;
};

export type LegacyInkStroke = {
  color: string;
  width: number;
  points: LegacyInkPoint[];
};

export type LegacyInkDocument = {
  width: number;
  height: number;
  strokes: LegacyInkStroke[];
};

export interface PencilKitPlugin {
  open(options: {
    documentId: EntityId;
    color: string;
    width: number;
    opacity?: number;
    initialTool: "pen" | "eraser";
    backgroundDataUrl?: string;
  }): Promise<PencilKitPreview>;
  showOverlay(options: {
    documentId: EntityId;
    color: string;
    width: number;
    opacity?: number;
    tool: "pen" | "eraser";
    rect: PencilKitOverlayRect;
    legacyInk?: LegacyInkDocument;
  }): Promise<{ visible: boolean; importedLegacyStrokes?: boolean }>;
  updateOverlay(options: {
    color?: string;
    width?: number;
    opacity?: number;
    tool?: "pen" | "eraser";
    rect?: PencilKitOverlayRect;
  }): Promise<{ visible: boolean }>;
  hideOverlay(options?: { save?: boolean }): Promise<PencilKitPreview>;
  flushOverlay(): Promise<PencilKitPreview>;
  undoOverlay(): Promise<{ undone: boolean }>;
  getPreview(options: { documentId: EntityId }): Promise<PencilKitPreview>;
}

export type PencilKitPreview = {
  saved: boolean;
  available: boolean;
  /** True only when hide dismissed a currently presented overlay. */
  didHide?: boolean;
  previewUri?: string;
  modifiedAt?: number;
};
