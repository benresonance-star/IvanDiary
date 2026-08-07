import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Navigation } from "./Navigation";
import { SettingsView } from "./SettingsView";

describe("accessible navigation and settings", () => {
  it("exposes the active section and large named navigation actions", () => {
    const onSectionChange = vi.fn();
    render(
      <Navigation
        activeSection="diary"
        onSectionChange={onSectionChange}
      />,
    );

    expect(screen.getByRole("button", { name: "Diary" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    fireEvent.click(screen.getByRole("button", { name: "Favourites" }));
    expect(onSectionChange).toHaveBeenCalledWith("favourites");
  });

  it("uses pressed states for accessibility preferences", () => {
    const commit = vi.fn();
    const onPreviewWelcome = vi.fn();
    render(
      <SettingsView
        commit={commit}
        onPreviewWelcome={onPreviewWelcome}
        settings={{
          simpleMode: true,
          textScale: "large",
          contrast: "warm",
          reducedMotion: false,
          penColor: "#171410",
          penWidth: 4.2,
          penOpacity: 1,
          welcomeGreeting: "Welcome back Ivan!",
          welcomeTagline: "It's a Wonderful World!",
          welcomeMessage: "",
        }}
      />,
    );

    expect(screen.getByRole("button", { name: /Simple mode/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Large" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: /High contrast/i }));
    expect(commit).toHaveBeenCalledWith({
      type: "settings-update",
      settings: { contrast: "high" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Preview welcome screen" }),
    );
    expect(onPreviewWelcome).toHaveBeenCalledWith({
      greeting: "Welcome back Ivan!",
      tagline: "It's a Wonderful World!",
      message: "",
    });
  });
});
