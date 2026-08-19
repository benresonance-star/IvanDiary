export const DOCUMENT_SCHEMA_VERSION = 1 as const;
export const MAX_PAGES_PER_COLLECTION = 10;

export type EntityId = string;
export type IsoDate = string;
export type IsoDateTime = string;

export type Position = {
  x: number;
  y: number;
};

export type Size = {
  width: number;
  height: number;
};

export type AssetRef = {
  id: EntityId;
  localUri: string;
  remotePath?: string;
  mimeType: string;
  byteLength: number;
  checksum: string;
};

export type SaveHealth = {
  localDurability: "saving" | "saved" | "error";
  remoteSync: "offline" | "pending" | "syncing" | "synced" | "error";
  durableRevision: number;
  pendingOperationCount: number;
  message?: string;
};

export type PaperStyle =
  | "warm-journal"
  | "sketch-paper"
  | "clean-paper"
  | "warm-grey"
  | "dark-paper";

export type DrawingGridSettings = {
  enabled: boolean;
  snapToGrid: boolean;
  spacing: 36 | 60 | 96;
  rotationDegrees: number;
  type: "lines" | "dots";
  color: string;
};

export const GRID_ROTATION_STEP = 15;
export const GRID_ROTATION_MAX = 75;
export const DEFAULT_GRID_COLOR = "#435b70";

type PageObjectBase = {
  id: EntityId;
  pageId: EntityId;
  position: Position;
  frame?: Size;
  layer?: "above-sketch" | "behind-sketch";
  createdAt: IsoDateTime;
  revision: number;
};

export type VoiceRecordingObject = PageObjectBase & {
  type: "voice";
  asset: AssetRef;
  durationMs: number;
  transcriptionStatus: TranscriptionStatus;
};

export type TranscriptionStatus =
  | "not-requested"
  | "pending"
  | "transcribing"
  | "complete"
  | "failed";

export type TranscriptObject = PageObjectBase & {
  type: "transcript";
  recordingId: EntityId;
  rawText: string;
  editedText?: string;
  locale: string;
  engine: "apple-speech";
  segments?: TranscriptionSegment[];
};

export type TranscriptionSegment = {
  text: string;
  startMs: number;
  durationMs: number;
  confidence?: number;
  alternatives?: string[];
};

export type PhotoObject = PageObjectBase & {
  type: "photo";
  asset: AssetRef;
  size: Size;
  altText?: string;
  /** When unset, Edit mode keeps the photograph’s original proportions. */
  lockAspectRatio?: boolean;
};

export type TextObject = PageObjectBase & {
  type: "text";
  text: string;
  /** Retained for compatibility; canvas text size follows JournalSettings.textScale. */
  textScale: number;
  textAlign?: "left" | "center";
};

export type LinkObject = PageObjectBase & {
  type: "link";
  url: string;
  title: string;
  description?: string;
  previewAsset?: AssetRef;
};

export type PageObject =
  | VoiceRecordingObject
  | TranscriptObject
  | PhotoObject
  | TextObject
  | LinkObject;

export type Page = {
  schemaVersion: typeof DOCUMENT_SCHEMA_VERSION;
  id: EntityId;
  journalDayId?: EntityId;
  sketchbookId?: EntityId;
  paperStyle: PaperStyle;
  drawingDocumentId: EntityId;
  drawingGrid?: DrawingGridSettings;
  objects: PageObject[];
  revision: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
};

export type JournalDay = {
  id: EntityId;
  date: IsoDate;
  pageIds: EntityId[];
  favourite: boolean;
  thumbnailAsset?: AssetRef;
  revision: number;
};

export type Sketchbook = {
  id: EntityId;
  name: string;
  pageIds: EntityId[];
  favourite: boolean;
  revision: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
};

export type MyStoryTextRole = "title" | "heading" | "body";

export type MyStoryTextBlock = {
  id: EntityId;
  text: string;
  role: MyStoryTextRole;
  color: string;
  revision: number;
  createdAt: IsoDateTime;
};

export type MyStoryPhoto = {
  id: EntityId;
  asset: AssetRef;
  size: Size;
  altText?: string;
  width: 0.5 | 0.75 | 1;
  revision: number;
  createdAt: IsoDateTime;
};

export type MyStoryVoiceRecording = {
  id: EntityId;
  asset: AssetRef;
  durationMs: number;
  transcriptionStatus: TranscriptionStatus;
  position?: Position;
  frame?: Size;
  layer?: "above-sketch" | "behind-sketch";
  revision: number;
  createdAt: IsoDateTime;
};

