import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TextComposer } from "./JournalPage";
import { insertSpokenText } from "./textInsertion";

const emptyDraft = { text: "", textScale: 2.5, textAlign: "left" as const };

describe("TextComposer", () => {
  it("opens voice-first and prevents empty text from being added", () => {
    render(
      <TextComposer
        draft={emptyDraft}
        recording={false}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onToggleVoice={vi.fn()}
        selectionRef={{ current: { start: 0, end: 0 } }}
      />,
    );

    expect(screen.getByRole("radio", { name: "Voice" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Tap to begin speaking" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to canvas" })).toBeDisabled();
  });

  it("edits text using the single large, left-aligned style", () => {
    const onChange = vi.fn();
    render(
      <TextComposer
        draft={{ ...emptyDraft, text: "A clear memory" }}
        recording={false}
        onCancel={vi.fn()}
        onChange={onChange}
        onSubmit={vi.fn()}
        onToggleVoice={vi.fn()}
        selectionRef={{ current: { start: 0, end: 0 } }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Text for the page"), { target: { value: "A changed memory" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ text: "A changed memory" }));
    expect(screen.queryByRole("button", { name: "Large" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Centre" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Text for the page")).toHaveStyle({ fontSize: "2.5em", textAlign: "left" });
  });

  it("focuses the editor directly when Keyboard is selected", () => {
    render(
      <TextComposer
        draft={emptyDraft}
        recording={false}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onToggleVoice={vi.fn()}
        selectionRef={{ current: { start: 0, end: 0 } }}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Keyboard" }));
    expect(screen.getByLabelText("Text for the page")).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Keyboard" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Add to canvas" })).toBeVisible();
  });

  it("restarts editor focus when switching from the voice input view", () => {
    render(
      <TextComposer
        draft={{ ...emptyDraft, text: "A remembered day" }}
        recording={false}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onToggleVoice={vi.fn()}
        selectionRef={{ current: { start: 3, end: 3 } }}
      />,
    );

    const editor = screen.getByLabelText(
      "Text for the page",
    ) as HTMLTextAreaElement;
    editor.focus();
    const blur = vi.spyOn(editor, "blur");
    const focus = vi.spyOn(editor, "focus");

    fireEvent.click(screen.getByRole("radio", { name: "Keyboard" }));

    expect(blur).toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(blur.mock.invocationCallOrder[0]!).toBeLessThan(
      focus.mock.invocationCallOrder[0]!,
    );
    expect(editor).toHaveAttribute("inputmode", "text");
    expect(editor).toHaveFocus();
    expect(editor.selectionStart).toBe(3);
  });

  it("keeps voice mode and shows the caret when the text canvas is tapped", () => {
    render(
      <TextComposer
        draft={{ ...emptyDraft, text: "Words to correct" }}
        recording={false}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onToggleVoice={vi.fn()}
        selectionRef={{ current: { start: 0, end: 0 } }}
      />,
    );

    fireEvent.click(screen.getByLabelText("Text for the page"));
    expect(screen.getByLabelText("Text for the page")).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Voice" })).toBeChecked();
    expect(screen.getByLabelText("Text for the page")).toHaveAttribute("inputmode", "none");
  });

  it("does not move focus away from the voice insertion caret", () => {
    render(
      <TextComposer
        draft={{ ...emptyDraft, text: "A remembered day" }}
        recording={false}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onToggleVoice={vi.fn()}
        selectionRef={{ current: { start: 2, end: 2 } }}
      />,
    );

    const editor = screen.getByLabelText("Text for the page");
    fireEvent.click(editor);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Tap to begin speaking" }));
    expect(editor).toHaveFocus();
  });

  it("keeps the composer open while recording", () => {
    render(
      <TextComposer
        draft={{ ...emptyDraft, text: "Draft" }}
        recording
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onToggleVoice={vi.fn()}
        selectionRef={{ current: { start: 0, end: 0 } }}
      />,
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add to canvas" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop and turn voice into text" })).toBeInTheDocument();
  });

  it("inserts spoken words at the cursor or replaces the selection", () => {
    expect(insertSpokenText("Today was lovely.", "very", { start: 10, end: 10 })).toEqual({
      text: "Today was very lovely.",
      cursor: 15,
    });
    expect(insertSpokenText("Today was difficult.", "wonderful", { start: 10, end: 19 })).toEqual({
      text: "Today was wonderful.",
      cursor: 19,
    });
  });
});
