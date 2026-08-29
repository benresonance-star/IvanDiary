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
  it("plays and selects the surrounding edit-mode object", async () => {
    const audio = new BrowserJournalAudioMock();
    const play = vi.spyOn(audio, "play");
    const selectObject = vi.fn();
    render(
      <div className="page-object arrangeable" onClick={selectObject}>
        <AudioCard audio={audio} recording={recording} />
      </div>,
    );

    const playButton = screen.getByRole("button", { name: "Play voice recording" });
    expect(playButton).toBeEnabled();
    fireEvent.click(playButton);

    await waitFor(() => expect(play).toHaveBeenCalledWith({
      assetUri: recording.asset.localUri,
    }));
    expect(selectObject).toHaveBeenCalledOnce();
  });

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

  it("shows only playback regardless of transcription state", () => {
    render(
      <AudioCard
        audio={new BrowserJournalAudioMock()}
        onConvertToText={vi.fn()}
        recording={recording}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Play voice recording" }),
    ).toHaveTextContent("Play");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText(/convert|converting|try again/i))
      .not.toBeInTheDocument();
  });
});
