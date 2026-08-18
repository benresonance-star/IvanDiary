import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

export function LinkComposer({
  initialTitle = "",
  initialUrl = "",
  onClose,
  onSave,
}: {
  initialTitle?: string;
  initialUrl?: string;
  onClose: () => void;
  onSave: (url: string, title: string) => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [title, setTitle] = useState(initialTitle);
  const [error, setError] = useState<string>();
  const urlInputRef = useRef<HTMLInputElement>(null);
  const editing = initialUrl.length > 0;

  useEffect(() => {
    urlInputRef.current?.focus({ preventScroll: true });
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("Unsupported protocol");
      }
      onSave(parsed.toString(), title.trim() || parsed.hostname);
    } catch {
      setError("Enter a complete web address, such as https://example.com");
    }
  };

  return createPortal(
    // The backdrop is pointer-only; the dialog includes a keyboard-accessible
    // Cancel button and focus remains inside the dialog form.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="link-composer-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        aria-labelledby="link-composer-title"
        aria-modal="true"
        className="link-composer"
        onSubmit={submit}
        role="dialog"
      >
        <h2 id="link-composer-title">
          {editing ? "Edit web link" : "Add a web link"}
        </h2>
        <label>
          Web address
          <input
            inputMode="url"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://"
            ref={urlInputRef}
            value={url}
          />
        </label>
        <label>
          Name
          <input
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Optional"
            value={title}
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <div>
          <button className="secondary-action" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="large-action" type="submit">
            {editing ? "Save changes" : "Add link"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
