import { ArrowDown, ArrowUp, Pencil, Trash2, X } from "lucide-react";

import type {
  MyStoryLink,
  MyStoryPhoto,
  MyStoryTextBlock,
  MyStoryTextRole,
} from "../domain/models";

export type MyStorySelection =
  | { kind: "pane" }
  | { kind: "text"; block: MyStoryTextBlock; index: number; count: number }
  | { kind: "photo"; photo: MyStoryPhoto; index: number; count: number }
  | { kind: "link"; link: MyStoryLink; index: number; count: number };

export function MyStoryInspector({
  onClose,
  onDelete,
  onEditLink,
  onEditText,
  onMove,
  onPhotoWidthChange,
  onTextBackgroundChange,
  onTextColorChange,
  onTextRoleChange,
  selection,
  textBackgroundColor,
  textColor,
}: {
  onClose: () => void;
  onDelete: () => void;
  onEditLink: () => void;
  onEditText: () => void;
  onMove: (direction: -1 | 1) => void;
  onPhotoWidthChange: (width: MyStoryPhoto["width"]) => void;
  onTextBackgroundChange: (color: string) => void;
  onTextColorChange: (color: string) => void;
  onTextRoleChange: (role: MyStoryTextRole) => void;
  selection: MyStorySelection;
  textBackgroundColor: string;
  textColor: string;
}) {
  return (
    <aside
      aria-label="My Story options"
      className="my-story-inspector"
    >
      <header>
        <strong>
          {selection.kind === "pane"
            ? "Text background"
            : selection.kind === "text"
              ? "Text style"
              : selection.kind === "photo"
                ? "Image size"
                : "Web link"}
        </strong>
        <button aria-label="Close options" onClick={onClose} type="button">
          <X aria-hidden="true" />
        </button>
      </header>

      {selection.kind === "pane" ? (
        <label className="story-colour-control">
          <span>Background colour</span>
          <input
            aria-label="Text side background colour"
            onChange={(event) =>
              onTextBackgroundChange(event.currentTarget.value)
            }
            type="color"
            value={textBackgroundColor}
          />
        </label>
      ) : null}

      {selection.kind === "text" ? (
        <>
          <button onClick={onEditText} type="button">
            <Pencil aria-hidden="true" />
            Edit text
          </button>
          <div
            aria-label="Text size"
            className="story-segmented-control"
            role="radiogroup"
          >
            {([
              ["title", "Title"],
              ["heading", "Heading"],
              ["body", "Main text"],
            ] as const).map(([role, label]) => (
              <button
                aria-checked={selection.block.role === role}
                className={selection.block.role === role ? "selected" : ""}
                key={role}
                onClick={() => onTextRoleChange(role)}
                role="radio"
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <label className="story-colour-control">
            <span>Text colour</span>
            <input
              aria-label="Text colour"
              onChange={(event) => onTextColorChange(event.currentTarget.value)}
              type="color"
              value={textColor}
            />
          </label>
        </>
      ) : null}

      {selection.kind === "photo" ? (
        <div
          aria-label="Image width"
          className="story-segmented-control"
          role="radiogroup"
        >
          {([
            [0.5, "Small"],
            [0.75, "Medium"],
            [1, "Large"],
          ] as const).map(([width, label]) => (
            <button
              aria-checked={selection.photo.width === width}
              className={selection.photo.width === width ? "selected" : ""}
              key={width}
              onClick={() => onPhotoWidthChange(width)}
              role="radio"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {selection.kind === "link" ? (
        <button onClick={onEditLink} type="button">
          <Pencil aria-hidden="true" />
          Edit link
        </button>
      ) : null}

      {selection.kind !== "pane" ? (
        <div className="my-story-inspector-actions">
          <button
            aria-label="Move earlier"
            disabled={selection.index === 0}
            onClick={() => onMove(-1)}
            type="button"
          >
            <ArrowUp aria-hidden="true" />
            Earlier
          </button>
          <button
            aria-label="Move later"
            disabled={selection.index === selection.count - 1}
            onClick={() => onMove(1)}
            type="button"
          >
            <ArrowDown aria-hidden="true" />
            Later
          </button>
          <button
            className="story-delete-control"
            onClick={onDelete}
            type="button"
          >
            <Trash2 aria-hidden="true" />
            Delete
          </button>
        </div>
      ) : null}
    </aside>
  );
}
