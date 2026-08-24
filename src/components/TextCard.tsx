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
  const role = object.role ?? "body";
  const className = `page-text-card canvas-text-${role} canvas-font-${object.font ?? "system-sans"}`;
  const style = {
    backgroundColor: object.backgroundColor ?? "transparent",
    border: object.outlineColor
      ? `${object.outlineWidth ?? 2}px solid ${object.outlineColor}`
      : "none",
    color: object.color ?? "#201c17",
    overflowWrap: "anywhere",
    textAlign: object.textAlign ?? "left",
    whiteSpace: "pre-wrap",
  } as const;

  if (readOnly) {
    switch (role) {
      case "title":
        return <h1 className={className} style={style}>{object.text}</h1>;
      case "heading":
        return <h2 className={className} style={style}>{object.text}</h2>;
      case "body":
        return <p className={className} style={style}>{object.text}</p>;
      default: {
        const exhaustiveRole: never = role;
        throw new Error(`Unsupported canvas text role: ${exhaustiveRole}`);
      }
    }
  }

  if (onEdit) {
    return (
      <button
        aria-label="Edit journal text"
        className={`${className} native-text-edit-trigger`}
        onClick={onEdit}
        style={style}
        type="button"
      >
        {object.text}
      </button>
    );
  }

  return (
    <textarea
      aria-label="Journal text"
      className={className}
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
      style={style}
      value={text}
    />
  );
}
