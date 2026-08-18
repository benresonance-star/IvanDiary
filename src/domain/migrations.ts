import {
  DEFAULT_GRID_COLOR,
  DOCUMENT_SCHEMA_VERSION,
  GRID_ROTATION_MAX,
  type DrawingGridSettings,
  type JournalSnapshot,
  type JournalSettings,
  type MyStory,
  type MyStoryLink,
  type MyStoryPage,
  type MyStoryPhoto,
  type MyStoryTextBlock,
  type MyStoryVoiceRecording,
  type MyWord,
  type PageObject,
  type Size,
} from "./models";
import { webHttpUrl } from "../utils/webHttpUrl";

const DEFAULT_SETTINGS: JournalSettings = {
  displayName: "Ivan",
  lastSettingsTab: "about",
  textScale: "standard",
  contrast: "warm",
  reducedMotion: false,
  penColor: "#171410",
  penWidth: 4.2,
  penOpacity: 1,
  fingerDrawingEnabled: true,
  fingerErasingEnabled: false,
  favouritePenColours: [
    "#171410", "#245b8a", "#426b3a", "#9b352f", "#6b4f82",
    "#76512f", "#c86f24", "#2f6f6d", "#a64b6b", "#686868",
  ],
  standardAppAppearance: true,
  penNib: "pen",
  penNibProfiles: {
    pen: { color: "#171410", width: 4.2, opacity: 1 },
    marker: { color: "#171410", width: 4.2, opacity: 1 },
    pencil: { color: "#171410", width: 4.2, opacity: 1 },
    brush: { color: "#171410", width: 4.2, opacity: 1 },
  },
  welcomeGreeting: "Welcome back Ivan!",
  welcomeTagline: "It's a Wonderful World!",
  welcomeMessage: "",
  textEditorPreference: "native",
  recordingLimitMinutes: 5,
  automaticBackup: false,
  backupOnWifiOnly: true,
  myWords: [],
};

export class JournalMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JournalMigrationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function welcomeText(value: unknown, fallback: string, maximum: number): string {
  return typeof value === "string"
    ? value.trim().slice(0, maximum) || fallback
    : fallback;
}

function hasSnapshotCollections(
  value: Record<string, unknown>,
): value is Record<string, unknown> & {
  days: JournalSnapshot["days"];
  pages: JournalSnapshot["pages"];
  sketchbooks: JournalSnapshot["sketchbooks"];
} {
  return (
    Array.isArray(value.days) &&
    Array.isArray(value.pages) &&
    Array.isArray(value.sketchbooks)
  );
}

