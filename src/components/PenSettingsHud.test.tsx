import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PenSettingsHud } from "./PenSettingsHud";

describe("PenSettingsHud", () => {
  it("orders the drawing sections as Pens, Shapes, Grids", () => {
    render(
      <PenSettingsHud
        grid={{ enabled: false, snapToGrid: false, spacing: 60, rotationDegrees: 0, type: "lines", color: "#435b70" }}
        onChange={vi.fn()}
        onDone={vi.fn()}
        onGridChange={vi.fn()}
        onShapeSelect={vi.fn()}
        settings={{ color: "#171410", width: 4.2, opacity: 1 }}
      />,
    );

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Pens",
      "Shapes",
      "Grids",
    ]);
  });

  it("shows Pens and Shapes in Story without exposing an unavailable Grids panel", () => {
    render(
      <PenSettingsHud
        onChange={vi.fn()}
        onDone={vi.fn()}
        onShapeSelect={vi.fn()}
        settings={{ color: "#171410", width: 4.2, opacity: 1 }}
      />,
    );

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Pens",
      "Shapes",
    ]);
    expect(screen.getByRole("tabpanel", { name: "Pens" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Shapes" }));
    expect(screen.getByRole("tabpanel", { name: "Shapes" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Pens" }));
    expect(screen.getByRole("switch", { name: "Draw with finger" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Grids" })).not.toBeInTheDocument();
  });

  it("keeps finger erasing off by default and changes it independently", () => {
    const onChange = vi.fn();
    render(
      <PenSettingsHud
        onChange={onChange}
        onDone={vi.fn()}
        settings={{
          color: "#171410",
          width: 8,
          opacity: 0.6,
          fingerDrawing: true,
        }}
        tool="eraser"
      />,
    );

    const toggle = screen.getByRole("switch", { name: "Erase with finger" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("switch", { name: "Draw with finger" }))
      .not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      fingerDrawing: true,
      fingerErasing: true,
    }));
  });

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

    fireEvent.click(screen.getByRole("switch", { name: "Draw with finger" }));

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

  it("identifies the selected nib style in the preview", () => {
    render(
      <PenSettingsHud
        onChange={vi.fn()}
        onDone={vi.fn()}
        settings={{ color: "#171410", width: 12, opacity: 1, nib: "brush" }}
      />,
    );

    expect(screen.getByLabelText("Brush preview")).toHaveClass(
      "nib-brush",
    );
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

  it("uses the system colour selector for a custom pen colour", () => {
    const onChange = vi.fn();
    render(
      <PenSettingsHud
        onChange={onChange}
        onDone={vi.fn()}
        settings={{ color: "#171410", width: 5, opacity: 1 }}
      />,
    );

    const customColour = screen.getByLabelText("Custom colour");
    expect(customColour).toHaveAttribute("type", "color");
    fireEvent.change(customColour, {
      target: { value: "#2a7f6f" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ color: "#2a7f6f" }),
    );
  });

  it("toggles the grid with a single switch", () => {
    const onGridChange = vi.fn();
    render(
      <PenSettingsHud
        grid={{
          enabled: false,
          snapToGrid: true,
          spacing: 60,
          rotationDegrees: 0,
          type: "lines",
          color: "#435b70",
        }}
        onChange={vi.fn()}
        onDone={vi.fn()}
        onGridChange={onGridChange}
        settings={{ color: "#171410", width: 8, opacity: 1 }}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Grids" }));
    fireEvent.click(screen.getByRole("switch", { name: /Drawing grid.*Off/i }));
    expect(onGridChange).toHaveBeenCalledWith({
      enabled: true,
      snapToGrid: true,
      spacing: 60,
      rotationDegrees: 0,
      type: "lines",
      color: "#435b70",
    });
  });

  it("toggles whether the pen snaps to the visible grid", () => {
    const onGridChange = vi.fn();
    render(
      <PenSettingsHud
        grid={{
          enabled: true,
          snapToGrid: true,
          spacing: 60,
          rotationDegrees: 0,
          type: "lines",
          color: "#435b70",
        }}
        onChange={vi.fn()}
        onDone={vi.fn()}
        onGridChange={onGridChange}
        settings={{ color: "#171410", width: 8, opacity: 1 }}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Grids" }));
    fireEvent.click(
      screen.getByRole("switch", { name: /Snap pen to grid.*On/i }),
    );
    expect(onGridChange).toHaveBeenCalledWith({
      enabled: true,
      snapToGrid: false,
      spacing: 60,
      rotationDegrees: 0,
      type: "lines",
      color: "#435b70",
    });
  });

  it("hides finger drawing in Grid without changing its setting", () => {
    const onChange = vi.fn();
    render(
      <PenSettingsHud
        grid={{
          enabled: true,
          snapToGrid: true,
          spacing: 60,
          rotationDegrees: 0,
          type: "lines",
          color: "#435b70",
        }}
        onChange={onChange}
        onDone={vi.fn()}
        onGridChange={vi.fn()}
        settings={{
          color: "#171410",
          width: 8,
          opacity: 1,
          fingerDrawing: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Grids" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("switch", { name: "Draw with finger" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Pens" }));
    expect(
      screen.getByRole("switch", { name: "Draw with finger" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("selects grid size, type, colour, and rotation directly", () => {
    const onGridChange = vi.fn();
    render(
      <PenSettingsHud
        grid={{
          enabled: true,
          snapToGrid: true,
          spacing: 60,
          rotationDegrees: 0,
          type: "lines",
          color: "#435b70",
        }}
        onChange={vi.fn()}
        onDone={vi.fn()}
        onGridChange={onGridChange}
        settings={{ color: "#171410", width: 8, opacity: 1 }}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Grids" }));
    fireEvent.click(screen.getByRole("button", { name: "Large" }));
    expect(onGridChange).toHaveBeenCalledWith({
      enabled: true,
      snapToGrid: true,
      spacing: 96,
      rotationDegrees: 0,
      type: "lines",
      color: "#435b70",
    });
    fireEvent.click(screen.getByRole("button", { name: "Dots" }));
    expect(onGridChange).toHaveBeenCalledWith({
      enabled: true,
      snapToGrid: true,
      spacing: 60,
      rotationDegrees: 0,
      type: "dots",
      color: "#435b70",
    });
    fireEvent.change(screen.getByLabelText("Grid colour"), {
      target: { value: "#884422" },
    });
    expect(onGridChange).toHaveBeenCalledWith(
      expect.objectContaining({ color: "#884422" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "45°" }));
    expect(onGridChange).toHaveBeenCalledWith(
      expect.objectContaining({ rotationDegrees: 45 }),
    );
  });

  it("offers direct rotation toggle values including straight", () => {
    const onGridChange = vi.fn();
    render(
      <PenSettingsHud
        grid={{
          enabled: true,
          snapToGrid: true,
          spacing: 60,
          rotationDegrees: 45,
          type: "dots",
          color: "#435b70",
        }}
        onChange={vi.fn()}
        onDone={vi.fn()}
        onGridChange={onGridChange}
        settings={{ color: "#171410", width: 8, opacity: 1 }}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Grids" }));
    expect(
      screen.getByRole("group", { name: "Grid rotation" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "0°" }));
    expect(onGridChange).toHaveBeenCalledWith({
      enabled: true,
      snapToGrid: true,
      spacing: 60,
      rotationDegrees: 0,
      type: "dots",
      color: "#435b70",
    });
  });
});
