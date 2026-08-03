export const DOCUMENT_SCHEMA_VERSION = 1 as const;

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

type PageObjectBase = {
  id: EntityId;
  pageId: EntityId;
  position: Position;
  frame?: Size;
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
};

export type PhotoObject = PageObjectBase & {
  type: "photo";
  asset: AssetRef;
  size: Size;
  altText?: string;
};

export type TextObject = PageObjectBase & {
  type: "text";
  text: string;
  textScale: number;
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
  simpleMode: boolean;
  textScale: "standard" | "large" | "extra-large";
  contrast: "warm" | "high";
  reducedMotion: boolean;
  penColor: string;
  penWidth: number;
  welcomeGreeting: string;
  welcomeTagline: string;
  welcomeMessage: string;
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
        type: "sketchbook-rename";
        sketchbookId: EntityId;
        name: string;
      }
    | {
        type: "sketchbooks-reorder";
        sketchbookIds: EntityId[];
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
