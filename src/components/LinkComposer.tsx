import { useState, type FormEvent } from "react";
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
  const editing = initialUrl.length > 0;

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
    <div className="link-composer-backdrop" onClick={onClose}>
      <form
        aria-labelledby="link-composer-title"
        aria-modal="true"
        className="link-composer"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
        role="dialog"
      >
        <h2 id="link-composer-title">
          {editing ? "Edit web link" : "Add a web link"}
        </h2>
        <label>
          Web address
          <input
            autoFocus
            inputMode="url"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://"
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
