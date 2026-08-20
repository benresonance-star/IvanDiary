import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BrowserJournalAudioMock, BrowserJournalFilesMock } from "../native/browserMocks";
import { VoiceRecordingDialog } from "./VoiceRecordingDialog";

describe("VoiceRecordingDialog", () => {
  it("records, pauses, reviews, and places only after approval", async () => {
    const onPlace = vi.fn();
    const audio = new BrowserJournalAudioMock();
    const stopMonitoring = vi.spyOn(audio, "stopMonitoring");
    const startRecording = vi.spyOn(audio, "start");
    render(<VoiceRecordingDialog
      audio={audio}
      files={new BrowserJournalFilesMock()}
      onCancel={vi.fn()}
      onPlace={onPlace}
      recordingLimitMinutes={5}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    expect(await screen.findByRole("button", { name: "Pause recording" })).toBeVisible();
    expect(stopMonitoring).toHaveBeenCalled();
    expect(stopMonitoring.mock.invocationCallOrder[0]).toBeLessThan(
      startRecording.mock.invocationCallOrder[0]!,
    );
    expect(screen.getByRole("img", { name: "Microphone level" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Pause recording" }));
    expect(await screen.findByRole("button", { name: "Resume recording" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Recording paused.");
    expect(screen.getByRole("img", { name: "Microphone inactive" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Resume recording" }));
    expect(await screen.findByRole("button", { name: "Pause recording" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "End recording" }));
    expect(await screen.findByRole("button", { name: "Play recording" })).toBeVisible();
    expect(onPlace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Place recording" }));
    await waitFor(() => expect(onPlace).toHaveBeenCalledWith(expect.objectContaining({ state: "saved", asset: expect.any(Object) })));
  });
});
