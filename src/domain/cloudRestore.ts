import type { AssetRef, JournalSnapshot } from "./models";
import { migrateJournalSnapshot } from "./migrations";

export function reconcileCloudRestore(
  snapshotValue: unknown,
  restoredAssetUris: Record<string, string>,
): JournalSnapshot {
  const snapshot = migrateJournalSnapshot(snapshotValue);
  const missingAssetIds = new Set<string>();
  const updateAsset = (asset: AssetRef): AssetRef => {
    const restoredUri = restoredAssetUris[asset.id];
    if (restoredUri) {
      return { ...asset, localUri: restoredUri };
    }
    if (!asset.localUri.startsWith("demo://")) {
      missingAssetIds.add(asset.id);
    }
    return asset;
  };

  const reconciled: JournalSnapshot = {
    ...snapshot,
    pages: snapshot.pages.map((page) => ({
      ...page,
      objects: page.objects.map((object) =>
        object.type === "voice" || object.type === "photo"
          ? { ...object, asset: updateAsset(object.asset) }
          : object,
      ),
    })),
    myStory: snapshot.myStory
      ? {
          ...snapshot.myStory,
          pages: snapshot.myStory.pages.map((page) => ({
            ...page,
            photos: page.photos.map((photo) => ({
              ...photo,
              asset: updateAsset(photo.asset),
            })),
            recordings: page.recordings.map((recording) => ({
              ...recording,
              asset: updateAsset(recording.asset),
            })),
          })),
        }
      : undefined,
    settings: {
      ...snapshot.settings,
      myWords: snapshot.settings.myWords.map((word) =>
        word.sample ? { ...word, sample: updateAsset(word.sample) } : word,
      ),
    },
  };

  if (missingAssetIds.size > 0) {
    throw new Error(
      `Cloud restore is missing required assets: ${[
        ...missingAssetIds,
      ].join(", ")}`,
    );
  }
  return reconciled;
}
