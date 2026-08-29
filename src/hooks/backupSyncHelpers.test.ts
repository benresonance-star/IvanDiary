import { describe, expect, it, vi } from "vitest";

import { createInitialJournalSnapshot } from "../domain/initialState";
import {
  backupContentToken,
  backupContentFingerprint,
  backupResultStatus,
  confirmCloudDataDeletion,
  historyAfterCreation,
} from "./backupSyncHelpers";

describe("confirmCloudDataDeletion", () => {
  it("requires both warnings to be accepted", () => {
    const confirmAction = vi.fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);

    expect(confirmCloudDataDeletion(confirmAction)).toBe(true);
    expect(confirmAction).toHaveBeenCalledTimes(2);
    expect(confirmAction.mock.calls[0]?.[0]).toMatch(/every recovery point/i);
    expect(confirmAction.mock.calls[1]?.[0]).toMatch(/cannot be recovered/i);
  });

  it("stops immediately when the first warning is declined", () => {
    const confirmAction = vi.fn(() => false);

    expect(confirmCloudDataDeletion(confirmAction)).toBe(false);
    expect(confirmAction).toHaveBeenCalledOnce();
  });

  it("does not proceed when the final warning is declined", () => {
    const confirmAction = vi.fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    expect(confirmCloudDataDeletion(confirmAction)).toBe(false);
    expect(confirmAction).toHaveBeenCalledTimes(2);
  });
});

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
      stories: snapshot.stories.map((story) => ({
        ...story,
        pages: story.pages.map((page, index) =>
          index === 0
            ? { ...page, textSide: "right" as const }
            : page,
        ),
      })),
    };

    expect(backupContentToken(changedTab)).toBe(backupContentToken(snapshot));
    expect(backupContentToken(changedContent)).not.toBe(
      backupContentToken(snapshot),
    );
    expect(backupContentToken(changedStory)).not.toBe(
      backupContentToken(snapshot),
    );
  });

  it("uses the same fingerprint when only device-local asset paths differ", () => {
    const snapshot = createInitialJournalSnapshot(
      new Date("2026-08-14T09:00:00.000Z"),
    );
    const withFirstPath = JSON.parse(JSON.stringify(snapshot));
    const withSecondPath = JSON.parse(JSON.stringify(snapshot));
    withFirstPath.settings.myWords = [{
      id: "word-1",
      text: "Ivan",
      enabled: true,
      correctionCount: 0,
      sample: { id: "audio-1", localUri: "file:///first/audio.m4a", mimeType: "audio/mp4" },
    }];
    withSecondPath.settings.myWords = [{
      ...withFirstPath.settings.myWords[0],
      sample: { ...withFirstPath.settings.myWords[0].sample, localUri: "file:///second/audio.m4a" },
    }];

    expect(backupContentFingerprint(withFirstPath)).toBe(
      backupContentFingerprint(withSecondPath),
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

describe("historyAfterCreation", () => {
  const entry = (id: string, entryDay: string) => ({
    id,
    entryDay,
    capturedAt: `${entryDay}T10:00:00.000Z`,
    reason: "manual" as const,
    deviceName: "iPad",
    revision: 1,
    assetCount: 0,
    byteLength: 0,
    protected: false,
  });

  it("replaces the visible recovery point for the same day", () => {
    expect(
      historyAfterCreation(
        [entry("old-today", "2026-08-18"), entry("yesterday", "2026-08-17")],
        entry("new-today", "2026-08-18"),
      ).map((candidate) => candidate.id),
    ).toEqual(["new-today", "yesterday"]);
  });

  it("temporarily preserves a same-day restore target for a safety point", () => {
    expect(
      historyAfterCreation(
        [entry("restore-target", "2026-08-18")],
        { ...entry("safety", "2026-08-18"), reason: "before-restore" },
        true,
      ).map((candidate) => candidate.id),
    ).toEqual(["safety", "restore-target"]);
  });
});
