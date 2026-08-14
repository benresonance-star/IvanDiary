import { describe, expect, it } from "vitest";

import { reconcileCloudRestore } from "./cloudRestore";
import { createInitialJournalSnapshot } from "./initialState";

describe("reconcileCloudRestore", () => {
  it("migrates the snapshot and replaces restored asset locations", () => {
    const current = createInitialJournalSnapshot(
      new Date("2026-08-03T09:00:00.000Z"),
    );
    const page = current.pages[0]!;
    const voice = page.objects.find((object) => object.type === "voice")!;
    const legacy = {
      ...current,
      schemaVersion: 0,
      pages: [
        {
          ...page,
          objects: page.objects.map((object) =>
            object.id === voice.id
              ? {
                  ...object,
                  asset: {
                    ...voice.asset,
                    localUri: "file:///old-device/voice.m4a",
                  },
                }
              : object,
          ),
        },
        ...current.pages.slice(1),
      ],
    };

    const restored = reconcileCloudRestore(legacy, {
      [voice.asset.id]: "file:///new-device/voice.m4a",
    });

    expect(restored.schemaVersion).toBe(1);
    expect(
      restored.pages[0]?.objects.find((object) => object.id === voice.id),
    ).toEqual(
      expect.objectContaining({
        asset: expect.objectContaining({
          localUri: "file:///new-device/voice.m4a",
        }),
      }),
    );
  });

  it("rejects an incomplete restore before local state is replaced", () => {
    const current = createInitialJournalSnapshot(
      new Date("2026-08-03T09:00:00.000Z"),
    );
    const page = current.pages[0]!;
    const voice = page.objects.find((object) => object.type === "voice")!;
    const snapshot = {
      ...current,
      pages: [
        {
          ...page,
          objects: page.objects.map((object) =>
            object.id === voice.id
              ? {
                  ...object,
                  asset: {
                    ...voice.asset,
                    localUri: "file:///old-device/voice.m4a",
                  },
                }
              : object,
          ),
        },
        ...current.pages.slice(1),
      ],
    };

    expect(() => reconcileCloudRestore(snapshot, {})).toThrow(
      `Cloud restore is missing required assets: ${voice.asset.id}`,
    );
  });
});
