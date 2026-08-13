import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PenSettingsHud } from "./PenSettingsHud";

describe("PenSettingsHud", () => {
  it("turns finger drawing off without changing the pen style", () => {
    const onChange = vi.fn();
    render(
      <PenSettingsHud
        onChange={onChange}
        onDone={vi.fn()}
        settings={{
          color: "#171410",
          width: 8,
          opacity: 0.6,
          nib: "brush",
          fingerDrawing: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: /Draw with Finger.*On/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      color: "#171410",
      width: 8,
      opacity: 0.6,
      nib: "brush",
      fingerDrawing: false,
    }));
  });

  it("chooses a colour and adjusts pen thickness and opacity", () => {
    const onChange = vi.fn();
    render(
      <PenSettingsHud
        onChange={onChange}
        onDone={vi.fn()}
        settings={{ color: "#171410", width: 4.2, opacity: 1 }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Blue" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      color: "#245b8a",
      width: 4.2,
      opacity: 1,
    }));

    fireEvent.change(
      screen.getByRole("slider", { name: "Pen thickness" }),
      { target: { value: "20" } },
    );
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      color: "#171410",
      width: 20,
      opacity: 1,
    }));

    fireEvent.change(
      screen.getByRole("slider", { name: "Pen opacity" }),
      { target: { value: "60" } },
    );
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      color: "#171410",
      width: 4.2,
      opacity: 0.6,
    }));
  });

  it("uses the customised favourite palette", () => {
    const onChange = vi.fn();
    render(
      <PenSettingsHud
        onChange={onChange}
        onDone={vi.fn()}
        settings={{
          color: "#171410",
          width: 4.2,
          opacity: 1,
          favouriteColours: [
            "#171410", "#ffffff", "#426b3a", "#9b352f", "#6b4f82",
            "#76512f", "#c86f24", "#2f6f6d", "#a64b6b", "#686868",
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Blue" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ color: "#ffffff" }));
  });

  it("switches nib without changing shared thickness or opacity", () => {
    const onChange = vi.fn();
    render(
      <PenSettingsHud
        onChange={onChange}
        onDone={vi.fn()}
        settings={{ color: "#171410", width: 4.2, opacity: 1, nib: "pen" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Brush" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      nib: "brush",
      width: 4.2,
      opacity: 1,
    }));
  });

  it("shares the selected colour across every nib profile", () => {
    const onChange = vi.fn();
    render(
      <PenSettingsHud
        onChange={onChange}
        onDone={vi.fn()}
        settings={{
          color: "#245b8a",
          width: 4.2,
          opacity: 1,
          nib: "pen",
          profiles: {
            pen: { color: "#245b8a", width: 4.2, opacity: 1 },
            marker: { color: "#9b352f", width: 14, opacity: 0.45 },
            pencil: { color: "#426b3a", width: 5, opacity: 0.72 },
            brush: { color: "#76512f", width: 16, opacity: 0.55 },
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Brush" }));

    const next = onChange.mock.calls.at(-1)?.[0] as {
      profiles: Record<string, { color: string; width: number; opacity: number }>;
    };
    expect(next).toEqual(expect.objectContaining({
      nib: "brush",
      color: "#245b8a",
      width: 4.2,
      opacity: 1,
    }));
    expect(Object.values(next.profiles)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: "#245b8a" }),
      ]),
    );
    expect(Object.values(next.profiles).every((profile) =>
      profile.color === "#245b8a" && profile.width === 4.2 && profile.opacity === 1
    )).toBe(true);
  });

  it("offers a large-slider custom colour picker", () => {
    const onChange = vi.fn();
    render(
      <PenSettingsHud
        onChange={onChange}
        onDone={vi.fn()}
        settings={{ color: "#171410", width: 5, opacity: 1 }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Custom colour" }));
    expect(
      screen.getByRole("group", { name: "Custom colour picker" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("slider", { name: "Hue" }), {
      target: { value: "200" },
    });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0] as { color: string };
    expect(next.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("toggles the grid with a single switch", () => {
    const onGridChange = vi.fn();
    render(
      <PenSettingsHud
        grid={{ enabled: false, spacing: 60, rotationDegrees: 0 }}
        onChange={vi.fn()}
        onDone={vi.fn()}
        onGridChange={onGridChange}
        settings={{ color: "#171410", width: 8, opacity: 1 }}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: /Grid.*Off/i }));
    expect(onGridChange).toHaveBeenCalledWith({
      enabled: true,
      spacing: 60,
      rotationDegrees: 0,
    });
  });

  it("cycles grid size and rotation in 15 degree steps", () => {
    const onGridChange = vi.fn();
    render(
      <PenSettingsHud
        grid={{ enabled: true, spacing: 60, rotationDegrees: 0 }}
        onChange={vi.fn()}
        onDone={vi.fn()}
        onGridChange={onGridChange}
        settings={{ color: "#171410", width: 8, opacity: 1 }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Grid size: Medium" }));
    expect(onGridChange).toHaveBeenCalledWith({
      enabled: true,
      spacing: 96,
      rotationDegrees: 0,
    });
    fireEvent.click(screen.getByRole("button", { name: /Grid rotation: 0°/i }));
    expect(onGridChange).toHaveBeenCalledWith({
      enabled: true,
      spacing: 60,
      rotationDegrees: 15,
    });
  });

  it("resets grid rotation to straight on a long press", () => {
    vi.useFakeTimers();
    const onGridChange = vi.fn();
    render(
      <PenSettingsHud
        grid={{ enabled: true, spacing: 60, rotationDegrees: 45 }}
        onChange={vi.fn()}
        onDone={vi.fn()}
        onGridChange={onGridChange}
        settings={{ color: "#171410", width: 8, opacity: 1 }}
      />,
    );

    const rotation = screen.getByRole("button", { name: /Grid rotation: 45°/i });
    fireEvent.pointerDown(rotation);
    vi.advanceTimersByTime(600);
    fireEvent.pointerUp(rotation);
    expect(onGridChange).toHaveBeenCalledWith({
      enabled: true,
      spacing: 60,
      rotationDegrees: 0,
    });
    vi.useRealTimers();
  });
});