function migrateSettings(value: unknown): JournalSettings {
  if (!isRecord(value)) {
    return DEFAULT_SETTINGS;
  }

  const displayName = welcomeText(value.displayName, DEFAULT_SETTINGS.displayName, 60);
  const lastSettingsTab = value.lastSettingsTab === "text"
    ? "appearance"
    : value.lastSettingsTab === "history" || value.lastSettingsTab === "privacy"
      ? "backup"
    : value.lastSettingsTab === "welcome" ||
    value.lastSettingsTab === "canvas" ||
    value.lastSettingsTab === "voice" ||
    value.lastSettingsTab === "appearance" ||
    value.lastSettingsTab === "backup"
      ? value.lastSettingsTab
      : "about";

  const textScale =
    value.textScale === "large" || value.textScale === "extra-large"
      ? value.textScale
      : "standard";
  const contrast = value.contrast === "high" ? "high" : "warm";
  const reducedMotion =
    typeof value.reducedMotion === "boolean" ? value.reducedMotion : false;
  const penColor =
    typeof value.penColor === "string" &&
    /^#[0-9a-f]{6}$/i.test(value.penColor)
      ? value.penColor
      : DEFAULT_SETTINGS.penColor;
  const penWidth =
    typeof value.penWidth === "number" && Number.isFinite(value.penWidth)
      ? Math.min(28, Math.max(1, value.penWidth))
      : DEFAULT_SETTINGS.penWidth;
  const penOpacity =
    typeof value.penOpacity === "number" && Number.isFinite(value.penOpacity)
      ? Math.min(1, Math.max(0, value.penOpacity))
      : DEFAULT_SETTINGS.penOpacity;
  const fingerDrawingEnabled = value.fingerDrawingEnabled !== false;
  const fingerErasingEnabled = value.fingerErasingEnabled === true;
  const favouritePenColours = Array.isArray(value.favouritePenColours) &&
    value.favouritePenColours.length === 10
    ? value.favouritePenColours.map((colour, index) =>
        typeof colour === "string" && /^#[0-9a-f]{6}$/i.test(colour)
          ? colour
          : DEFAULT_SETTINGS.favouritePenColours[index]!,
      )
    : [...DEFAULT_SETTINGS.favouritePenColours];
  const standardAppAppearance = value.standardAppAppearance !== false;
  const penNib =
    value.penNib === "marker" ||
    value.penNib === "pencil" ||
    value.penNib === "brush"
      ? value.penNib
      : "pen";
  const penNibProfiles = Object.fromEntries(
    (["pen", "marker", "pencil", "brush"] as const).map((nib) => {
      const candidate = isRecord(value.penNibProfiles)
        ? value.penNibProfiles[nib]
        : undefined;
      if (!isRecord(candidate)) return [nib, {
        color: penColor,
        width: penWidth,
        opacity: penOpacity,
      }];
      return [nib, {
        color:
          typeof candidate.color === "string" &&
          /^#[0-9a-f]{6}$/i.test(candidate.color)
            ? candidate.color
            : penColor,
        width:
          typeof candidate.width === "number" &&
          Number.isFinite(candidate.width)
            ? Math.min(28, Math.max(1, candidate.width))
            : penWidth,
        opacity:
          typeof candidate.opacity === "number" &&
          Number.isFinite(candidate.opacity)
            ? Math.min(1, Math.max(0, candidate.opacity))
            : penOpacity,
      }];
    }),
  ) as JournalSettings["penNibProfiles"];
  const welcomeGreeting = welcomeText(
    value.welcomeGreeting,
    DEFAULT_SETTINGS.welcomeGreeting,
    100,
  );
  const welcomeTagline = welcomeText(
    value.welcomeTagline,
    DEFAULT_SETTINGS.welcomeTagline,
    140,
  );
  const welcomeMessage =
    typeof value.welcomeMessage === "string"
      ? value.welcomeMessage.trim().slice(0, 500)
      : DEFAULT_SETTINGS.welcomeMessage;
  const textEditorPreference =
    value.textEditorPreference === "standard" ? "standard" : "native";
  const recordingLimitMinutes =
    value.recordingLimitMinutes === null ||
    value.recordingLimitMinutes === 2 ||
    value.recordingLimitMinutes === 5 ||
    value.recordingLimitMinutes === 10 ||
    value.recordingLimitMinutes === 30
      ? value.recordingLimitMinutes
      : DEFAULT_SETTINGS.recordingLimitMinutes;
  const automaticBackup =
    typeof value.automaticBackup === "boolean"
      ? value.automaticBackup
      : DEFAULT_SETTINGS.automaticBackup;
  const backupOnWifiOnly =
    typeof value.backupOnWifiOnly === "boolean"
      ? value.backupOnWifiOnly
      : DEFAULT_SETTINGS.backupOnWifiOnly;
  const myWords = Array.isArray(value.myWords)
    ? value.myWords.flatMap((candidate) => {
        if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.text !== "string") return [];
        const text = candidate.text.trim().slice(0, 80);
        if (!text) return [];
        return [{
          id: candidate.id,
          text,
          enabled: candidate.enabled !== false,
          correctionCount: typeof candidate.correctionCount === "number" ? Math.max(0, candidate.correctionCount) : 0,
          ...(candidate.category === "people" || candidate.category === "places" || candidate.category === "activities" || candidate.category === "medical" || candidate.category === "other"
            ? { category: candidate.category as MyWord["category"] }
            : {}),
          ...(isRecord(candidate.sample) ? { sample: candidate.sample as JournalSettings["myWords"][number]["sample"] } : {}),
        }];
      }).slice(0, 100)
    : [];

  return {
    displayName,
    lastSettingsTab,
    textScale,
    contrast,
    reducedMotion,
    penColor,
    penWidth,
    penOpacity,
    fingerDrawingEnabled,
    fingerErasingEnabled,
    favouritePenColours,
    standardAppAppearance,
    penNib,
    penNibProfiles,
    welcomeGreeting,
    welcomeTagline,
    welcomeMessage,
    textEditorPreference,
    recordingLimitMinutes,
    automaticBackup,
    backupOnWifiOnly,
    myWords,
  };
}

