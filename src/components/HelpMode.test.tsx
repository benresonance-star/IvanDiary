import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { HelpMode } from "./HelpMode";

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

function Harness({ onAction = vi.fn() }: { onAction?: () => void }) {
  const [active, setActive] = useState(false);
  return (
    <>
      <button data-help-topic="draw" onClick={onAction} type="button">
        <span>Draw</span>
      </button>
      <HelpMode active={active} onActiveChange={setActive} />
    </>
  );
}

function mockElementFromPoint(element: Element) {
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => element),
  });
}

describe("HelpMode", () => {
  it("explains an underlying control without activating it", () => {
    const onAction = vi.fn();
    render(<Harness onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn on help" }));

    const drawLabel = screen.getByText("Draw");
    mockElementFromPoint(drawLabel);
    fireEvent.pointerUp(document.querySelector(".help-mode-shield")!, {
      clientX: 400,
      clientY: 120,
    });

    expect(screen.getByText("Draw", { selector: ".help-tip-card strong" }))
      .toBeInTheDocument();
    expect(
      screen.getByText(/Draw with your selected pen/),
    ).toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("exits with Escape and restores the inactive help control", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Turn on help" }));
    expect(screen.getByRole("button", { name: "Finish help" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByRole("button", { name: "Turn on help" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it.each([
    [1024, 768],
    [768, 1024],
  ])(
    "clamps a tip inside a %sx%s iPad viewport",
    (viewportWidth, viewportHeight) => {
    Object.defineProperty(globalThis, "innerWidth", {
      configurable: true,
      value: viewportWidth,
    });
    Object.defineProperty(globalThis, "innerHeight", {
      configurable: true,
      value: viewportHeight,
    });
    render(<Harness />);
    const drawButton = screen.getByRole("button", { name: "Draw" });
    const targetBounds = rect(
      viewportWidth - 84,
      viewportHeight - 68,
      60,
      52,
    );
    vi.spyOn(drawButton, "getBoundingClientRect").mockReturnValue(
      targetBounds,
    );
    mockElementFromPoint(drawButton);
    const boundsSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getBounds(this: HTMLElement) {
        if (this.classList.contains("help-tip-card")) {
          return rect(0, 0, 440, 160);
        }
        if (this === drawButton) {
          return targetBounds;
        }
        return rect(0, 0, 0, 0);
      });

    fireEvent.click(screen.getByRole("button", { name: "Turn on help" }));
    fireEvent.pointerUp(document.querySelector(".help-mode-shield")!, {
      clientX: viewportWidth - 54,
      clientY: viewportHeight - 42,
    });

    const tip = document.querySelector<HTMLElement>(".help-tip-card")!;
    expect(Number.parseFloat(tip.style.left)).toBeLessThanOrEqual(
      viewportWidth - 440 - 16,
    );
    expect(Number.parseFloat(tip.style.top)).toBeLessThanOrEqual(
      viewportHeight - 160 - 16,
    );
    boundsSpy.mockRestore();
    },
  );
});
