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
  transcriptionStatus:
    | "not-requested"
    | "pending"
    | "transcribing"
    | "complete"
    | "failed";
};

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
  /** When unset, Arrange keeps the photograph’s original proportions. */
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
  favouritePenColours: string[];
  favouriteColourLongPressEnabled: boolean;
  favouriteColourLongPressSeconds: number;
  penNib: "pen" | "marker" | "pencil" | "brush";
  penNibProfiles: Record<
    "pen" | "marker" | "pencil" | "brush",
    { color: string; width: number; opacity: number }
  >;
  welcomeGreeting: string;
  welcomeTagline: string;
  welcomeMessage: string;
  recordingLimitMinutes: 2 | 5 | 10 | 30 | null;
  automaticBackup: boolean;
  backupOnWifiOnly: boolean;
  myWords: MyWord[];
};

export type SettingsTabId = "about" | "welcome" | "canvas" | "voice" | "appearance" | "backup";

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
