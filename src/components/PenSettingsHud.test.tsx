import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PenSettingsHud } from "./PenSettingsHud";

describe("PenSettingsHud", () => {
  it("chooses a colour and adjusts pen thickness", () => {
    const onChange = vi.fn();
    render(
      <PenSettingsHud
        onChange={onChange}
        onDone={vi.fn()}
        settings={{ color: "#171410", width: 4.2 }}
        simpleMode
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Blue" }));
    expect(onChange).toHaveBeenCalledWith({
      color: "#245b8a",
      width: 4.2,
    });

    fireEvent.change(
      screen.getByRole("slider", { name: "Pen thickness" }),
      { target: { value: "8" } },
    );
    expect(onChange).toHaveBeenCalledWith({
      color: "#171410",
      width: 8,
    });
  });

  it("offers large named width presets in simple mode", () => {
    const onChange = vi.fn();
    render(
      <PenSettingsHud
        onChange={onChange}
        onDone={vi.fn()}
        settings={{ color: "#171410", width: 5 }}
        simpleMode
      />,
    );

    expect(
      screen.getByRole("button", { name: "Medium" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Thick" }));
    expect(onChange).toHaveBeenCalledWith({
      color: "#171410",
      width: 9,
    });
  });
});
