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
      simpleMode: true,
      textScale: "standard",
      contrast: "warm",
      reducedMotion: false,
      penColor: "#171410",
      penWidth: 4.2,
      welcomeGreeting: "Welcome back Ivan!",
      welcomeTagline: "It's a Wonderful World!",
      welcomeMessage: "",
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

});
