import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  BrowserAppleTranscriptionMock,
  BrowserJournalAudioMock,
  BrowserJournalFilesMock,
} from "../native/browserMocks";
import { LinkComposer } from "./JournalPage";

describe("LinkComposer", () => {
  it("edits an existing link name and address", () => {
    const onSave = vi.fn();
    render(
      <LinkComposer
        initialTitle="Family photos"
        initialUrl="https://example.com/old"
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Edit web link" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Link Name on the Canvas:"), {
      target: { value: "Holiday photos" },
    });
    fireEvent.change(screen.getByLabelText("Paste Web Link Address Here:"), {
      target: { value: "https://example.com/new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith(
      "https://example.com/new",
      "Holiday photos",
    );
  });

  it("renders as a modal above the canvas and blocks canvas interaction", () => {
    const onClose = vi.fn();
    render(
      <LinkComposer
        onClose={onClose}
        onSave={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Add a web link" });
    expect(dialog.parentElement).toHaveClass("link-composer-backdrop");
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("offers clear examples and lets the user speak the canvas name", async () => {
    const audio = new BrowserJournalAudioMock();
    const files = new BrowserJournalFilesMock();
    const transcription = new BrowserAppleTranscriptionMock();
    vi.spyOn(transcription, "transcribe").mockResolvedValue({
      recordingId: "spoken-link",
      rawText: "My Favourite Song",
      locale: "en-AU",
      engine: "apple-speech",
    });
    render(
      <LinkComposer
        audio={audio}
        files={files}
        onClose={vi.fn()}
        onSave={vi.fn()}
        transcription={transcription}
      />,
    );

    expect(screen.getByPlaceholderText("https://youtube.com")).toBeVisible();
    const name = screen.getByPlaceholderText("My Favourite Song");
    fireEvent.click(screen.getByRole("button", { name: "Speak link name" }));
    expect(await screen.findByRole("button", { name: "Stop speaking link name" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Stop speaking link name" }));

    await waitFor(() => expect(name).toHaveValue("My Favourite Song"));
    expect(screen.getByText("Spoken link name added. Check it before saving.")).toBeVisible();
  });
});
