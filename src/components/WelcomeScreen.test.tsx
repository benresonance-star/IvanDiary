import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WelcomeScreen } from "./WelcomeScreen";

const COPY = {
  greeting: "Welcome back Ivan!",
  tagline: "It's a Wonderful World!",
  message: "This is the day the Lord has made.",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("WelcomeScreen", () => {
  it("shows all saved welcome text and dismisses when tapped", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <WelcomeScreen
        copy={COPY}
        onDismiss={onDismiss}
        reducedMotion={false}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Welcome back Ivan/i }),
    );
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(350));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("automatically closes after three seconds", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <WelcomeScreen
        copy={COPY}
        onDismiss={onDismiss}
        reducedMotion={false}
      />,
    );

    act(() => vi.advanceTimersByTime(3000));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
