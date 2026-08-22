import { useEffect, useRef, useState } from "react";

import type { TextObject } from "../domain/models";

export function TextCard({
  object,
  readOnly,
  onEdit,
  onSave,
}: {
  object: TextObject;
  readOnly: boolean;
  onEdit?: () => void;
  onSave: (next: TextObject) => void;
}) {
  const [text, setText] = useState(object.text);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!readOnly && object.text.length === 0) {
      editorRef.current?.focus({ preventScroll: true });
    }
  }, [object.text.length, readOnly]);

  if (onEdit && !readOnly) {
    return (
      <button
        aria-label="Edit journal text"
        className="page-text-card native-text-edit-trigger"
        onClick={onEdit}
        style={{ textAlign: object.textAlign ?? "left" }}
        type="button"
      >
        {object.text}
      </button>
    );
  }

  return (
    <textarea
      aria-label="Journal text"
      className="page-text-card"
      onBlur={() => {
        if (text !== object.text) {
          onSave({ ...object, text, revision: object.revision + 1 });
        }
      }}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (!readOnly) event.stopPropagation();
      }}
      placeholder="Write here, or use Apple dictation…"
      readOnly={readOnly}
      ref={editorRef}
      style={{ textAlign: object.textAlign ?? "left" }}
      value={text}
    />
  );
}
