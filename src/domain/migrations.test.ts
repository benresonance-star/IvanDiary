import { describe, expect, it } from "vitest";

import { createInitialJournalSnapshot } from "./initialState";
import {
  JournalMigrationError,
  migrateJournalSnapshot,
} from "./migrations";

describe("journal migrations", () => {
  it("normalizes structured text fields and stack references idempotently", () => {
    const current = createInitialJournalSnapshot(
      new Date("2026-08-03T09:00:00.000Z"),
    );
    const text = {
      id: "structured-text",
      type: "text",
      pageId: current.pages[0]!.id,
      position: { x: 0.2, y: 0.2 },
      frame: { width: 0.3, height: 0.2 },
      text: "Heading",
      textScale: 1,
      role: "heading",
      font: "system-serif",
      color: "#123456",
      backgroundColor: "#fefefe",
      outlineColor: "#654321",
      outlineWidth: 4,
      revision: 0,
      createdAt: current.updatedAt,
    } as const;
    const invalidText = {
      ...text,
      id: "legacy-text",
      role: "banner",
      font: "comic",
      color: "red",
      backgroundColor: "paper",
      outlineColor: "ink",
      outlineWidth: 99,
    };
    const migrated = migrateJournalSnapshot({
      ...current,
      pages: [{
        ...current.pages[0]!,
        objects: [text, invalidText],
        textStack: {
          position: { x: -2, y: 4 },
          frame: { width: 3, height: -1 },
          memberIds: [
            "structured-text",
            "structured-text",
            "missing",
            "legacy-text",
          ],
        },
      }],
    });

    expect(migrated.pages[0]?.textStack).toEqual({
      position: { x: 0, y: 1 },
      frame: { width: 1, height: 0.01 },
      memberIds: ["structured-text", "legacy-text"],
    });
    expect(migrated.pages[0]?.objects[0]).toEqual(
      expect.objectContaining({
        role: "heading",
        font: "system-serif",
        color: "#123456",
        backgroundColor: "#fefefe",
        outlineColor: "#654321",
        outlineWidth: 4,
      }),
    );
    expect(migrated.pages[0]?.objects[1]).not.toHaveProperty("role");
    expect(migrated.pages[0]?.objects[1]).not.toHaveProperty("font");
    expect(migrated.pages[0]?.objects[1]).not.toHaveProperty("color");
    expect(migrated.pages[0]?.objects[1]).not.toHaveProperty("backgroundColor");
    expect(migrated.pages[0]?.objects[1]).not.toHaveProperty("outlineColor");
    expect(migrated.pages[0]?.objects[1]).not.toHaveProperty("outlineWidth");
    expect(migrateJournalSnapshot(migrated)).toEqual(migrated);
  });

  it("preserves valid page backgrounds and removes invalid values", () => {
    const current = createInitialJournalSnapshot(new Date("2026-08-03T09:00:00.000Z"));
    const valid = migrateJournalSnapshot({
      ...current,
      pages: [{ ...current.pages[0]!, backgroundColor: "#AABBCC" }],
    });
    expect(valid.pages[0]?.backgroundColor).toBe("#aabbcc");

    const invalid = migrateJournalSnapshot({
      ...current,
      pages: [{ ...current.pages[0]!, backgroundColor: "transparent" }],
    });
    expect(invalid.pages[0]).not.toHaveProperty("backgroundColor");
  });

  it("preserves freeform shapes and their reduced anchors", () => {
    const current = createInitialJournalSnapshot(new Date("2026-08-03T09:00:00.000Z"));
    const freeform = {
      id: "freeform-1", type: "shape", shapeKind: "freeform", pageId: current.pages[0]!.id,
      position: { x: .2, y: .2 }, frame: { width: .3, height: .25 },
      points: [{ x: 0, y: .4 }, { x: .4, y: 0 }, { x: 1, y: .5 }, { x: .5, y: 1 }],
      fillColor: "#abcdef", outlineWidth: 3, layer: "above-sketch", revision: 0,
      createdAt: "2026-08-03T09:00:00.000Z",
    } as const;
    const migrated = migrateJournalSnapshot({
      ...current,
      stories: undefined,
      pages: [{ ...current.pages[0]!, objects: [freeform] }],
      myStory: { pages: [{ id: "story-page", drawingDocumentId: "story-drawing", shapes: [{ ...freeform, id: "story-freeform", pageId: "story-page" }] }] },
    });
    expect(migrated.pages[0]!.objects[0]).toEqual(expect.objectContaining({ shapeKind: "freeform", points: freeform.points }));
    expect(migrated.stories[0]?.pages[0]?.shapes).toEqual([expect.objectContaining({ id: "story-freeform", shapeKind: "freeform", points: freeform.points })]);
  });

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

  it.each(["history", "privacy"])("moves the retired %s tab to Backup", (lastSettingsTab) => {
    const current = createInitialJournalSnapshot();
    const migrated = migrateJournalSnapshot({
      ...current,
      settings: { ...current.settings, lastSettingsTab },
    });

    expect(migrated.settings.lastSettingsTab).toBe("backup");
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

  it("defaults two-finger undo on and preserves an explicit off setting", () => {
    const current = createInitialJournalSnapshot();
    const { twoFingerUndoEnabled: removed, ...legacySettings } = current.settings;
    const migratedLegacy = migrateJournalSnapshot({
      ...current,
      settings: legacySettings,
    });
    const migratedOff = migrateJournalSnapshot({
      ...current,
      settings: { ...current.settings, twoFingerUndoEnabled: false },
    });

    expect(removed).toBe(true);
    expect(migratedLegacy.settings.twoFingerUndoEnabled).toBe(true);
    expect(migratedOff.settings.twoFingerUndoEnabled).toBe(false);
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
    const withoutStory = { ...current, stories: undefined, myStory: undefined };
    const migratedDefault = migrateJournalSnapshot(withoutStory);

    expect(migratedDefault.stories[0]?.pages).toHaveLength(1);
    expect(migratedDefault.stories[0]?.pages[0]).toEqual(
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
      stories: undefined,
      myStory: {
        pages: [{
          ...current.stories[0]!.pages[0]!,
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
          shapes: [{
            id: "story-shape", type: "shape", shapeKind: "triangle",
            position: { x: 0.2, y: 0.3 }, frame: { width: 0.3, height: 0.25 },
            fillColor: "#abcdef", outlineColor: "#123456", outlineWidth: 4,
            layer: "above-sketch", revision: 1,
            rotationDegrees: 405,
          }],
          renderOrder: [
            { kind: "shape", id: "story-shape" },
            { kind: "shape", id: "story-shape" },
            { kind: "photo", id: "missing" },
          ],
        }],
      },
    });
    expect(migratedInvalid.stories[0]?.pages[0]).toEqual(
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
        shapes: [expect.objectContaining({ id: "story-shape", shapeKind: "triangle", fillColor: "#abcdef", rotationDegrees: 45 })],
        renderOrder: [
          { kind: "shape", id: "story-shape" },
          { kind: "text", id: "story-text" },
          { kind: "link", id: "story-link" },
        ],
      }),
    );
  });

  it("preserves multiple stories and migrates a legacy single story", () => {
    const current = createInitialJournalSnapshot(new Date("2026-08-03T09:00:00.000Z"));
    const multiple = migrateJournalSnapshot({ ...current, stories: [current.stories[0], { ...current.stories[0], id: "story-two", name: "Travels" }] });
    expect(multiple.stories.map((story) => story.name)).toEqual(["My Story", "Travels"]);
    const legacy = migrateJournalSnapshot({ ...current, stories: undefined, myStory: { defaultTextColor: "#171410", pages: current.stories[0]!.pages } });
    expect(legacy.stories).toHaveLength(1);
    expect(legacy.stories[0]).toEqual(expect.objectContaining({ id: "story-my-story", name: "My Story" }));
  });

});
