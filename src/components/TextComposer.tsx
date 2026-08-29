import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MutableRefObject,
} from "react";
import { flushSync } from "react-dom";
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
  const voiceEditorRef = useRef<HTMLTextAreaElement>(null);
  const keyboardEditorRef = useRef<HTMLTextAreaElement>(null);
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

  const updateText = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ ...draft, text: event.target.value });
    rememberSelection({
      start: event.currentTarget.selectionStart,
      end: event.currentTarget.selectionEnd,
    });
  };

  const selectVoice = () => {
    keyboardEditorRef.current?.blur();
    setInput("voice");
  };

  const selectKeyboard = () => {
    // Commit the editor swap during the completed tap so WKWebView focuses a
    // visible inputmode="text" element while the user gesture is still active.
    // Keeping a separate element avoids reusing the input session previously
    // created for the voice editor's inputmode="none".
    flushSync(() => setInput("keyboard"));
    const editor = keyboardEditorRef.current;
    if (!editor) return;
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
          <div aria-label="Text input method" className={`text-input-toggle ${input === "keyboard" ? "keyboard-selected" : "voice-selected"}`} role="radiogroup">
            <button
              aria-checked={input === "voice"}
              className={input === "voice" ? "selected" : ""}
              onClick={selectVoice}
              role="radio"
              type="button"
            >
              <Mic aria-hidden="true" />Voice
            </button>
            <button
              aria-checked={input === "keyboard"}
              className={input === "keyboard" ? "selected" : ""}
              onClick={selectKeyboard}
              role="radio"
              type="button"
            >
              <Keyboard aria-hidden="true" />Keyboard
            </button>
          </div>
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
        <div className="text-composer-editors">
          <textarea
            aria-hidden={input !== "voice"}
            aria-label={input === "voice" ? "Text for the page" : undefined}
            className="text-composer-editor"
            hidden={input !== "voice"}
            inputMode="none"
            onClick={(event) => {
              event.currentTarget.focus({ preventScroll: true });
            }}
            onChange={updateText}
            onSelect={(event) => rememberSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })}
            placeholder="Your words will appear here…"
            ref={voiceEditorRef}
            style={{ fontSize: `${draft.textScale}em`, textAlign: draft.textAlign }}
            value={draft.text}
          />
          <textarea
            aria-hidden={input !== "keyboard"}
            aria-label={input === "keyboard" ? "Text for the page" : undefined}
            className="text-composer-editor"
            hidden={input !== "keyboard"}
            inputMode="text"
            onChange={updateText}
            onSelect={(event) => rememberSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })}
            placeholder="Your words will appear here…"
            ref={keyboardEditorRef}
            style={{ fontSize: `${draft.textScale}em`, textAlign: draft.textAlign }}
            value={draft.text}
          />
        </div>
      </section>
    </div>
  );
}
