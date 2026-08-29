import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WelcomeScreen } from "./WelcomeScreen";
import type { SaveHealth } from "../domain/models";
import type { SketchDocument, SketchRepository } from "../sketch/types";

const COPY = {
  greeting: "Welcome back Ivan!",
  tagline: "It's a Wonderful World!",
  message: "This is the day the Lord has made.",
};

const sketchRepository: SketchRepository = {
  load: vi.fn(async (documentId: string): Promise<SketchDocument> => ({
    schemaVersion: 1,
    id: documentId,
    size: { width: 1200, height: 820 },
    strokes: [],
    revision: 0,
  })),
  save: vi.fn(async (): Promise<SaveHealth> => ({
    localDurability: "saved",
    remoteSync: "offline",
    durableRevision: 1,
    pendingOperationCount: 1,
  })),
};

const drawingProps = {
  penColor: "#171410",
  penOpacity: 1,
  penWidth: 4.2,
  sketchRepository,
};

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("WelcomeScreen", () => {
  it("shows all saved welcome text and dismisses when tapped", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <WelcomeScreen
        copy={COPY}
        {...drawingProps}
        onDismiss={onDismiss}
        reducedMotion={false}
      />,
    );

    expect(screen.queryByRole("toolbar", { name: "Welcome drawing tools" })).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Welcome back Ivan.*Open diary/i }),
    );
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(350));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("stays open until Ivan taps it", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <WelcomeScreen
        copy={COPY}
        {...drawingProps}
        onDismiss={onDismiss}
        reducedMotion={false}
      />,
    );

    act(() => vi.advanceTimersByTime(3000));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("offers drawing tools and a return action in Settings preview", () => {
    const onReturnToSettings = vi.fn();
    render(
      <WelcomeScreen
        copy={COPY}
        {...drawingProps}
        editing
        onDismiss={vi.fn()}
        onReturnToSettings={onReturnToSettings}
        reducedMotion={false}
      />,
    );

    expect(screen.getByRole("toolbar", { name: "Welcome drawing tools" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    expect(screen.getByRole("dialog", { name: "Draw settings" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Erase" }));
    expect(screen.getByRole("button", { name: "Erase" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Return to Settings" }));
    expect(onReturnToSettings).toHaveBeenCalledOnce();
  });
});