export type MyStoryLink = {
  id: EntityId;
  url: string;
  title: string;
  revision: number;
  createdAt: IsoDateTime;
};

export type MyStoryPage = {
  id: EntityId;
  drawingDocumentId: EntityId;
  splitRatio: number;
  textSide: "left" | "right";
  textBackgroundColor: string;
  textColor: string;
  textBlocks: MyStoryTextBlock[];
  photos: MyStoryPhoto[];
  links: MyStoryLink[];
  recordings: MyStoryVoiceRecording[];
  revision: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
};

export type MyStory = {
  defaultTextColor: string;
  pages: MyStoryPage[];
};

export type Favourite = {
  id: EntityId;
  targetType: "journal-day" | "page" | "sketchbook";
  targetId: EntityId;
  createdAt: IsoDateTime;
};

export type JournalSettings = {
  displayName: string;
  lastSettingsTab: SettingsTabId;
  textScale: "standard" | "large" | "extra-large";
  contrast: "warm" | "high";
  reducedMotion: boolean;
  penColor: string;
  penWidth: number;
  penOpacity: number;
  fingerDrawingEnabled: boolean;
  fingerErasingEnabled: boolean;
  twoFingerUndoEnabled: boolean;
  favouritePenColours: string[];
  standardAppAppearance: boolean;
  penNib: "pen" | "marker" | "pencil" | "brush";
  penNibProfiles: Record<
    "pen" | "marker" | "pencil" | "brush",
    { color: string; width: number; opacity: number }
  >;
  welcomeGreeting: string;
  welcomeTagline: string;
  welcomeMessage: string;
  textEditorPreference: "native" | "standard";
  recordingLimitMinutes: 2 | 5 | 10 | 30 | null;
  automaticBackup: boolean;
  backupOnWifiOnly: boolean;
  myWords: MyWord[];
};

export type SettingsTabId = "about" | "welcome" | "canvas" | "voice" | "appearance" | "backup";

export type BackupHistoryReason = "automatic" | "manual" | "before-restore";

export type BackupHistoryEntry = {
  id: EntityId;
  capturedAt: IsoDateTime;
  entryDay: IsoDate;
  reason: BackupHistoryReason;
  deviceName: string;
  revision: number;
  assetCount: number;
  byteLength: number;
  protected: boolean;
};

export type BackupHistoryStatus = {
  state: "idle" | "loading" | "creating" | "restoring" | "error";
  entries: BackupHistoryEntry[];
  message?: string;
};

export type BackupStatus = {
  state: "not-configured" | "available" | "waiting" | "syncing" | "synced" | "error";
  pendingItemCount: number;
  lastSuccessfulBackupAt?: IsoDateTime;
  message: string;
  accountDescription?: string;
  containerIdentifier?: string;
  databaseDescription?: string;
  recordIdentifier?: string;
  failedItems?: BackupFailedItem[];
  backedUpRevision?: number;
  backupDeviceName?: string;
  backupDeviceIdentifier?: string;
  currentDeviceName?: string;
  currentDeviceIdentifier?: string;
  contentFingerprint?: string;
  conflictDetected?: boolean;
};

export type BackupFailedItem = {
  id: string;
  kind: "audio" | "photo" | "drawing" | "unknown";
  reason: string;
};

export type MyWord = {
  id: EntityId;
  text: string;
  category?: "people" | "places" | "activities" | "medical" | "other";
  enabled: boolean;
  correctionCount: number;
  sample?: AssetRef;
};

export type JournalSnapshot = {
  schemaVersion: typeof DOCUMENT_SCHEMA_VERSION;
  id: EntityId;
  days: JournalDay[];
  pages: Page[];
  sketchbooks: Sketchbook[];
  favourites: Favourite[];
  myStory?: MyStory;
  settings: JournalSettings;
  appliedOperationIds: EntityId[];
  revision: number;
  updatedAt: IsoDateTime;
};

type OperationBase = {
  id: EntityId;
  journalId: EntityId;
  baseRevision: number;
  resultingRevision: number;
  createdAt: IsoDateTime;
};

