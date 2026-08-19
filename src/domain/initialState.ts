import { localDateKey } from "../utils/date";
import {
  DOCUMENT_SCHEMA_VERSION,
  type JournalSnapshot,
  type MyStoryPage,
  type PageObject,
} from "./models";

export function createInitialJournalSnapshot(
  now = new Date(),
  includeDemonstrationContent = true,
): JournalSnapshot {
  const timestamp = now.toISOString();
  const date = localDateKey(now);
  const dayId = `day-${date}`;
  const pageId = `page-${date}-1`;
  const storyPage: MyStoryPage = {
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
  const objects: PageObject[] = includeDemonstrationContent
    ? [
        {
          id: "welcome-voice",
          type: "voice",
          pageId,
          position: { x: 0.38, y: 0.23 },
          frame: { width: 0.28, height: 0.23 },
          createdAt: timestamp,
          revision: 0,
          asset: {
            id: "welcome-voice-asset",
            localUri: "demo://welcome-voice",
            mimeType: "audio/mp4",
            byteLength: 0,
            checksum: "browser-demonstration",
          },
          durationMs: 58_000,
          transcriptionStatus: "complete",
        },
      ]
    : [];

  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: "ivan-journal",
    days: [
      {
        id: dayId,
        date,
        pageIds: [pageId],
        favourite: false,
        revision: 0,
      },
    ],
    pages: [
      {
        schemaVersion: DOCUMENT_SCHEMA_VERSION,
        id: pageId,
        journalDayId: dayId,
        paperStyle: "warm-journal",
        drawingDocumentId: `drawing-${pageId}`,
        objects,
        revision: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    sketchbooks: [
      {
        id: "sketchbook-favourite-places",
        name: "Favourite Places",
        pageIds: [],
        favourite: false,
        revision: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    favourites: [],
    myStory: { defaultTextColor: "#171410", pages: [storyPage] },
    settings: {
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
      twoFingerUndoEnabled: true,
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
    },
    appliedOperationIds: [],
    revision: 0,
    updatedAt: timestamp,
  };
}