function defaultFrame(object: PageObject): Size | undefined {
  switch (object.type) {
    case "voice":
      return { width: 0.28, height: 0.23 };
    case "text":
      return { width: 0.26, height: 0.18 };
    case "link":
      return { width: 0.26, height: 0.1 };
    case "photo":
      return { width: 0.22, height: 0.3 };
    case "transcript":
      return undefined;
    default: {
      const exhaustiveObject: never = object;
      throw new Error(`Unsupported page object: ${exhaustiveObject}`);
    }
  }
}

function migratePageFrames(
  pages: JournalSnapshot["pages"],
): JournalSnapshot["pages"] {
  return pages.map((page) => {
    const grid = page.drawingGrid as Partial<DrawingGridSettings> | undefined;
    const spacing =
      grid && [36, 60, 96].includes(grid.spacing ?? 0)
        ? grid.spacing as DrawingGridSettings["spacing"]
        : 60;
    const rotationDegrees =
      typeof grid?.rotationDegrees === "number" &&
      Number.isInteger(grid.rotationDegrees / 15) &&
      Math.abs(grid.rotationDegrees) <= GRID_ROTATION_MAX
        ? grid.rotationDegrees
        : 0;
    const drawingGrid = grid
      ? {
          enabled: grid.enabled === true,
          snapToGrid: grid.snapToGrid !== false,
          spacing,
          rotationDegrees,
          type: grid.type === "dots" ? "dots" as const : "lines" as const,
          color:
            typeof grid.color === "string" &&
            /^#[0-9a-f]{6}$/i.test(grid.color)
              ? grid.color
              : DEFAULT_GRID_COLOR,
        }
      : undefined;
    return {
      ...page,
      ...(drawingGrid ? { drawingGrid } : {}),
      objects: page.objects.map((object) => {
        const frame = object.frame ?? defaultFrame(object);
        return frame ? { ...object, frame } : object;
      }),
    };
  });
}

