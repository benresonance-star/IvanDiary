import {
  DEFAULT_GRID_COLOR,
  DOCUMENT_SCHEMA_VERSION,
  GRID_ROTATION_MAX,
  type DrawingGridSettings,
  type JournalSnapshot,
  type JournalSettings,
  type MyWord,
  type PageObject,
  type Size,
} from "./models";

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
  favouritePenColours: [
    "#171410", "#245b8a", "#426b3a", "#9b352f", "#6b4f82",
    "#76512f", "#c86f24", "#2f6f6d", "#a64b6b", "#686868",
  ],
  favouriteColourLongPressEnabled: true,
  favouriteColourLongPressSeconds: 2,
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
  recordingLimitMinutes: 5,
  automaticBackup: true,
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
  const favouritePenColours = Array.isArray(value.favouritePenColours) &&
    value.favouritePenColours.length === 10
    ? value.favouritePenColours.map((colour, index) =>
        typeof colour === "string" && /^#[0-9a-f]{6}$/i.test(colour)
          ? colour
          : DEFAULT_SETTINGS.favouritePenColours[index]!,
      )
    : [...DEFAULT_SETTINGS.favouritePenColours];
  const favouriteColourLongPressSeconds =
    typeof value.favouriteColourLongPressSeconds === "number" &&
    Number.isFinite(value.favouriteColourLongPressSeconds)
      ? Math.min(5, Math.max(0.5, value.favouriteColourLongPressSeconds))
      : DEFAULT_SETTINGS.favouriteColourLongPressSeconds;
  const favouriteColourLongPressEnabled =
    value.favouriteColourLongPressEnabled !== false;
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
    favouritePenColours,
    favouriteColourLongPressEnabled,
    favouriteColourLongPressSeconds,
    penNib,
    penNibProfiles,
    welcomeGreeting,
    welcomeTagline,
    welcomeMessage,
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
