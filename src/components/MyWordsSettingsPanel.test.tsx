import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createInitialJournalSnapshot } from "../domain/initialState";
import {
  BrowserJournalAudioMock,
  BrowserJournalFilesMock,
} from "../native/browserMocks";
import { MyWordsSettingsPanel } from "./MyWordsSettingsPanel";

function renderPanel(
  myWords = [
    {
      id: "word-1",
      text: "Ivan",
      enabled: true,
      correctionCount: 0,
    },
  ],
) {
  const commit = vi.fn();
  const settings = {
    ...createInitialJournalSnapshot(
      new Date("2026-08-14T10:00:00.000Z"),
    ).settings,
    myWords,
  };
  render(
    <MyWordsSettingsPanel
      audio={new BrowserJournalAudioMock()}
      commit={commit}
      files={new BrowserJournalFilesMock()}
      settings={settings}
    />,
  );
  return { commit };
}

describe("MyWordsSettingsPanel", () => {
  it("uses a guided empty state and labelled add form", () => {
    const { commit } = renderPanel([]);

    expect(screen.getByText("No saved words yet")).toBeInTheDocument();
    expect(screen.getByText("0 of 100")).toBeInTheDocument();
    const input = screen.getByRole("textbox", {
      name: "Word or short phrase",
    });
    const add = screen.getByRole("button", { name: "Add word" });
    expect(add).toBeDisabled();

    fireEvent.change(input, { target: { value: "  Evelyn  " } });
    fireEvent.click(add);

    expect(commit).toHaveBeenCalledWith({
      type: "settings-update",
      settings: {
        myWords: [
          expect.objectContaining({
            text: "Evelyn",
            enabled: true,
            correctionCount: 0,
          }),
        ],
      },
    });
  });

  it("presents saved words as labelled, accessible controls", () => {
    const { commit } = renderPanel();

    expect(screen.getByText("1 of 100")).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Controls for Ivan" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Edit Ivan" })).toHaveValue(
      "Ivan",
    );
    const enabled = screen.getByRole("checkbox", {
      name: "Use Ivan for voice recognition",
    });
    expect(enabled).toBeChecked();

    fireEvent.click(enabled);
    expect(commit).toHaveBeenCalledWith({
      type: "settings-update",
      settings: {
        myWords: [
          {
            id: "word-1",
            text: "Ivan",
            enabled: false,
            correctionCount: 0,
          },
        ],
      },
    });
  });

  it("shows a clear recording state for a voice sample", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Record sample" }));

    const stop = await screen.findByRole("button", { name: "Stop sample" });
    expect(stop).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(
        screen.getByText("Recording a voice sample for Ivan."),
      ).toBeInTheDocument(),
    );
  });
});
