import { ChevronLeft, NotebookTabs, Plus } from "lucide-react";

import type { Sketchbook } from "../domain/models";

export function EmptySketchbookView({
  onAddPage,
  onBack,
  sketchbook,
}: {
  onAddPage: () => void;
  onBack: () => void;
  sketchbook: Sketchbook;
}) {
  return (
    <section className="library-view" aria-labelledby="empty-sketchbook-heading">
      <header className="library-heading">
        <button className="back-to-library" onClick={onBack} type="button">
          <ChevronLeft aria-hidden="true" />
          All sketchbooks
        </button>
      </header>
      <div className="empty-library">
        <NotebookTabs aria-hidden="true" />
        <h1 id="empty-sketchbook-heading">{sketchbook.name}</h1>
        <p>This sketchbook does not have any pages yet.</p>
        <button className="large-action" onClick={onAddPage} type="button">
          <Plus aria-hidden="true" />
          Add first page
        </button>
      </div>
    </section>
  );
}
