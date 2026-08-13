import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { VoiceRecordingObject } from "../domain/models";
import { BrowserJournalAudioMock } from "../native/browserMocks";
import { AudioCard } from "./AudioCard";

const recording: VoiceRecordingObject = {
  id: "voice-1",
  type: "voice",
  pageId: "page-1",
  position: { x: 0.1, y: 0.1 },
  createdAt: "2026-08-10T00:00:00.000Z",
  revision: 1,
  asset: {
    id: "voice-1",
    localUri: "demo://recording/voice-1",
    mimeType: "audio/mp4",
    byteLength: 1,
    checksum: "demo",
  },
  durationMs: 1_000,
  transcriptionStatus: "failed",
};

describe("AudioCard transcription state", () => {
  it("returns to play when native playback finishes", async () => {
    let playbackEnded: ((event: { assetUri: string }) => void) | undefined;
    const audio = new BrowserJournalAudioMock();
    audio.addListener = vi.fn(async (_eventName, listener) => {
      playbackEnded = listener;
      return { remove: async () => undefined };
    });

    render(<AudioCard audio={audio} recording={recording} />);
    fireEvent.click(screen.getByRole("button", { name: "Play voice recording" }));
    await screen.findByRole("button", { name: "Pause voice recording" });

    playbackEnded?.({ assetUri: recording.asset.localUri });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Play voice recording" })).toBeEnabled();
    });
  });

  it("keeps playback and offers transcription retry after failure", () => {
    const retry = vi.fn();
    render(
      <AudioCard
        audio={new BrowserJournalAudioMock()}
        onRetryTranscription={retry}
        recording={recording}
      />,
    );

    expect(screen.getByRole("button", { name: "Play voice recording" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Try text again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("announces transcription while preserving playback", () => {
    render(
      <AudioCard
        audio={new BrowserJournalAudioMock()}
        recording={{ ...recording, transcriptionStatus: "transcribing" }}
      />,
    );

    expect(screen.getByText("Turning this recording into text…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play voice recording" })).toBeEnabled();
  });

  it("allows recordings left pending by an older app build to generate text", () => {
    const generate = vi.fn();
    render(
      <AudioCard
        audio={new BrowserJournalAudioMock()}
        onRetryTranscription={generate}
        recording={{ ...recording, transcriptionStatus: "pending" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate text" }));
    expect(generate).toHaveBeenCalledOnce();
  });
});