function defaultStoryPage(timestamp: string): MyStoryPage {
  return {
    id: "my-story-page-1",
    drawingDocumentId: "my-story-drawing-1",
    splitRatio: 0.5,
    textSide: "left",
    textBackgroundColor: "#fffaf0",
    textColor: "#171410",
    textBlocks: [],
    photos: [],
    links: [],
    recordings: [],
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function migrateMyStory(value: unknown, timestamp: string): MyStory {
  if (!isRecord(value) || !Array.isArray(value.pages)) {
    return {
      defaultTextColor: "#171410",
      pages: [defaultStoryPage(timestamp)],
    };
  }
  const pages = value.pages.flatMap((candidate): MyStoryPage[] => {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== "string" ||
      typeof candidate.drawingDocumentId !== "string"
    ) {
      return [];
    }
    const textBlocks = Array.isArray(candidate.textBlocks)
      ? candidate.textBlocks.flatMap((block): MyStoryTextBlock[] => {
          if (
            !isRecord(block) ||
            typeof block.id !== "string" ||
            typeof block.text !== "string"
          ) {
            return [];
          }
          const text = block.text.trim().slice(0, 10_000);
          if (!text) {
            return [];
          }
          return [{
            id: block.id,
            text,
            role:
              block.role === "title" || block.role === "heading"
                ? block.role
                : "body",
            color:
              typeof block.color === "string" &&
              /^#[0-9a-f]{6}$/i.test(block.color)
                ? block.color
                : "#171410",
            revision:
              typeof block.revision === "number" ? block.revision : 0,
            createdAt:
              typeof block.createdAt === "string"
                ? block.createdAt
                : timestamp,
          }];
        })
      : [];
    const photos = Array.isArray(candidate.photos)
      ? candidate.photos.flatMap((photo): MyStoryPhoto[] => {
          if (
            !isRecord(photo) ||
            typeof photo.id !== "string" ||
            !isRecord(photo.asset) ||
            !isRecord(photo.size) ||
            typeof photo.size.width !== "number" ||
            typeof photo.size.height !== "number"
          ) {
            return [];
          }
          return [{
            id: photo.id,
            asset: photo.asset as MyStoryPhoto["asset"],
            size: {
              width: Math.max(1, photo.size.width),
              height: Math.max(1, photo.size.height),
            },
            ...(typeof photo.altText === "string"
              ? { altText: photo.altText.slice(0, 300) }
              : {}),
            width:
              photo.width === 0.5 || photo.width === 0.75
                ? photo.width
                : 1,
            revision:
              typeof photo.revision === "number" ? photo.revision : 0,
            createdAt:
              typeof photo.createdAt === "string"
                ? photo.createdAt
                : timestamp,
          }];
        })
      : [];
    const recordings = Array.isArray(candidate.recordings)
      ? candidate.recordings.flatMap(
          (recording, index): MyStoryVoiceRecording[] => {
            if (
              !isRecord(recording) ||
              typeof recording.id !== "string" ||
              !isRecord(recording.asset) ||
              typeof recording.durationMs !== "number"
            ) {
              return [];
            }
            const transcriptionStatus =
              recording.transcriptionStatus === "pending" ||
              recording.transcriptionStatus === "transcribing" ||
              recording.transcriptionStatus === "complete" ||
              recording.transcriptionStatus === "failed"
                ? recording.transcriptionStatus
                : "not-requested";
            return [{
              id: recording.id,
              asset: recording.asset as MyStoryVoiceRecording["asset"],
              durationMs: Math.max(0, recording.durationMs),
              transcriptionStatus,
              position:
                isRecord(recording.position) &&
                typeof recording.position.x === "number" &&
                typeof recording.position.y === "number"
                  ? {
                      x: Math.min(0.9, Math.max(0, recording.position.x)),
                      y: Math.min(0.9, Math.max(0, recording.position.y)),
                    }
                  : {
                      x: 0.06 + (index % 3) * 0.3,
                      y: Math.min(
                        0.84,
                        0.7 + Math.floor(index / 3) * 0.12,
                      ),
                    },
              frame:
                isRecord(recording.frame) &&
                typeof recording.frame.width === "number" &&
                typeof recording.frame.height === "number"
                  ? {
                      width: Math.min(
                        0.8,
                        Math.max(0.12, recording.frame.width),
                      ),
                      height: Math.min(
                        0.5,
                        Math.max(0.08, recording.frame.height),
                      ),
                    }
                  : { width: 0.26, height: 0.1 },
              layer:
                recording.layer === "behind-sketch"
                  ? "behind-sketch"
                  : "above-sketch",
              revision:
                typeof recording.revision === "number"
                  ? recording.revision
                  : 0,
              createdAt:
                typeof recording.createdAt === "string"
                  ? recording.createdAt
                  : timestamp,
            }];
          },
        )
      : [];
    const links = Array.isArray(candidate.links)
      ? candidate.links.flatMap((link): MyStoryLink[] => {
          if (
            !isRecord(link) ||
            typeof link.id !== "string" ||
            typeof link.url !== "string"
          ) {
            return [];
          }
          const url = webHttpUrl(link.url);
          if (!url) {
            return [];
          }
          return [{
            id: link.id,
            url,
            title:
              typeof link.title === "string" && link.title.trim()
                ? link.title.trim().slice(0, 300)
                : new URL(url).hostname,
            revision:
              typeof link.revision === "number" ? link.revision : 0,
            createdAt:
              typeof link.createdAt === "string" ? link.createdAt : timestamp,
          }];
        })
      : [];
    const splitRatio =
      typeof candidate.splitRatio === "number" &&
      Number.isFinite(candidate.splitRatio)
        ? Math.min(0.7, Math.max(0.3, candidate.splitRatio))
        : 0.5;
    return [{
      id: candidate.id,
      drawingDocumentId: candidate.drawingDocumentId,
      splitRatio,
      textSide: candidate.textSide === "right" ? "right" : "left",
      textBackgroundColor:
        typeof candidate.textBackgroundColor === "string" &&
        /^#[0-9a-f]{6}$/i.test(candidate.textBackgroundColor)
          ? candidate.textBackgroundColor
          : "#fffaf0",
      textColor:
        typeof candidate.textColor === "string" &&
        /^#[0-9a-f]{6}$/i.test(candidate.textColor)
          ? candidate.textColor
          : textBlocks.at(-1)?.color ?? "#171410",
      textBlocks,
      photos,
      links,
      recordings,
      revision:
        typeof candidate.revision === "number" ? candidate.revision : 0,
      createdAt:
        typeof candidate.createdAt === "string"
          ? candidate.createdAt
          : timestamp,
      updatedAt:
        typeof candidate.updatedAt === "string"
          ? candidate.updatedAt
          : timestamp,
    }];
  }).slice(0, 10);
  const migratedPages =
    pages.length > 0 ? pages : [defaultStoryPage(timestamp)];
  const latestTextColor = migratedPages
    .flatMap((page) => page.textBlocks)
    .at(-1)?.color;
  return {
    defaultTextColor:
      typeof value.defaultTextColor === "string" &&
      /^#[0-9a-f]{6}$/i.test(value.defaultTextColor)
        ? value.defaultTextColor
        : latestTextColor ?? "#171410",
    pages: migratedPages,
  };
}

export function migrateJournalSnapshot(value: unknown): JournalSnapshot {
  if (!isRecord(value) || !hasSnapshotCollections(value)) {
    throw new JournalMigrationError("Journal data is incomplete or unreadable.");
  }

  if (value.schemaVersion === DOCUMENT_SCHEMA_VERSION) {
    if (
      typeof value.id !== "string" ||
      typeof value.revision !== "number" ||
      typeof value.updatedAt !== "string" ||
      !Array.isArray(value.favourites) ||
      !Array.isArray(value.appliedOperationIds) ||
      !isRecord(value.settings)
    ) {
      throw new JournalMigrationError(
        "Journal data does not match the current schema.",
      );
    }
    return {
      ...(value as unknown as JournalSnapshot),
      pages: migratePageFrames(value.pages),
      myStory: migrateMyStory(value.myStory, value.updatedAt),
      settings: migrateSettings(value.settings),
    };
  }

  if (value.schemaVersion === 0) {
    if (
      typeof value.id !== "string" ||
      typeof value.revision !== "number" ||
      typeof value.updatedAt !== "string"
    ) {
      throw new JournalMigrationError("Legacy journal data is incomplete.");
    }

    return {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      id: value.id,
      days: value.days,
      pages: migratePageFrames(value.pages),
      sketchbooks: value.sketchbooks,
      favourites: Array.isArray(value.favourites) ? value.favourites : [],
      myStory: migrateMyStory(value.myStory, value.updatedAt),
      settings: migrateSettings(value.settings),
      appliedOperationIds: Array.isArray(value.appliedOperationIds)
        ? value.appliedOperationIds.filter(
            (operationId): operationId is string =>
              typeof operationId === "string",
          )
        : [],
      revision: value.revision,
      updatedAt: value.updatedAt,
    };
  }

  throw new JournalMigrationError(
    `Journal schema version ${String(value.schemaVersion)} is unsupported.`,
  );
}
