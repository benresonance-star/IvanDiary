import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createInitialJournalSnapshot } from "../domain/initialState";
import {
  BrowserAppleTranscriptionMock,
  BrowserJournalAudioMock,
  BrowserJournalFilesMock,
} from "../native/browserMocks";
import { BrowserSketchRepository } from "../repository/browserSketchRepository";
import { SettingsView } from "./SettingsView";

function renderSettings({
  commit = vi.fn(),
  files = new BrowserJournalFilesMock(),
  transcription = new BrowserAppleTranscriptionMock(),
} = {}) {
  const settings = {
    ...createInitialJournalSnapshot(
      new Date("2026-08-14T10:00:00.000Z"),
    ).settings,
    lastSettingsTab: "about" as const,
  };
  render(
    <SettingsView
      audio={new BrowserJournalAudioMock()}
      backupStatus={{
        state: "not-configured",
        pendingItemCount: 0,
        message: "Backup is not configured.",
      }}
      commit={commit}
      files={files}
      onBackupNow={vi.fn()}
      onCheckBackup={vi.fn()}
      onEditPortrait={vi.fn()}
      onPreviewWelcome={vi.fn()}
      onRestore={vi.fn()}
      settings={settings}
      sketchRepository={new BrowserSketchRepository()}
      transcription={transcription}
    />,
  );
  return { commit, files, settings };
}

describe("SettingsView name entry", () => {
  it("requests the standard text keyboard for typed names", () => {
    renderSettings();

    const input = screen.getByRole("textbox", { name: "Display name" });
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputmode", "text");
    expect(input).toHaveAttribute("autocapitalize", "words");
    expect(input).toHaveAttribute("enterkeyhint", "done");
  });

  it("records, transcribes, saves, and removes a spoken name", async () => {
    const commit = vi.fn();
    const files = new BrowserJournalFilesMock();
    const removeToTrash = vi.spyOn(files, "removeToTrash");
    renderSettings({ commit, files });

    fireEvent.click(screen.getByRole("button", { name: "Speak your name" }));
    expect(
      await screen.findByText("Listening. Say your name, then tap Stop."),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Stop and use my name" }),
    );

    await waitFor(() =>
      expect(commit).toHaveBeenCalledWith({
        type: "settings-update",
        settings: {
          displayName:
            "Browser transcription demonstration. Edit this text if needed.",
        },
      }),
    );
    expect(removeToTrash).toHaveBeenCalledOnce();
  });

  it("preserves the typed name when speech permission is unavailable", async () => {
    const commit = vi.fn();
    const transcription = new BrowserAppleTranscriptionMock();
    transcription.requestPermission = vi.fn(async () => ({ granted: false }));
    const { settings } = renderSettings({ commit, transcription });

    fireEvent.click(screen.getByRole("button", { name: "Speak your name" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Stop and use my name" }),
    );

    expect(
      await screen.findByText(
        "Speech permission is off. Your typed name is unchanged.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Display name" })).toHaveValue(
      settings.displayName,
    );
    expect(commit).not.toHaveBeenCalled();
  });
});

describe("SettingsView text editor preference", () => {
  it("switches between the native and standard text editors", () => {
    const commit = vi.fn();
    renderSettings({ commit });
    fireEvent.click(screen.getByRole("tab", { name: "Voice" }));

    const nativeEditor = screen.getByRole("checkbox", {
      name: "Use native Apple text editor",
    });
    expect(nativeEditor).toBeChecked();
    fireEvent.click(nativeEditor);

    expect(commit).toHaveBeenCalledWith({
      type: "settings-update",
      settings: { textEditorPreference: "standard" },
    });
  });
});

describe("SettingsView app orientation", () => {
  it("defaults to the standard landscape appearance and can disable it", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        disconnect() {}
        observe() {}
        unobserve() {}
      },
    );
    const commit = vi.fn();
    renderSettings({ commit });
    fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));

    const standardAppearance = screen.getByRole("checkbox", {
      name: "Standard app appearance",
    });
    expect(standardAppearance).toBeChecked();
    fireEvent.click(standardAppearance);

    expect(commit).toHaveBeenCalledWith({
      type: "settings-update",
      settings: { standardAppAppearance: false },
    });
  });
});
