import type { AssetRef, EntityId } from "../domain/models";
import type { DrawingGridSettings } from "../domain/models";

export type RecordingState =
  | "idle"
  | "recording"
  | "paused"
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
  powerLevel?: number;
};

export interface JournalAudioPlugin {
  startMonitoring?(): Promise<{ powerLevel: number }>;
  monitorLevel?(): Promise<{ powerLevel: number }>;
  stopMonitoring?(): Promise<void>;
  start(options?: { preferredFormat?: "m4a"; maximumDurationMs?: number }): Promise<RecordingSnapshot>;
  status(): Promise<RecordingSnapshot>;
  pauseRecording?(): Promise<RecordingSnapshot>;
  resumeRecording?(): Promise<RecordingSnapshot>;
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
  openUrl(options: { url: string }): Promise<{ opened: boolean }>;
}

export interface NativeJournalStorePlugin {
  read(): Promise<{ available: boolean; contents?: string }>;
  write(options: { contents: string }): Promise<void>;
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
  backupDeviceName?: string;
  backupDeviceIdentifier?: string;
  currentDeviceName?: string;
  currentDeviceIdentifier?: string;
  contentFingerprint?: string;
};

export type CloudBackupAsset = {
  id: string;
  kind: "audio" | "photo" | "drawing";
  localUri?: string;
  drawingDocumentId?: string;
  mimeType: string;
  checksum?: string;
};

export type CloudBackupHistoryReason = "automatic" | "manual" | "before-restore";

export type CloudBackupHistoryEntry = {
  id: string;
  capturedAt: string;
  entryDay: string;
  reason: CloudBackupHistoryReason;
  deviceName: string;
  revision: number;
  assetCount: number;
  byteLength: number;
  protected: boolean;
};

export interface CloudBackupPlugin {
  status(): Promise<CloudBackupResult>;
  backupSnapshot(options: {
    snapshotJson: string;
    revision: number;
    contentFingerprint: string;
    expectedCloudFingerprint?: string;
  }): Promise<CloudBackupResult>;
  backupAssets(options: { assets: CloudBackupAsset[] }): Promise<CloudBackupResult>;
  restore(): Promise<{
    snapshotJson: string;
    backedUpAt?: string;
    restoredAssetUris: Record<string, string>;
  }>;
  listHistory(): Promise<{ entries: CloudBackupHistoryEntry[] }>;
  createHistory(options: {
    snapshotJson: string;
    revision: number;
    entryDay: string;
    timeZoneIdentifier: string;
    reason: CloudBackupHistoryReason;
    assets: CloudBackupAsset[];
  }): Promise<{ entry: CloudBackupHistoryEntry }>;
  restoreHistory(options: { id: string }): Promise<{
    snapshotJson: string;
    backedUpAt: string;
    restoredAssetUris: Record<string, string>;
  }>;
  deleteHistory(options: { id: string }): Promise<void>;
  deleteCloudData(): Promise<void>;
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
  service: "audio" | "transcription" | "files" | "lifecycle" | "backup" | "share";
};

export type PageShareFormat = "jpg" | "pdf";

export type PageShareLink = {
  url: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PageExportResult = {
  fileUri: string;
  fileName: string;
};

export type DiaryExportResult = {
  pdfFileUri: string;
  archiveFileUri: string;
  missingAssetIDs?: string[];
};

export type NativeShareResult = {
  completed: boolean;
  activityType?: string;
};

export interface NativeSharePlugin {
  exportDiary(options: {
    snapshotJson: string;
    readableText: string;
    assets: CloudBackupAsset[];
  }): Promise<DiaryExportResult>;
  exportPage(options: {
    format: PageShareFormat;
    title: string;
    fileStem: string;
    paperRect: PencilKitOverlayRect;
    captureMode?: "drawing" | "webview";
    documentId?: string;
    previewInsetTop?: number;
    transcripts?: string[];
    links?: PageShareLink[];
  }): Promise<PageExportResult>;
  share(options: {
    title: string;
    text?: string;
    fileUris: string[];
    sourceRect: PencilKitOverlayRect;
  }): Promise<NativeShareResult>;
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

export type NativeTextEditorOptions = {
  initialText: string;
  mode: "add" | "edit";
  contextualStrings: string[];
  recordingLimitMilliseconds?: number;
  localeIdentifier?: string;
};

export type NativeTextEditorResult = {
  cancelled: boolean;
  text: string;
};

export interface NativeTextEditorPlugin {
  open(options: NativeTextEditorOptions): Promise<NativeTextEditorResult>;
}

export interface AppOrientationPlugin {
  setLandscapeLocked(options: { locked: boolean }): Promise<void>;
}

export type NativeOverlayShape = {
  kind: "circle" | "polygon" | "freeform";
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDegrees: number;
  points: Array<{ x: number; y: number }>;
  fillColor?: string;
  outlineColor?: string;
  outlineWidth: number;
};

export interface PencilKitPlugin {
  addListener(
    eventName: "drawingChanged",
    listener: (event: { documentId: string }) => void,
  ): Promise<{ remove(): Promise<void> }>;
  addListener(
    eventName: "overlayTapped",
    listener: (event: { documentId: string; x: number; y: number }) => void,
  ): Promise<{ remove(): Promise<void> }>;
  addListener(
    eventName: "overlayLongPressed",
    listener: (event: { documentId: string; x: number; y: number }) => void,
  ): Promise<{ remove(): Promise<void> }>;
  open(options: {
    documentId: EntityId;
    color: string;
    width: number;
    opacity?: number;
    fingerDrawing?: boolean;
    twoFingerUndo?: boolean;
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
    twoFingerUndo?: boolean;
    tool: "pen" | "eraser";
    rect: PencilKitOverlayRect;
    clipShape?: "circle";
    legacyInk?: LegacyInkDocument;
    grid?: DrawingGridSettings;
    gridOriginX?: number;
    gridOriginY?: number;
    gridPageWidth?: number;
    gridPageHeight?: number;
    gridDocumentWidth?: number;
    gridDocumentHeight?: number;
    overlayShapes?: NativeOverlayShape[];
  }): Promise<{ visible: boolean; importedLegacyStrokes?: boolean }>;
  updateOverlay(options: {
    color?: string;
    nib?: "pen" | "marker" | "pencil" | "brush";
    width?: number;
    opacity?: number;
    fingerDrawing?: boolean;
    twoFingerUndo?: boolean;
    tool?: "pen" | "eraser";
    rect?: PencilKitOverlayRect;
    clipShape?: "circle";
    grid?: DrawingGridSettings;
    gridOriginX?: number;
    gridOriginY?: number;
    gridPageWidth?: number;
    gridPageHeight?: number;
    overlayShapes?: NativeOverlayShape[];
    gridDocumentWidth?: number;
    gridDocumentHeight?: number;
  }): Promise<{ visible: boolean }>;
  hideOverlay(options?: { save?: boolean }): Promise<PencilKitPreview>;
  flushOverlay(): Promise<PencilKitPreview>;
  clearOverlay(): Promise<PencilKitPreview>;
  deleteDrawing(options: {
    documentId: EntityId;
  }): Promise<{ deleted: boolean }>;
  undoOverlay(): Promise<{ undone: boolean }>;
  redoOverlay(): Promise<{ redone: boolean }>;
  getPreview(options: {
    documentId: EntityId;
    width?: number;
    height?: number;
  }): Promise<PencilKitPreview>;
}

export type PencilKitPreview = {
  saved: boolean;
  available: boolean;
  /** True only when hide dismissed a currently presented overlay. */
  didHide?: boolean;
  previewUri?: string;
  modifiedAt?: number;
};
