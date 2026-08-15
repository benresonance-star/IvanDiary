import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { Navigation } from "./Navigation";
import { SettingsView } from "./SettingsView";
import {
  BrowserAppleTranscriptionMock,
  BrowserJournalAudioMock,
  BrowserJournalFilesMock,
} from "../native/browserMocks";
import { hslToHex } from "../utils/colour";

const sketchRepository = {
  load: vi.fn(async (id: string) => ({
    schemaVersion: 1 as const,
    id,
    size: { width: 900, height: 900 },
    strokes: [],
    revision: 0,
  })),
  save: vi.fn(),
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("accessible navigation and settings", () => {
  it("exposes the active section and large named navigation actions", () => {
    const onSectionChange = vi.fn();
    function NavigationHarness() {
      const [menuOpen, setMenuOpen] = useState(false);
      return (
        <Navigation
          activeSection="diary"
          backupStatus={{ state: "error", pendingItemCount: 1, message: "Not connected" }}
          displayName="Ivan"
          menuOpen={menuOpen}
          menuOpening={false}
          onMenuClose={() => setMenuOpen(false)}
          onMenuOpen={() => setMenuOpen(true)}
          onSectionChange={onSectionChange}
          sketchRepository={sketchRepository}
        />
      );
    }
    render(
      <NavigationHarness />,
    );

    const trigger = screen.getByRole("button", { name: "Ivan navigation" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "My Journal" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    fireEvent.click(screen.getByRole("button", { name: "My Favourites" }));
    expect(onSectionChange).toHaveBeenCalledWith("favourites");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: /My Settings.*Backup issue/i })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("uses choice and switch semantics for accessibility preferences", () => {
    const commit = vi.fn();
    const onPreviewWelcome = vi.fn();
    render(
      <SettingsView
        audio={new BrowserJournalAudioMock()}
        backupStatus={{
          state: "not-configured",
          pendingItemCount: 0,
          message: "This version of the app is not connected to iCloud.",
        }}
        commit={commit}
        files={new BrowserJournalFilesMock()}
        onPreviewWelcome={onPreviewWelcome}
        onEditPortrait={vi.fn()}
        onBackupNow={vi.fn()}
        onCheckBackup={vi.fn()}
        onRestore={vi.fn()}
        sketchRepository={sketchRepository}
        settings={{
          displayName: "Ivan",
          lastSettingsTab: "welcome",
          textScale: "large",
          contrast: "warm",
          reducedMotion: false,
          penColor: "#171410",
          penWidth: 4.2,
          penOpacity: 1,
          fingerDrawingEnabled: true,
          favouritePenColours: [
            "#171410", "#245b8a", "#426b3a", "#9b352f", "#6b4f82",
            "#76512f", "#c86f24", "#2f6f6d", "#a64b6b", "#686868",
          ],
          favouriteColourLongPressEnabled: true,
          favouriteColourLongPressSeconds: 2,
          penNib: "pen",
          penNibProfiles: {
            pen: { color: "#171410", width: 4.2, opacity: 1 },
            marker: { color: "#171410", width: 14, opacity: 0.45 },
            pencil: { color: "#171410", width: 5, opacity: 0.72 },
            brush: { color: "#171410", width: 12, opacity: 0.68 },
          },
          welcomeGreeting: "Welcome back Ivan!",
          welcomeTagline: "It's a Wonderful World!",
          welcomeMessage: "",
          textEditorPreference: "native",
          recordingLimitMinutes: 5,
          automaticBackup: true,
          backupOnWifiOnly: true,
          myWords: [],
        }}
        transcription={new BrowserAppleTranscriptionMock()}
      />,
    );

    expect(screen.getByRole("tab", { name: "Welcome" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Preview welcome screen" }),
    );
    expect(onPreviewWelcome).toHaveBeenCalledWith({
      greeting: "Welcome back Ivan!",
      tagline: "It's a Wonderful World!",
      message: "",
    });

    fireEvent.click(screen.getByRole("tab", { name: "Canvas" }));
    expect(screen.getAllByRole("button", { name: /^(Black|Blue|Green|Red|Purple|Brown|Orange|Teal|Rose|Grey)$/ })).toHaveLength(10);
    const longHoldToggle = screen.getByRole("checkbox", {
      name: "Change colours with a long hold",
    });
    expect(longHoldToggle).toBeChecked();
    fireEvent.click(longHoldToggle);
    expect(commit).toHaveBeenCalledWith({
      type: "settings-update",
      settings: { favouriteColourLongPressEnabled: false },
    });
    fireEvent.change(
      screen.getByRole("slider", {
        name: "Favourite colour long-hold time",
      }),
      { target: { value: "3" } },
    );
    expect(commit).toHaveBeenCalledWith({
      type: "settings-update",
      settings: { favouriteColourLongPressSeconds: 3 },
    });
    fireEvent.change(screen.getByRole("slider", { name: "Canvas colour hue" }), {
      target: { value: "180" },
    });
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({
      type: "settings-update",
      settings: expect.objectContaining({
        favouritePenColours: expect.any(Array),
        penColor: expect.stringMatching(/^#[0-9a-f]{6}$/i),
      }),
    }));
    const canvasHue = screen.getByRole("slider", {
      name: "Canvas colour hue",
    });
    const canvasStrength = screen.getByRole("slider", {
      name: "Canvas colour strength",
    });
    const canvasLightness = screen.getByRole("slider", {
      name: "Canvas colour lightness",
    });
    fireEvent.change(canvasStrength, { target: { value: "75" } });
    fireEvent.change(canvasLightness, { target: { value: "0" } });
    fireEvent.change(canvasHue, { target: { value: "250" } });
    expect(canvasHue).toHaveValue("250");
    expect(canvasStrength).toHaveValue("75");
    expect(canvasLightness).toHaveValue("0");
    fireEvent.change(canvasLightness, { target: { value: "50" } });
    expect(commit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "settings-update",
        settings: expect.objectContaining({
          penColor: hslToHex(250, 75, 50),
        }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Brush" }));
    expect(screen.getByRole("button", { name: "Brush" })).toHaveAttribute("aria-pressed", "true");

    expect(screen.queryByRole("tab", { name: "Text size" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));
    expect(screen.getByRole("button", { name: "Large" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const highContrast = screen.getByRole("checkbox", { name: "High contrast" });
    expect(highContrast).not.toBeChecked();
    fireEvent.click(highContrast);
    expect(commit).toHaveBeenCalledWith({
      type: "settings-update",
      settings: { contrast: "high" },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Backup" }));
    expect(screen.getByRole("status")).toHaveTextContent("Backup is not connected");
    expect(screen.getByRole("button", { name: "Check iCloud connection" })).toBeEnabled();

    fireEvent.click(screen.getByRole("tab", { name: "About Me" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), {
      target: { value: "Super Ivan" },
    });
    fireEvent.blur(screen.getByRole("textbox", { name: "Display name" }));
    expect(commit).toHaveBeenCalledWith({
      type: "settings-update",
      settings: { displayName: "Super Ivan" },
    });
  });

  it("keeps the profile and removes the warning after backup completes", () => {
    render(
      <Navigation
        activeSection="diary"
        backupStatus={{ state: "synced", pendingItemCount: 0, message: "Backup is up to date" }}
        displayName="Ivan"
        menuOpen={false}
        menuOpening={false}
        onMenuClose={vi.fn()}
        onMenuOpen={vi.fn()}
        onSectionChange={vi.fn()}
        sketchRepository={sketchRepository}
      />,
    );

    expect(screen.getByRole("button", { name: "Ivan navigation" })).toBeInTheDocument();
    expect(screen.queryByText(/Backup issue|Backup incomplete/)).not.toBeInTheDocument();
  });

  it("keeps a long full name available inside the profile menu", () => {
    const longName = "Alexander Benjamin Christopher Davidson";
    render(
      <Navigation
        activeSection="diary"
        backupStatus={{ state: "synced", pendingItemCount: 0, message: "Backup is up to date" }}
        displayName={longName}
        menuOpen
        menuOpening={false}
        onMenuClose={vi.fn()}
        onMenuOpen={vi.fn()}
        onSectionChange={vi.fn()}
        sketchRepository={sketchRepository}
      />,
    );

    expect(
      screen.getByRole("button", { name: `${longName} navigation` }),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent(longName);
  });

  it.each(["not-configured", "available", "syncing", "synced"] as const)(
    "does not show a backup alert for the normal %s state",
    (state) => {
      render(
        <Navigation
          activeSection="diary"
          backupStatus={{ state, pendingItemCount: 0, message: "No action needed" }}
          displayName="Ivan"
          menuOpen
          menuOpening={false}
          onMenuClose={vi.fn()}
          onMenuOpen={vi.fn()}
          onSectionChange={vi.fn()}
          sketchRepository={sketchRepository}
        />,
      );
      expect(screen.queryByText(/Backup issue|Backup incomplete/)).not.toBeInTheDocument();
    },
  );
});
