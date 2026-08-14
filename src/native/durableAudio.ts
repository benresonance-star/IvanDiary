import type { JournalAudioPlugin, JournalFilesPlugin, RecordingSnapshot } from "./contracts";

export async function recordingStorageAvailable(
  files: JournalFilesPlugin,
): Promise<boolean> {
  const health = await files.storageHealth();
  return !health.lowStorage;
}

export async function finalizeStoppedRecording(
  audio: JournalAudioPlugin,
  files: JournalFilesPlugin,
): Promise<RecordingSnapshot> {
  const current = await audio.status();
  const stopped = current.state === "finalising" ? current : await audio.stop();
  if (stopped.state === "saved" && stopped.asset) return stopped;
  if (stopped.state !== "finalising" || !stopped.temporaryUri) {
    throw new Error("Recording did not close into a finalizable temporary file.");
  }
  const asset = await files.finaliseTemporaryAsset({
    temporaryUri: stopped.temporaryUri,
    assetId: stopped.id,
    mimeType: "audio/mp4",
  });
  const acknowledged = await audio.acknowledgeSaved();
  if (acknowledged.state !== "saved") {
    throw new Error("Finalized recording was not acknowledged as saved.");
  }
  return { ...acknowledged, asset };
}
