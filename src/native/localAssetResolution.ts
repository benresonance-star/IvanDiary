import type { AssetRef, JournalSnapshot } from "../domain/models";
import type { JournalFilesPlugin } from "./contracts";

type LocalAssetKind = "audio" | "photo";

function requiredAssets(snapshot: JournalSnapshot) {
  const assets = new Map<string, { asset: AssetRef; kind: LocalAssetKind }>();
  const add = (asset: AssetRef, kind: LocalAssetKind) => {
    if (!asset.localUri.startsWith("demo://")) {
      assets.set(asset.id, { asset, kind });
    }
  };

  for (const page of snapshot.pages) {
    for (const object of page.objects) {
      if (object.type === "photo") add(object.asset, "photo");
      if (object.type === "voice") add(object.asset, "audio");
    }
  }
  for (const word of snapshot.settings.myWords) {
    if (word.sample) add(word.sample, "audio");
  }
  for (const page of snapshot.stories.flatMap((story) => story.pages)) {
    for (const photo of page.photos) add(photo.asset, "photo");
    for (const recording of page.recordings) add(recording.asset, "audio");
  }
  return [...assets.values()];
}

export async function repairLocalAssetUris(
  snapshot: JournalSnapshot,
  files: JournalFilesPlugin,
): Promise<{ snapshot: JournalSnapshot; changed: boolean; unresolvedAssetIds: string[] }> {
  const assets = requiredAssets(snapshot);
  if (assets.length === 0) {
    return { snapshot, changed: false, unresolvedAssetIds: [] };
  }
  const resolution = await files.resolveStoredAssets({
    assets: assets.map(({ asset, kind }) => ({
      id: asset.id,
      kind,
      localUri: asset.localUri,
      mimeType: asset.mimeType,
    })),
  });
  let changed = false;
  const update = (asset: AssetRef): AssetRef => {
    const localUri = resolution.resolvedAssetUris[asset.id];
    if (!localUri || localUri === asset.localUri) return asset;
    changed = true;
    return { ...asset, localUri };
  };
  const repaired: JournalSnapshot = {
    ...snapshot,
    pages: snapshot.pages.map((page) => ({
      ...page,
      objects: page.objects.map((object) =>
        object.type === "photo" || object.type === "voice"
          ? { ...object, asset: update(object.asset) }
          : object,
      ),
    })),
    stories: snapshot.stories.map((story) => ({
      ...story,
      pages: story.pages.map((page) => ({
        ...page,
        photos: page.photos.map((photo) => ({ ...photo, asset: update(photo.asset) })),
        recordings: page.recordings.map((recording) => ({
          ...recording,
          asset: update(recording.asset),
        })),
      })),
    })),
    settings: {
      ...snapshot.settings,
      myWords: snapshot.settings.myWords.map((word) =>
        word.sample ? { ...word, sample: update(word.sample) } : word,
      ),
    },
  };
  return {
    snapshot: changed ? repaired : snapshot,
    changed,
    unresolvedAssetIds: resolution.unresolvedAssetIds,
  };
}
