import {
  DOCUMENT_SCHEMA_VERSION,
  type JournalSnapshot,
  type JournalSettings,
  type PageObject,
  type Size,
} from "./models";

const DEFAULT_SETTINGS: JournalSettings = {
  simpleMode: true,
  textScale: "standard",
  contrast: "warm",
  reducedMotion: false,
  penColor: "#171410",
  penWidth: 4.2,
  penOpacity: 1,
  welcomeGreeting: "Welcome back Ivan!",
  welcomeTagline: "It's a Wonderful World!",
  welcomeMessage: "",
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

  const simpleMode =
    typeof value.simpleMode === "boolean"
      ? value.simpleMode
      : DEFAULT_SETTINGS.simpleMode;
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

  return {
    simpleMode,
    textScale,
    contrast,
    reducedMotion,
    penColor,
    penWidth,
    penOpacity,
    welcomeGreeting,
    welcomeTagline,
    welcomeMessage,
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
  return pages.map((page) => ({
    ...page,
    objects: page.objects.map((object) => {
      const frame = object.frame ?? defaultFrame(object);
      return frame ? { ...object, frame } : object;
    }),
  }));
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
