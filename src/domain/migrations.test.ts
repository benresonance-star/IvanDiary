import { describe, expect, it } from "vitest";

import { createInitialJournalSnapshot } from "./initialState";
import {
  JournalMigrationError,
  migrateJournalSnapshot,
} from "./migrations";

describe("journal migrations", () => {
  it("adds safe accessibility defaults to version zero data", () => {
    const current = createInitialJournalSnapshot(
      new Date("2026-08-03T09:00:00.000Z"),
    );
    const legacy = {
      ...current,
      schemaVersion: 0,
      pages: current.pages.map((page) => ({
        ...page,
        objects: page.objects.map(({ frame, ...object }) => {
          void frame;
          return object;
        }),
      })),
      settings: undefined,
      favourites: undefined,
      appliedOperationIds: undefined,
    };

    const migrated = migrateJournalSnapshot(legacy);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.settings).toEqual({
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
      automaticBackup: true,
      backupOnWifiOnly: true,
      myWords: [],
    });
    expect(migrated.favourites).toEqual([]);
    expect(
      migrated.pages[0]?.objects.find((object) => object.type === "voice")
        ?.frame,
    ).toEqual({ width: 0.28, height: 0.23 });
  });

  it("refuses unsupported future data rather than guessing", () => {
    const current = createInitialJournalSnapshot();
    expect(() =>
      migrateJournalSnapshot({ ...current, schemaVersion: 99 }),
    ).toThrow(JournalMigrationError);
  });

  it("moves the retired text-size tab to Appearance", () => {
    const current = createInitialJournalSnapshot();
    const migrated = migrateJournalSnapshot({
      ...current,
      settings: { ...current.settings, lastSettingsTab: "text" },
    });

    expect(migrated.settings.lastSettingsTab).toBe("appearance");
  });

  it("preserves the standard text editor preference", () => {
    const current = createInitialJournalSnapshot();
    const migrated = migrateJournalSnapshot({
      ...current,
      settings: {
        ...current.settings,
        textEditorPreference: "standard",
      },
    });

    expect(migrated.settings.textEditorPreference).toBe("standard");
  });

  it("preserves valid per-nib pen profile values", () => {
    const current = createInitialJournalSnapshot();
    const penNibProfiles = {
      pen: { color: "#112233", width: 2.5, opacity: 0.9 },
      marker: { color: "#445566", width: 8, opacity: 0.6 },
      pencil: { color: "#778899", width: 1.25, opacity: 0.4 },
      brush: { color: "#aabbcc", width: 16, opacity: 0.75 },
    };

    const migrated = migrateJournalSnapshot({
      ...current,
      settings: { ...current.settings, penNibProfiles },
    });

    expect(migrated.settings.penNibProfiles).toEqual(penNibProfiles);
  });

  it("adds safe visual defaults to legacy page grids", () => {
    const current = createInitialJournalSnapshot();
    const page = current.pages[0]!;
    const migrated = migrateJournalSnapshot({
      ...current,
      pages: [
        {
          ...page,
          drawingGrid: {
            enabled: true,
            spacing: 96,
            rotationDegrees: 45,
          },
        },
      ],
    });

    expect(migrated.pages[0]?.drawingGrid).toEqual({
      enabled: true,
      snapToGrid: true,
      spacing: 96,
      rotationDegrees: 45,
      type: "lines",
      color: "#435b70",
    });
  });

  it("validates per-nib pen profiles with safe legacy fallbacks", () => {
    const current = createInitialJournalSnapshot();
    const migrated = migrateJournalSnapshot({
      ...current,
      settings: {
        ...current.settings,
        penColor: "#123456",
        penWidth: 6,
        penOpacity: 0.6,
        penNibProfiles: {
          pen: { color: "invalid", width: Number.NaN, opacity: Infinity },
          marker: "invalid",
          pencil: { color: "#abcdef", width: 99, opacity: -1 },
          brush: { color: "#fedcba", width: 0, opacity: "invalid" },
        },
      },
    });

    expect(migrated.settings.penNibProfiles).toEqual({
      pen: { color: "#123456", width: 6, opacity: 0.6 },
      marker: { color: "#123456", width: 6, opacity: 0.6 },
      pencil: { color: "#abcdef", width: 28, opacity: 0 },
      brush: { color: "#fedcba", width: 1, opacity: 0.6 },
    });
  });

  it("adds a safe My Story page and sanitizes story presentation", () => {
    const current = createInitialJournalSnapshot(
      new Date("2026-08-03T09:00:00.000Z"),
    );
    const withoutStory = { ...current, myStory: undefined };
    const migratedDefault = migrateJournalSnapshot(withoutStory);

    expect(migratedDefault.myStory?.pages).toHaveLength(1);
    expect(migratedDefault.myStory?.pages[0]).toEqual(
      expect.objectContaining({
        splitRatio: 0.5,
        textSide: "left",
        textBackgroundColor: "#fffaf0",
        textColor: "#171410",
        links: [],
        recordings: [],
      }),
    );

    const migratedInvalid = migrateJournalSnapshot({
      ...current,
      myStory: {
        pages: [{
          ...current.myStory!.pages[0]!,
          splitRatio: 0.99,
          textSide: "invalid",
          textBackgroundColor: "invalid",
          textBlocks: [{
            id: "story-text",
            text: "A beginning",
            role: "unknown",
            color: "invalid",
          }],
          links: [
            {
              id: "story-link",
              url: "https://example.com/memory",
              title: "Family archive",
            },
            {
              id: "unsafe-link",
              url: "javascript:alert(1)",
              title: "Unsafe",
            },
          ],
        }],
      },
    });
    expect(migratedInvalid.myStory?.pages[0]).toEqual(
      expect.objectContaining({
        splitRatio: 0.7,
        textSide: "left",
        textBackgroundColor: "#fffaf0",
        textColor: "#171410",
        links: [
          expect.objectContaining({
            id: "story-link",
            url: "https://example.com/memory",
          }),
        ],
        textBlocks: [
          expect.objectContaining({
            role: "body",
            color: "#171410",
          }),
        ],
        recordings: [],
      }),
    );
  });

});
