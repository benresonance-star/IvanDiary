import { describe, expect, it, vi } from "vitest";
import type { JournalAudioPlugin, JournalFilesPlugin, RecordingSnapshot } from "./contracts";
import {
  finalizeStoppedRecording,
  recordingStorageAvailable,
} from "./durableAudio";

const finalising: RecordingSnapshot = { id: "stable-recording", state: "finalising", elapsedMs: 500, temporaryUri: "file:///tmp/a.m4a" };
const asset = { id: "stable-recording", localUri: "file:///support/a.m4a", mimeType: "audio/mp4", byteLength: 12, checksum: "sha256" };

function doubles(finalize = vi.fn(async () => asset)) {
  const audio: JournalAudioPlugin = {
    start: vi.fn(), status: vi.fn(async () => ({ id: "idle", state: "idle" as const, elapsedMs: 0 })), stop: vi.fn(async () => finalising),
    acknowledgeSaved: vi.fn(async () => ({ ...finalising, state: "saved" as const, temporaryUri: undefined })),
    recoverInterrupted: vi.fn(), play: vi.fn(), pausePlayback: vi.fn(),
    addListener: vi.fn(async () => ({ remove: async () => undefined })),
  };
  const files: JournalFilesPlugin = { finaliseTemporaryAsset: finalize, removeToTrash: vi.fn(), resolveStoredAssets: vi.fn(), storageHealth: vi.fn() };
  return { audio, files, finalize };
}

describe("durable recording finalization", () => {
  it("orders close, atomic finalization, and saved acknowledgement", async () => {
    const { audio, files, finalize } = doubles();
    const result = await finalizeStoppedRecording(audio, files);
    expect(result.asset).toEqual(asset);
    expect(finalize).toHaveBeenCalledWith({ temporaryUri: finalising.temporaryUri, assetId: finalising.id, mimeType: "audio/mp4" });
    expect(vi.mocked(audio.acknowledgeSaved).mock.invocationCallOrder[0]).toBeGreaterThan(finalize.mock.invocationCallOrder[0]!);
  });

  it("does not acknowledge or produce a saved recording when finalization fails", async () => {
    const finalize = vi.fn(async () => { throw { code: "LOW_STORAGE" }; });
    const { audio, files } = doubles(finalize);
    await expect(finalizeStoppedRecording(audio, files)).rejects.toEqual({ code: "LOW_STORAGE" });
    expect(audio.acknowledgeSaved).not.toHaveBeenCalled();
  });

  it("finalizes a file already stopped by the native safety limit", async () => {
    const { audio, files } = doubles();
    vi.mocked(audio.status).mockResolvedValue(finalising);
    await finalizeStoppedRecording(audio, files);
    expect(audio.stop).not.toHaveBeenCalled();
    expect(files.finaliseTemporaryAsset).toHaveBeenCalled();
  });

  it("blocks new recordings when storage health is low", async () => {
    const { files } = doubles();
    vi.mocked(files.storageHealth).mockResolvedValue({
      availableBytes: 1024,
      lowStorage: true,
    });

    await expect(recordingStorageAvailable(files)).resolves.toBe(false);
  });
});
