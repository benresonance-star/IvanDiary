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
  const updateOptionalAsset = (asset: AssetRef): AssetRef | undefined => {
    const restoredUri = restoredAssetUris[asset.id];
    if (restoredUri) return { ...asset, localUri: restoredUri };
    return asset.localUri.startsWith("demo://") ? asset : undefined;
  };

  const reconciled: JournalSnapshot = {
    ...snapshot,
    days: snapshot.days.map((day) => ({
      ...day,
      ...(day.thumbnailAsset
        ? (() => {
            const thumbnailAsset = updateOptionalAsset(day.thumbnailAsset);
            return thumbnailAsset ? { thumbnailAsset } : {};
          })()
        : {}),
    })),
    pages: snapshot.pages.map((page) => ({
      ...page,
      objects: page.objects.map((object) =>
        object.type === "voice" || object.type === "photo"
          ? { ...object, asset: updateAsset(object.asset) }
          : object.type === "link" && object.previewAsset
            ? (() => {
                const previewAsset = updateOptionalAsset(object.previewAsset);
                const link = { ...object };
                delete link.previewAsset;
                return previewAsset ? { ...link, previewAsset } : link;
              })()
            : object,
      ),
    })),
    stories: snapshot.stories.map((story) => ({
          ...story,
          pages: story.pages.map((page) => ({
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
        })),
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
