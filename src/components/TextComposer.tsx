import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Keyboard, Mic } from "lucide-react";

import type { TextSelection } from "./textInsertion";

export type TextDraft = {
  text: string;
  textScale: number;
  textAlign: "left" | "center";
};

export function TextComposer({
  draft,
  recording,
  status,
  onCancel,
  onChange,
  onSubmit,
  onToggleVoice,
  selectionRef,
}: {
  draft: TextDraft;
  recording: boolean;
  status?: string;
  onCancel: () => void;
  onChange: (draft: TextDraft) => void;
  onSubmit: () => void;
  onToggleVoice: () => void;
  selectionRef: MutableRefObject<TextSelection>;
}) {
  const [input, setInput] = useState<"voice" | "keyboard">("voice");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [visibleViewport, setVisibleViewport] = useState<{
    height: number;
    offsetTop: number;
  }>();

  useEffect(() => {
    const viewport = globalThis.visualViewport;
    if (!viewport) return;
    const updateVisibleViewport = () => {
      setVisibleViewport({
        height: viewport.height,
        offsetTop: viewport.offsetTop,
      });
    };
    updateVisibleViewport();
    viewport.addEventListener("resize", updateVisibleViewport);
    viewport.addEventListener("scroll", updateVisibleViewport);
    return () => {
      viewport.removeEventListener("resize", updateVisibleViewport);
      viewport.removeEventListener("scroll", updateVisibleViewport);
    };
  }, []);

  const rememberSelection = (next: TextSelection) => {
    selectionRef.current = next;
  };

  const selectKeyboard = () => {
    setInput("keyboard");
    const editor = textareaRef.current;
    if (!editor) return;
    // WKWebView caches the input view when an element becomes first responder.
    // Re-enter focus after changing inputmode so a voice-mode focus cannot leave
    // the compact input assistant attached instead of the text keyboard.
    editor.blur();
    editor.setAttribute("inputmode", "text");
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(
      selectionRef.current.start,
      selectionRef.current.end,
    );
  };

  return (
    <div
      aria-labelledby="text-composer-title"
      aria-modal="true"
      className="text-composer-backdrop"
      role="dialog"
      style={visibleViewport ? {
        height: `${visibleViewport.height}px`,
        top: `${visibleViewport.offsetTop}px`,
      } : undefined}
    >
      <section className="text-composer">
        <header>
          <div>
            <h2 id="text-composer-title">Add text</h2>
          </div>
          <button className="secondary-action" disabled={recording} onClick={onCancel} type="button">Cancel</button>
        </header>
        <div className="text-input-row">
          <fieldset aria-label="Text input method" className={`text-input-toggle ${input === "keyboard" ? "keyboard-selected" : "voice-selected"}`}>
            <legend className="visually-hidden">Text input method</legend>
            <label className={input === "voice" ? "selected" : ""}>
              <input checked={input === "voice"} name="text-input-method" onChange={() => { setInput("voice"); textareaRef.current?.blur(); }} type="radio" value="voice" />
              <Mic aria-hidden="true" />Voice
            </label>
            <label
              className={input === "keyboard" ? "selected" : ""}
              onPointerDown={(event) => {
                // Keep keyboard activation inside the original trusted tap and
                // prevent the hidden radio from taking focus back from the editor.
                event.preventDefault();
                selectKeyboard();
              }}
            >
              <input checked={input === "keyboard"} name="text-input-method" onChange={selectKeyboard} type="radio" value="keyboard" />
              <Keyboard aria-hidden="true" />Keyboard
            </label>
          </fieldset>
          {input === "voice" ? (
            <button
              aria-pressed={recording}
              className={`text-dictation-button${recording ? " recording" : " ready"}`}
              onClick={onToggleVoice}
              onPointerDown={(event) => {
                // Keep the textarea focused so its caret remains visible while
                // dictation begins at the selected insertion point.
                event.preventDefault();
              }}
              type="button"
            >
              <Mic aria-hidden="true" />
              {recording ? "Stop and turn voice into text" : "Tap to begin speaking"}
            </button>
          ) : null}
          <button className="large-action text-add-action" disabled={!draft.text.trim() || recording} onClick={onSubmit} type="button">Add to canvas</button>
        </div>
        <p aria-live="polite" className="text-composer-status" role="status">{status ?? (input === "voice" ? "Ready to listen" : "Keyboard ready")}</p>
        <textarea
          aria-label="Text for the page"
          className="text-composer-editor"
          inputMode={input === "voice" ? "none" : "text"}
          onClick={(event) => {
            event.currentTarget.focus({ preventScroll: true });
          }}
          onChange={(event) => {
            onChange({ ...draft, text: event.target.value });
            rememberSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd });
          }}
          onSelect={(event) => rememberSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })}
          placeholder="Your words will appear here…"
          ref={textareaRef}
          style={{ fontSize: `${draft.textScale}em`, textAlign: draft.textAlign }}
          value={draft.text}
        />
      </section>
    </div>
  );
}