export type DocumentOperation = OperationBase &
  (
    | {
      type: "journal-day-create";
      day: JournalDay;
    }
    | {
      type: "page-create";
        journalDayId: EntityId;
      page: Page;
    }
    | {
        type: "journal-pages-reorder";
        journalDayId: EntityId;
        pageIds: EntityId[];
      }
    | {
      type: "sketchbook-create";
      sketchbook: Sketchbook;
    }
    | {
        type: "sketchbook-create-with-page";
        sketchbook: Sketchbook;
        page: Page;
      }
    | {
        type: "sketchbook-page-create";
        sketchbookId: EntityId;
        page: Page;
      }
    | {
        type: "sketchbook-pages-reorder";
        sketchbookId: EntityId;
        pageIds: EntityId[];
      }
    | {
        type: "page-delete";
        pageId: EntityId;
      }
    | {
        type: "sketchbook-rename";
        sketchbookId: EntityId;
        name: string;
      }
    | {
        type: "sketchbook-delete";
        sketchbookId: EntityId;
      }
    | {
        type: "sketchbooks-reorder";
        sketchbookIds: EntityId[];
      }
    | {
        type: "favourites-reorder";
        favouriteIds: EntityId[];
      }
    | {
      type: "favourite-set";
      targetType: Favourite["targetType"];
      targetId: EntityId;
      favourite: boolean;
    }
    | {
      type: "page-object-add";
      pageId: EntityId;
      object: PageObject;
    }
    | {
      type: "page-drawing-grid-update";
      pageId: EntityId;
      grid: DrawingGridSettings;
    }
    | {
      type: "page-object-update";
      pageId: EntityId;
      object: PageObject;
    }
    | {
      type: "page-object-move";
      pageId: EntityId;
      objectId: EntityId;
      position: Position;
    }
    | {
      type: "page-object-resize";
      pageId: EntityId;
      objectId: EntityId;
      frame: Size;
    }
    | {
      type: "page-object-delete";
      pageId: EntityId;
      objectId: EntityId;
    }
    | {
      type: "page-paper-update";
      pageId: EntityId;
      paperStyle: PaperStyle;
    }
    | {
      type: "settings-update";
      settings: Partial<JournalSettings>;
    }
    | {
      type: "my-story-page-create";
      page: MyStoryPage;
    }
    | {
      type: "my-story-pages-reorder";
      pageIds: EntityId[];
    }
    | {
      type: "my-story-page-delete";
      pageId: EntityId;
    }
    | {
      type: "my-story-layout-update";
      pageId: EntityId;
      splitRatio?: number;
      textSide?: "left" | "right";
      textBackgroundColor?: string;
      textColor?: string;
    }
    | {
      type: "my-story-text-add";
      pageId: EntityId;
      block: MyStoryTextBlock;
    }
    | {
      type: "my-story-text-update";
      pageId: EntityId;
      block: MyStoryTextBlock;
    }
    | {
      type: "my-story-text-delete";
      pageId: EntityId;
      blockId: EntityId;
    }
    | {
      type: "my-story-texts-reorder";
      pageId: EntityId;
      blockIds: EntityId[];
    }
    | {
      type: "my-story-photo-add";
      pageId: EntityId;
      photo: MyStoryPhoto;
    }
    | {
      type: "my-story-photo-update";
      pageId: EntityId;
      photo: MyStoryPhoto;
    }
    | {
      type: "my-story-photo-delete";
      pageId: EntityId;
      photoId: EntityId;
    }
    | {
      type: "my-story-photos-reorder";
      pageId: EntityId;
      photoIds: EntityId[];
    }
    | {
      type: "my-story-recording-add";
      pageId: EntityId;
      recording: MyStoryVoiceRecording;
    }
    | {
      type: "my-story-recording-update";
      pageId: EntityId;
      recording: MyStoryVoiceRecording;
    }
    | {
      type: "my-story-recording-delete";
      pageId: EntityId;
      recordingId: EntityId;
    }
    | {
      type: "my-story-link-add";
      pageId: EntityId;
      link: MyStoryLink;
    }
    | {
      type: "my-story-link-update";
      pageId: EntityId;
      link: MyStoryLink;
    }
    | {
      type: "my-story-link-delete";
      pageId: EntityId;
      linkId: EntityId;
    }
    | {
      type: "my-story-links-reorder";
      pageId: EntityId;
      linkIds: EntityId[];
    }
    | {
      type: "drawing-stroke-add";
      drawingDocumentId: EntityId;
      strokeId: EntityId;
    }
    | {
      type: "drawing-stroke-delete";
      drawingDocumentId: EntityId;
      strokeId: EntityId;
    }
  );

type WithoutOperationMetadata<T> = T extends OperationBase
  ? Omit<T, keyof OperationBase>
  : never;

export type DocumentOperationInput =
  WithoutOperationMetadata<DocumentOperation>;
