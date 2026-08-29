import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShareChooser } from "./ShareChooser";

function ChooserHarness({
  hasRecordings = false,
  onSharePdf = vi.fn(),
  onSharePicture = vi.fn(),
}: {
  hasRecordings?: boolean;
  onSharePdf?: () => void;
  onSharePicture?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Share this page
      </button>
      {open ? (
        <ShareChooser
          hasRecordings={hasRecordings}
          onCancel={() => setOpen(false)}
          onSharePdf={onSharePdf}
          onSharePicture={onSharePicture}
        />
      ) : null}
    </>
  );
}

describe("ShareChooser", () => {
  it("opens a labelled dialog and focuses the picture action", () => {
    render(<ChooserHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Share this page" }));
    const dialog = screen.getByRole("dialog", { name: "Share this page" });
    expect(dialog).toHaveTextContent("Send a picture or a PDF in Messages or Mail.");
    expect(
      screen.getByRole("button", {
        name: "Send this page as a picture in Messages or Mail",
      }),
    ).toHaveFocus();
  });

  it("mentions voice recordings when the page has them", () => {
    render(<ChooserHarness hasRecordings />);
    fireEvent.click(screen.getByRole("button", { name: "Share this page" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Voice recordings will be sent too, so they can be played.",
    );
  });

  it("closes on Escape and restores focus to Share", () => {
    render(<ChooserHarness />);
    const trigger = screen.getByRole("button", { name: "Share this page" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("sends picture and PDF choices", () => {
    const onSharePdf = vi.fn();
    const onSharePicture = vi.fn();
    render(
      <ChooserHarness
        onSharePdf={onSharePdf}
        onSharePicture={onSharePicture}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Share this page" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Send this page as a picture in Messages or Mail",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Send this page as a PDF document in Messages or Mail",
      }),
    );
    expect(onSharePicture).toHaveBeenCalledOnce();
    expect(onSharePdf).toHaveBeenCalledOnce();
  });
});
