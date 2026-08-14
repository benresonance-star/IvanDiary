import type { AssetRef, EntityId } from "../domain/models";
import type { DrawingGridSettings } from "../domain/models";

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
  temporaryUri?: string;
  asset?: AssetRef;
  message?: string;
};

export interface JournalAudioPlugin {
  start(options?: { preferredFormat?: "m4a"; maximumDurationMs?: number }): Promise<RecordingSnapshot>;
  status(): Promise<RecordingSnapshot>;
  stop(): Promise<RecordingSnapshot>;
  acknowledgeSaved(): Promise<RecordingSnapshot>;
  recoverInterrupted(): Promise<{ recordings: RecordingSnapshot[] }>;
  play(options: { assetUri: string; startMs?: number; durationMs?: number }): Promise<{ playing: boolean }>;
  pausePlayback(): Promise<{ playing: boolean }>;
  addListener(
    eventName: "playbackEnded",
    listener: (event: { assetUri: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
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
    confidence?: number;
    alternatives?: string[];
  }>;
};

export interface AppleTranscriptionPlugin {
  requestPermission(): Promise<{ granted: boolean }>;
  transcribe(options: {
    recordingId: EntityId;
    asset: AssetRef;
    locale?: string;
    contextualStrings?: string[];
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

export type CloudBackupResult = {
  state: "available" | "no-account" | "restricted" | "waiting" | "synced" | "error";
  message: string;
  lastSuccessfulBackupAt?: string;
  accountDescription?: string;
  containerIdentifier?: string;
  databaseDescription?: string;
  recordIdentifier?: string;
  uploadedItemCount?: number;
  failedItemCount?: number;
  failedItems?: Array<{
    id: string;
    kind: "audio" | "photo" | "drawing" | "unknown";
    reason: string;
  }>;
  backedUpRevision?: number;
};

export type CloudBackupAsset = {
  id: string;
  kind: "audio" | "photo" | "drawing";
  localUri?: string;
  drawingDocumentId?: string;
  mimeType: string;
  checksum?: string;
};

export interface CloudBackupPlugin {
  status(): Promise<CloudBackupResult>;
  backupSnapshot(options: {
    snapshotJson: string;
    revision: number;
  }): Promise<CloudBackupResult>;
  backupAssets(options: { assets: CloudBackupAsset[] }): Promise<CloudBackupResult>;
  restore(): Promise<{
    snapshotJson: string;
    backedUpAt?: string;
    restoredAssetUris: Record<string, string>;
  }>;
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
  service: "audio" | "transcription" | "files" | "lifecycle" | "backup";
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
  addListener(
    eventName: "drawingChanged",
    listener: (event: { documentId: string }) => void,
  ): Promise<{ remove(): Promise<void> }>;
  open(options: {
    documentId: EntityId;
    color: string;
    width: number;
    opacity?: number;
    fingerDrawing?: boolean;
    initialTool: "pen" | "eraser";
    backgroundDataUrl?: string;
  }): Promise<PencilKitPreview>;
  showOverlay(options: {
    documentId: EntityId;
    color: string;
    nib?: "pen" | "marker" | "pencil" | "brush";
    width: number;
    opacity?: number;
    fingerDrawing?: boolean;
    tool: "pen" | "eraser";
    rect: PencilKitOverlayRect;
    clipShape?: "circle";
    legacyInk?: LegacyInkDocument;
    grid?: DrawingGridSettings;
    gridOriginX?: number;
    gridOriginY?: number;
    gridPageWidth?: number;
    gridPageHeight?: number;
  }): Promise<{ visible: boolean; importedLegacyStrokes?: boolean }>;
  updateOverlay(options: {
    color?: string;
    nib?: "pen" | "marker" | "pencil" | "brush";
    width?: number;
    opacity?: number;
    fingerDrawing?: boolean;
    tool?: "pen" | "eraser";
    rect?: PencilKitOverlayRect;
    clipShape?: "circle";
    grid?: DrawingGridSettings;
    gridOriginX?: number;
    gridOriginY?: number;
    gridPageWidth?: number;
    gridPageHeight?: number;
  }): Promise<{ visible: boolean }>;
  hideOverlay(options?: { save?: boolean }): Promise<PencilKitPreview>;
  flushOverlay(): Promise<PencilKitPreview>;
  clearOverlay(): Promise<PencilKitPreview>;
  deleteDrawing(options: {
    documentId: EntityId;
  }): Promise<{ deleted: boolean }>;
  undoOverlay(): Promise<{ undone: boolean }>;
  redoOverlay(): Promise<{ redone: boolean }>;
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
