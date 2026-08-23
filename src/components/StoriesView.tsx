import { BookOpen, ChevronLeft, ChevronRight, Move, Plus, ThumbsUp, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import type { DocumentOperationInput, JournalSnapshot, MyStory } from "../domain/models";
import type { SketchRepository } from "../sketch/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { StoryPagePreview } from "./StoryPagePreview";
import { FavouriteConfirmation } from "./FavouriteConfirmation";
import { moveItem } from "./libraryViewHelpers";

export function StoriesView({ commit, lastViewedStoryId, onCreateStory, onDeleteStory,
  onOpenStory, onRenameStory, onReorderStories, sketchRepository, snapshot }: {
  commit: (operation: DocumentOperationInput) => boolean | void | Promise<boolean | void>;
  lastViewedStoryId?: string;
  onCreateStory: (name: string) => Promise<boolean>;
  onDeleteStory: (storyId: string) => Promise<boolean>;
  onOpenStory: (storyId: string) => void;
  onRenameStory: (storyId: string, name: string) => Promise<boolean>;
  onReorderStories: (storyIds: string[]) => Promise<boolean>;
  sketchRepository: SketchRepository;
  snapshot: JournalSnapshot;
}) {
  const [editing, setEditing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string>();
  const [name, setName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<MyStory>();
  const [confirmation, setConfirmation] = useState<string>();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const ids = snapshot.stories.map((story) => story.id);
  useEffect(() => {
    if (dialogOpen) nameInputRef.current?.focus({ preventScroll: true });
  }, [dialogOpen]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const saved = renamingId ? await onRenameStory(renamingId, trimmed) : await onCreateStory(trimmed);
    if (saved) { setDialogOpen(false); setRenamingId(undefined); setName(""); }
  };

  return <section className="library-view" aria-labelledby="stories-heading">
    <header className="library-heading"><div><p className="eyebrow">A home for memories</p><h1 id="stories-heading">My Stories</h1></div>
      <div className="library-actions">
        <button aria-pressed={editing} className={editing ? "large-action arrange-action selected" : "large-action arrange-action"} onClick={() => setEditing((value) => !value)} type="button"><Move aria-hidden="true" />{editing ? "Done editing" : "Edit"}</button>
        <button className="large-action" onClick={() => { setRenamingId(undefined); setName(""); setDialogOpen(true); }} type="button"><Plus aria-hidden="true" />New story</button>
      </div>
    </header>
    <div className="book-grid sketchbook-grid">{snapshot.stories.map((story, index) => <article className={`book-card sketchbook-card${editing ? " editing" : ""}${lastViewedStoryId === story.id ? " last-viewed" : ""}`} key={story.id}>
      <button aria-label={editing ? `${story.name}. Use the edit controls.` : `Open ${story.name}`} className="sketchbook-card-link" onClick={() => { if (!editing) onOpenStory(story.id); }} type="button">
        {story.pages[0] ? <StoryPagePreview className="sketchbook-page-preview" page={story.pages[0]} sketchRepository={sketchRepository} /> : <div className="book-cover"><BookOpen aria-hidden="true" /></div>}
        <div><h2>{story.name}</h2><p>{story.pages.length === 1 ? "1 page" : `${story.pages.length} pages`}</p></div>
      </button>
      {editing ? <div className="sketchbook-edit-controls">
        <div className="favourite-reorder-controls sketchbook-reorder-controls"><button aria-label={`Move ${story.name} earlier`} disabled={index === 0} onClick={() => void onReorderStories(moveItem(ids, story.id, ids[index - 1]!))} type="button"><ChevronLeft aria-hidden="true" /></button><button aria-label={`Move ${story.name} later`} disabled={index === ids.length - 1} onClick={() => void onReorderStories(moveItem(ids, story.id, ids[index + 1]!))} type="button"><ChevronRight aria-hidden="true" /></button></div>
        <button className="sketchbook-rename" onClick={() => { setRenamingId(story.id); setName(story.name); setDialogOpen(true); }} type="button">Rename</button>
        <button aria-label={`Delete ${story.name}`} className="sketchbook-delete" onClick={() => setPendingDelete(story)} type="button"><Trash2 aria-hidden="true" /></button>
      </div> : <button aria-label={story.favourite ? `Remove ${story.name} from favourites` : `Add ${story.name} to favourites`} aria-pressed={story.favourite} className="favourite-button" onClick={() => void (async () => { const adding = !story.favourite; const saved = await commit({ type: "favourite-set", targetType: "story", targetId: story.id, favourite: adding }); if (saved !== false) setConfirmation(adding ? "Added to Your Favourites" : "Removed from Your Favourites"); })()} type="button"><ThumbsUp aria-hidden="true" /></button>}
    </article>)}</div>
    <FavouriteConfirmation message={confirmation} onDone={() => setConfirmation(undefined)} />
    {pendingDelete ? <ConfirmDialog cancelLabel="Keep story" confirmClassName="confirm-delete" confirmLabel="Delete story" icon={<Trash2 aria-hidden="true" />} onCancel={() => setPendingDelete(undefined)} onConfirm={() => { const id = pendingDelete.id; setPendingDelete(undefined); void onDeleteStory(id); }} title="Delete this story?"><p>{pendingDelete.name} and all of its pages will be deleted.</p></ConfirmDialog> : null}
    {dialogOpen ? <div className="dialog-backdrop"><form aria-labelledby="story-name-heading" aria-modal="true" className="name-dialog" onSubmit={(event) => void save(event)} role="dialog"><h2 id="story-name-heading">{renamingId ? "Rename story" : "Name your story"}</h2><label htmlFor="story-name">Story name</label><input id="story-name" maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="For example, My Childhood" ref={nameInputRef} value={name} /><div className="dialog-actions"><button onClick={() => { setDialogOpen(false); setRenamingId(undefined); }} type="button">Cancel</button><button className="primary-dialog-action" disabled={!name.trim()} type="submit">{renamingId ? "Save name" : "Create story"}</button></div></form></div> : null}
  </section>;
}
