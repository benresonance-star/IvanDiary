import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createInitialJournalSnapshot } from "../domain/initialState";
import {
  BrowserAppleTranscriptionMock,
  BrowserJournalAudioMock,
  BrowserJournalFilesMock,
  BrowserNativeShareMock,
} from "../native/browserMocks";
import { BrowserSketchRepository } from "../repository/browserSketchRepository";
import { SettingsView } from "./SettingsView";
import { BackupSettingsPanel } from "./BackupSettingsPanel";

function renderSettings({
  commit = vi.fn(),
  files = new BrowserJournalFilesMock(),
  onDeleteCloudData = vi.fn(),
  share = new BrowserNativeShareMock(),
  transcription = new BrowserAppleTranscriptionMock(),
} = {}) {
  const settings = {
    ...createInitialJournalSnapshot(
      new Date("2026-08-14T10:00:00.000Z"),
    ).settings,
    lastSettingsTab: "about" as const,
  };
  const snapshot = createInitialJournalSnapshot(
    new Date("2026-08-14T10:00:00.000Z"),
  );
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
      historyStatus={{ state: "idle", entries: [] }}
      onBackupNow={vi.fn()}
      onCheckBackup={vi.fn()}
      onKeepThisIPad={vi.fn()}
      onSaveLocalCopy={vi.fn()}
      onUseICloud={vi.fn()}
      onCreateHistory={vi.fn()}
      onDeleteHistory={vi.fn()}
      onDeleteCloudData={onDeleteCloudData}
      onEditPortrait={vi.fn()}
      onPreviewWelcome={vi.fn()}
      onRefreshHistory={vi.fn()}
      onRestoreHistory={vi.fn()}
      settings={settings}
      share={share}
      sketchRepository={new BrowserSketchRepository()}
      snapshot={{ ...snapshot, settings }}
      transcription={transcription}
    />,
  );
  return { commit, files, onDeleteCloudData, settings, share };
}

describe("SettingsView name entry", () => {
  it("requests the standard text keyboard for typed names", () => {
    renderSettings();

    const input = screen.getByRole("textbox", { name: "My Name" });
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
    expect(screen.getByRole("textbox", { name: "My Name" })).toHaveValue(
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

describe("SettingsView backup sections", () => {
  it("groups iCloud Sync, History, and Privacy & Export into accessible collapsible sections", () => {
    renderSettings();

    fireEvent.click(screen.getByRole("tab", { name: "Backup" }));
    const sync = screen.getByRole("button", { name: /iCloud Sync/ });
    const history = screen.getByRole("button", { name: /History/ });
    const privacy = screen.getByRole("button", { name: /Privacy & Export/ });
    expect(sync).toHaveAttribute("aria-expanded", "true");
    expect(history).toHaveAttribute("aria-expanded", "false");
    expect(privacy).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(history);

    expect(screen.getByRole("heading", { name: "Backup history" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create recovery point" })).toBeInTheDocument();
    expect(screen.getByText(/last 5 entry days/)).toBeInTheDocument();
    expect(sync).toHaveAttribute("aria-expanded", "false");
  });
});

describe("iCloud conflict choices", () => {
  it("does not choose between two iPads without the user", () => {
    const onKeepThisIPad = vi.fn();
    const onSaveLocalCopy = vi.fn();
    const onUseICloud = vi.fn();
    render(
      <BackupSettingsPanel
        backupStatus={{
          state: "available",
          pendingItemCount: 0,
          message: "Nothing was overwritten.",
          conflictDetected: true,
          backupDeviceName: "Kitchen iPad",
        }}
        commit={vi.fn()}
        onBackupNow={vi.fn()}
        onCheckBackup={vi.fn()}
        onKeepThisIPad={onKeepThisIPad}
        onSaveLocalCopy={onSaveLocalCopy}
        onUseICloud={onUseICloud}
        settings={createInitialJournalSnapshot().settings}
      />,
    );

    expect(screen.getByText(/last saved by Kitchen iPad/)).toBeInTheDocument();
    expect(onKeepThisIPad).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use the iCloud diary" }));
    expect(onUseICloud).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Keep this iPad’s diary" }));
    expect(onKeepThisIPad).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Save this iPad as a recovery point" }));
    expect(onSaveLocalCopy).toHaveBeenCalledOnce();
  });
});

describe("SettingsView privacy", () => {
  it("explains private iCloud storage and exposes cloud deletion", () => {
    const { onDeleteCloudData } = renderSettings();
    fireEvent.click(screen.getByRole("tab", { name: "Backup" }));
    fireEvent.click(screen.getByRole("button", { name: /Privacy & Export/ }));

    expect(screen.getByRole("heading", { name: "Privacy & Export" })).toBeInTheDocument();
    expect(screen.getByText(/private iCloud database/i)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete my iCloud diary and history",
      }),
    );
    expect(onDeleteCloudData).toHaveBeenCalledOnce();
  });

  it("exports a readable diary and complete portable archive", async () => {
    const share = new BrowserNativeShareMock();
    const exportDiary = vi.spyOn(share, "exportDiary");
    const openShareSheet = vi.spyOn(share, "share");
    renderSettings({ share });
    fireEvent.click(screen.getByRole("tab", { name: "Backup" }));
    fireEvent.click(screen.getByRole("button", { name: /Privacy & Export/ }));

    fireEvent.click(screen.getByRole("button", { name: "Export my complete diary" }));

    await waitFor(() => expect(exportDiary).toHaveBeenCalledOnce());
    expect(exportDiary).toHaveBeenCalledWith(expect.objectContaining({
      snapshotJson: expect.any(String),
      readableText: expect.stringContaining("iPad App — Complete Diary Export"),
      assets: expect.any(Array),
    }));
    await waitFor(() => expect(openShareSheet).toHaveBeenCalledWith(
      expect.objectContaining({
        fileUris: [
          "demo://share/iPad-App-Diary.pdf",
          "demo://share/iPad-App-Diary.tar",
        ],
      }),
    ));
    expect(await screen.findByText("The complete diary was exported."))
      .toBeInTheDocument();
  });

  it("shows export failures as a prominent alert with the reason", async () => {
    const share = new BrowserNativeShareMock();
    vi.spyOn(share, "exportDiary").mockRejectedValueOnce(
      new Error("An original diary file could not be read."),
    );
    renderSettings({ share });
    fireEvent.click(screen.getByRole("tab", { name: "Backup" }));
    fireEvent.click(screen.getByRole("button", { name: /Privacy & Export/ }));

    fireEvent.click(screen.getByRole("button", { name: "Export my complete diary" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveClass("settings-result-alert", "error");
    expect(alert).toHaveTextContent("Export failed");
    expect(alert).toHaveTextContent("An original diary file could not be read");
  });

  it("provides one help topic for the combined Backup section", () => {
    renderSettings();
    const backupTab = screen.getByRole("tab", { name: "Backup" });

    expect(backupTab).toHaveAttribute("data-help-topic", "settings-backup");
    fireEvent.click(backupTab);
    expect(document.querySelector(".settings-panel")).toHaveAttribute(
      "data-help-topic",
      "settings-backup",
    );
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
