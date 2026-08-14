import { describe, expect, it, vi } from "vitest";

import type {
  AppleTranscriptionPlugin,
  JournalAudioPlugin,
  JournalFilesPlugin,
  RecordingSnapshot,
} from "./contracts";
import {
  EphemeralTranscriptionError,
  transcribeEphemeralRecording,
} from "./ephemeralTranscription";

const asset = {
  id: "temporary-recording",
  localUri: "file:///support/temporary-recording.m4a",
  mimeType: "audio/mp4",
  byteLength: 12,
  checksum: "sha256",
};
const saved: RecordingSnapshot = {
  id: asset.id,
  state: "saved",
  elapsedMs: 500,
  asset,
};
const recording: RecordingSnapshot = {
  id: asset.id,
  state: "recording",
  elapsedMs: 500,
};

function doubles() {
  const audio: JournalAudioPlugin = {
    start: vi.fn(),
    status: async () => recording,
    stop: async () => saved,
    acknowledgeSaved: vi.fn(),
    recoverInterrupted: vi.fn(),
    play: vi.fn(),
    pausePlayback: vi.fn(),
    addListener: vi.fn(async () => ({ remove: async () => undefined })),
  };
  const files: JournalFilesPlugin = {
    finaliseTemporaryAsset: vi.fn(),
    removeToTrash: vi.fn(async () => undefined),
    storageHealth: vi.fn(),
  };
  const requestPermission = vi.fn(async () => ({ granted: true }));
  const transcribe: AppleTranscriptionPlugin["transcribe"] = vi.fn(
    async ({ recordingId }) => ({
      recordingId,
      rawText: "Ivan",
      locale: "en-AU",
      engine: "apple-speech" as const,
    }),
  );
  const transcription: AppleTranscriptionPlugin = {
    requestPermission,
    transcribe,
  };
  return { audio, files, transcription };
}

describe("ephemeral recording transcription", () => {
  it("finalizes, requests permission, transcribes with context, then removes the asset", async () => {
    const { audio, files, transcription } = doubles();

    await expect(
      transcribeEphemeralRecording({
        audio,
        contextualStrings: ["Ivan", "Banksia"],
        files,
        transcription,
      }),
    ).resolves.toMatchObject({ rawText: "Ivan" });

    expect(transcription.transcribe).toHaveBeenCalledWith({
      recordingId: saved.id,
      asset,
      locale: "en-AU",
      contextualStrings: ["Ivan", "Banksia"],
    });
    expect(
      vi.mocked(transcription.requestPermission).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(transcription.transcribe).mock.invocationCallOrder[0]!,
    );
    expect(files.removeToTrash).toHaveBeenCalledWith({ assetId: asset.id });
  });

  it("always removes the finalized asset when transcription fails", async () => {
    const { audio, files, transcription } = doubles();
    vi.mocked(transcription.transcribe).mockRejectedValue(
      new Error("not understood"),
    );

    await expect(
      transcribeEphemeralRecording({ audio, files, transcription }),
    ).rejects.toMatchObject({
      failure: "transcription",
    } satisfies Partial<EphemeralTranscriptionError>);
    expect(files.removeToTrash).toHaveBeenCalledWith({ assetId: asset.id });
  });

  it("removes the asset after denied permission without transcribing", async () => {
    const { audio, files, transcription } = doubles();
    vi.mocked(transcription.requestPermission).mockResolvedValue({
      granted: false,
    });

    await expect(
      transcribeEphemeralRecording({ audio, files, transcription }),
    ).rejects.toMatchObject({
      failure: "permission",
    } satisfies Partial<EphemeralTranscriptionError>);
    expect(transcription.transcribe).not.toHaveBeenCalled();
    expect(files.removeToTrash).toHaveBeenCalledWith({ assetId: asset.id });
  });

  it("can preserve permission timing by skipping the utility permission request", async () => {
    const { audio, files, transcription } = doubles();

    await transcribeEphemeralRecording({
      audio,
      files,
      requestPermission: false,
      transcription,
    });

    expect(transcription.requestPermission).not.toHaveBeenCalled();
    expect(transcription.transcribe).toHaveBeenCalledOnce();
  });
});
