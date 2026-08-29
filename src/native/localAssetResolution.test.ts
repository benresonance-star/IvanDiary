import { describe, expect, it, vi } from "vitest";

import { createInitialJournalSnapshot } from "../domain/initialState";
import type { JournalFilesPlugin } from "./contracts";
import { repairLocalAssetUris } from "./localAssetResolution";

function files(
  resolveStoredAssets: JournalFilesPlugin["resolveStoredAssets"],
): JournalFilesPlugin {
  return {
    finaliseTemporaryAsset: vi.fn(),
    removeToTrash: vi.fn(),
    resolveStoredAssets,
    storageHealth: vi.fn(),
  };
}

describe("repairLocalAssetUris", () => {
  it("repairs stale journal photo and audio paths without changing asset identity", async () => {
    const current = createInitialJournalSnapshot(new Date("2026-08-29T09:00:00Z"));
    const page = current.pages[0]!;
    const voice = page.objects.find((object) => object.type === "voice")!;
    const photo = {
      id: "photo-object",
      pageId: page.id,
      type: "photo" as const,
      position: { x: 0.1, y: 0.1 },
      frame: { width: 0.3, height: 0.3 },
      asset: {
        id: "photo-asset",
        localUri: "file:///old-container/photo.jpg",
        mimeType: "image/jpeg",
        byteLength: 42,
        checksum: "photo-checksum",
      },
      size: { width: 800, height: 600 },
      revision: 0,
      createdAt: "2026-08-29T09:00:00Z",
    };
    const snapshot = {
      ...current,
      pages: [{
        ...page,
        objects: [
          ...page.objects.map((object) =>
            object.id === voice.id
              ? {
                  ...voice,
                  asset: { ...voice.asset, localUri: "file:///old-container/audio.m4a" },
                }
              : object,
          ),
          photo,
        ],
      }, ...current.pages.slice(1)],
    };
    const resolveStoredAssets = vi.fn().mockResolvedValue({
      resolvedAssetUris: {
        [voice.asset.id]: "file:///current-container/audio.m4a",
        [photo.asset.id]: "file:///current-container/photo.jpg",
      },
      unresolvedAssetIds: [],
    });

    const repaired = await repairLocalAssetUris(snapshot, files(resolveStoredAssets));

    expect(repaired.changed).toBe(true);
    expect(repaired.snapshot.pages[0]?.objects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: photo.id,
        asset: expect.objectContaining({
          id: photo.asset.id,
          checksum: photo.asset.checksum,
          localUri: "file:///current-container/photo.jpg",
        }),
      }),
      expect.objectContaining({
        id: voice.id,
        asset: expect.objectContaining({
          id: voice.asset.id,
          localUri: "file:///current-container/audio.m4a",
        }),
      }),
    ]));
  });

  it("preserves unresolved references and returns the original snapshot", async () => {
    const current = createInitialJournalSnapshot(new Date("2026-08-29T09:00:00Z"));
    const voice = current.pages[0]!.objects.find((object) => object.type === "voice")!;
    const snapshot = {
      ...current,
      pages: [{
        ...current.pages[0]!,
        objects: current.pages[0]!.objects.map((object) =>
          object.id === voice.id
            ? {
                ...voice,
                asset: { ...voice.asset, localUri: "file:///missing/audio.m4a" },
              }
            : object,
        ),
      }, ...current.pages.slice(1)],
    };
    const repaired = await repairLocalAssetUris(snapshot, files(vi.fn().mockResolvedValue({
      resolvedAssetUris: {},
      unresolvedAssetIds: [voice.asset.id],
    })));

    expect(repaired.snapshot).toBe(snapshot);
    expect(repaired.changed).toBe(false);
    expect(repaired.unresolvedAssetIds).toEqual([voice.asset.id]);
  });
});
