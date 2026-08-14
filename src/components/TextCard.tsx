import { useState } from "react";

import type { TextObject } from "../domain/models";

export function TextCard({
  object,
  readOnly,
  onSave,
}: {
  object: TextObject;
  readOnly: boolean;
  onSave: (next: TextObject) => void;
}) {
  const [text, setText] = useState(object.text);

  return (
    <textarea
      aria-label="Journal text"
      autoFocus={object.text.length === 0}
      className="page-text-card"
      onBlur={() => {
        if (text !== object.text) {
          onSave({ ...object, text, revision: object.revision + 1 });
        }
      }}
      onChange={(event) => setText(event.target.value)}
      placeholder="Write here, or use Apple dictation…"
      readOnly={readOnly}
      style={{ textAlign: object.textAlign ?? "left" }}
      value={text}
    />
  );
}
