import { describe, expect, it } from "vitest";

import { createInitialJournalSnapshot } from "../domain/initialState";
import {
  backupContentToken,
  backupResultStatus,
} from "./backupSyncHelpers";

describe("backupContentToken", () => {
  it("ignores the last settings tab while tracking backup content", () => {
    const snapshot = createInitialJournalSnapshot(
      new Date("2026-08-14T09:00:00.000Z"),
    );
    const changedTab = {
      ...snapshot,
      settings: {
        ...snapshot.settings,
        lastSettingsTab:
          snapshot.settings.lastSettingsTab === "backup"
            ? ("appearance" as const)
            : ("backup" as const),
      },
    };
    const changedContent = {
      ...snapshot,
      settings: {
        ...snapshot.settings,
        displayName: `${snapshot.settings.displayName} updated`,
      },
    };
    const changedStory = {
      ...snapshot,
      myStory: {
        ...snapshot.myStory!,
        pages: snapshot.myStory!.pages.map((page, index) =>
          index === 0
            ? { ...page, textSide: "right" as const }
            : page,
        ),
      },
    };

    expect(backupContentToken(changedTab)).toBe(backupContentToken(snapshot));
    expect(backupContentToken(changedContent)).not.toBe(
      backupContentToken(snapshot),
    );
    expect(backupContentToken(changedStory)).not.toBe(
      backupContentToken(snapshot),
    );
  });
});

describe("backupResultStatus", () => {
  it("preserves cloud details and reports waiting items", () => {
    expect(
      backupResultStatus({
        state: "waiting",
        message: "Some files are waiting.",
        failedItemCount: 2,
        backedUpRevision: 17,
        accountDescription: "Ivan",
        failedItems: [
          {
            id: "drawing-page-1",
            kind: "drawing",
            reason: "Upload interrupted",
          },
        ],
      }),
    ).toEqual({
      state: "waiting",
      pendingItemCount: 2,
      message: "Some files are waiting.",
      backedUpRevision: 17,
      accountDescription: "Ivan",
      failedItems: [
        {
          id: "drawing-page-1",
          kind: "drawing",
          reason: "Upload interrupted",
        },
      ],
    });
  });
});
