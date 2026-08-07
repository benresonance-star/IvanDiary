import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PenSettingsHud } from "./PenSettingsHud";

describe("PenSettingsHud", () => {
  it("chooses a colour and adjusts pen thickness and opacity", () => {
    const onChange = vi.fn();
    render(
      <PenSettingsHud
        onChange={onChange}
        onDone={vi.fn()}
        settings={{ color: "#171410", width: 4.2, opacity: 1 }}
        simpleMode
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Blue" }));
    expect(onChange).toHaveBeenCalledWith({
      color: "#245b8a",
      width: 4.2,
      opacity: 1,
    });

    fireEvent.change(
      screen.getByRole("slider", { name: "Pen thickness" }),
      { target: { value: "20" } },
    );
    expect(onChange).toHaveBeenCalledWith({
      color: "#171410",
      width: 20,
      opacity: 1,
    });

    fireEvent.change(
      screen.getByRole("slider", { name: "Pen opacity" }),
      { target: { value: "60" } },
    );
    expect(onChange).toHaveBeenCalledWith({
      color: "#171410",
      width: 4.2,
      opacity: 0.6,
    });
  });

  it("offers a large-slider custom colour picker", () => {
    const onChange = vi.fn();
    render(
      <PenSettingsHud
        onChange={onChange}
        onDone={vi.fn()}
        settings={{ color: "#171410", width: 5, opacity: 1 }}
        simpleMode
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

  it("offers large named width presets in simple mode", () => {
    const onChange = vi.fn();
    render(
      <PenSettingsHud
        onChange={onChange}
        onDone={vi.fn()}
        settings={{ color: "#171410", width: 8, opacity: 1 }}
        simpleMode
      />,
    );

    expect(
      screen.getByRole("button", { name: "Medium" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Thick" }));
    expect(onChange).toHaveBeenCalledWith({
      color: "#171410",
      width: 18,
      opacity: 1,
    });
  });
});
