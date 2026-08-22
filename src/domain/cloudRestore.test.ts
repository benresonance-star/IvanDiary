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

  it("restores photographs used by My Story pages", () => {
    const current = createInitialJournalSnapshot(
      new Date("2026-08-03T09:00:00.000Z"),
    );
    const storyAsset = {
      id: "story-photo-asset",
      localUri: "file:///old-device/story.jpg",
      mimeType: "image/jpeg",
      byteLength: 42,
      checksum: "story-checksum",
    };
    const storyAudio = {
      id: "story-audio-asset",
      localUri: "file:///old-device/story.m4a",
      mimeType: "audio/mp4",
      byteLength: 84,
      checksum: "story-audio-checksum",
    };
    const snapshot = {
      ...current,
      stories: current.stories.map((story) => ({
        ...story,
        pages: story.pages.map((page) => ({
          ...page,
          textSide: "right" as const,
          photos: [{
            id: "story-photo",
            asset: storyAsset,
            size: { width: 800, height: 600 },
            width: 1 as const,
            revision: 0,
            createdAt: current.updatedAt,
          }],
          recordings: [{
            id: "story-recording",
            asset: storyAudio,
            durationMs: 2_000,
            transcriptionStatus: "not-requested" as const,
            revision: 0,
            createdAt: current.updatedAt,
          }],
        })),
      })),
    };

    const restored = reconcileCloudRestore(snapshot, {
      [storyAsset.id]: "file:///new-device/story.jpg",
      [storyAudio.id]: "file:///new-device/story.m4a",
    });

    expect(restored.stories[0]?.pages[0]?.photos[0]?.asset.localUri).toBe(
      "file:///new-device/story.jpg",
    );
    expect(restored.stories[0]?.pages[0]?.recordings[0]?.asset.localUri).toBe(
      "file:///new-device/story.m4a",
    );
    expect(restored.stories[0]?.pages[0]?.textSide).toBe("right");
  });
});
