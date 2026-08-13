import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createInitialJournalSnapshot } from "../domain/initialState";
import type { Favourite } from "../domain/models";
import {
  BrowserAppleTranscriptionMock,
  BrowserJournalAudioMock,
  BrowserJournalFilesMock,
} from "../native/browserMocks";
import { BrowserSketchRepository } from "../repository/browserSketchRepository";
import {
  EmptySketchbookView,
  FavouritesView,
  SketchbooksView,
} from "./LibraryViews";

describe("FavouritesView", () => {
  it("shows a page preview and opens its diary favourite", () => {
    const snapshot = createInitialJournalSnapshot(
      new Date("2026-08-03T09:00:00.000Z"),
    );
    const day = snapshot.days[0]!;
    const favourite: Favourite = {
      id: "favourite-day",
      targetType: "journal-day",
      targetId: day.id,
      createdAt: "2026-08-03T10:00:00.000Z",
    };
    const onOpenFavourite = vi.fn();
    const { container } = render(
      <FavouritesView
        commit={vi.fn()}
        onOpenFavourite={onOpenFavourite}
        sketchRepository={new BrowserSketchRepository()}
        snapshot={{ ...snapshot, favourites: [favourite] }}
      />,
    );

    expect(
      container.querySelector(".favourite-page-preview"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Open favourite: 3 August 2026/i,
      }),
    );
    expect(onOpenFavourite).toHaveBeenCalledWith(favourite);
  });

  it("removes a favourite through Arrange mode after confirmation", () => {
    const snapshot = createInitialJournalSnapshot(
      new Date("2026-08-03T09:00:00.000Z"),
    );
    const day = snapshot.days[0]!;
    const favourite: Favourite = {
      id: "favourite-day",
      targetType: "journal-day",
      targetId: day.id,
      createdAt: "2026-08-03T10:00:00.000Z",
    };
    const commit = vi.fn();
    render(
      <FavouritesView
        commit={commit}
        onOpenFavourite={vi.fn()}
        sketchRepository={new BrowserSketchRepository()}
        snapshot={{ ...snapshot, favourites: [favourite] }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Arrange" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Remove 3 August 2026 from favourites/i }),
    );
    expect(
      screen.getByRole("alertdialog", { name: `Hi ${snapshot.settings.displayName}` }),
    ).toHaveTextContent("Remove from your Favourites?");
    fireEvent.click(screen.getByRole("button", { name: "Remove favourite" }));
    expect(commit).toHaveBeenCalledWith({
      type: "favourite-set",
      targetType: "journal-day",
      targetId: day.id,
      favourite: false,
    });
  });
});

describe("SketchbooksView", () => {
  it("names a sketchbook before creating and opening it", async () => {
    const snapshot = createInitialJournalSnapshot(
      new Date("2026-08-03T09:00:00.000Z"),
    );
    const onCreateSketchbook = vi.fn().mockResolvedValue(true);
    render(
      <SketchbooksView
        audio={new BrowserJournalAudioMock()}
        commit={vi.fn()}
        files={new BrowserJournalFilesMock()}
        onCreateSketchbook={onCreateSketchbook}
        onDeleteSketchbook={vi.fn()}
        onOpenSketchbook={vi.fn()}
        onRenameSketchbook={vi.fn()}
        onReorderSketchbooks={vi.fn()}
        sketchRepository={new BrowserSketchRepository()}
        snapshot={snapshot}
        transcription={new BrowserAppleTranscriptionMock()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "New sketchbook" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Sketchbook name" }),
      { target: { value: "Animals" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create sketchbook" }),
    );

    await waitFor(() =>
      expect(onCreateSketchbook).toHaveBeenCalledWith("Animals"),
    );
  });

  it("opens an existing sketchbook card", () => {
    const snapshot = createInitialJournalSnapshot(
      new Date("2026-08-03T09:00:00.000Z"),
    );
    const onOpenSketchbook = vi.fn();
    render(
      <SketchbooksView
        audio={new BrowserJournalAudioMock()}
        commit={vi.fn()}
        files={new BrowserJournalFilesMock()}
        onCreateSketchbook={vi.fn()}
        onDeleteSketchbook={vi.fn()}
        onOpenSketchbook={onOpenSketchbook}
        onRenameSketchbook={vi.fn()}
        onReorderSketchbooks={vi.fn()}
        sketchRepository={new BrowserSketchRepository()}
        snapshot={snapshot}
        transcription={new BrowserAppleTranscriptionMock()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open Favourite Places" }),
    );
    expect(onOpenSketchbook).toHaveBeenCalledWith(
      "sketchbook-favourite-places",
    );
  });

  it("adds a spoken title to the editable name field", async () => {
    const snapshot = createInitialJournalSnapshot(
      new Date("2026-08-03T09:00:00.000Z"),
    );
    render(
      <SketchbooksView
        audio={new BrowserJournalAudioMock()}
        commit={vi.fn()}
        files={new BrowserJournalFilesMock()}
        onCreateSketchbook={vi.fn()}
        onDeleteSketchbook={vi.fn()}
        onOpenSketchbook={vi.fn()}
        onRenameSketchbook={vi.fn()}
        onReorderSketchbooks={vi.fn()}
        sketchRepository={new BrowserSketchRepository()}
        snapshot={snapshot}
        transcription={new BrowserAppleTranscriptionMock()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "New sketchbook" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Speak title" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Stop title" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Stop title" }));
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Sketchbook name" }),
      ).toHaveValue(
        "Browser transcription demonstration. Edit this text if needed.",
      ),
    );
  });

  it("renames and reorders sketchbooks in Arrange mode", async () => {
    const snapshot = createInitialJournalSnapshot(
      new Date("2026-08-03T09:00:00.000Z"),
    );
    const first = snapshot.sketchbooks[0]!;
    const second = {
      ...first,
      id: "sketchbook-animals",
      name: "Animals",
    };
    const onRenameSketchbook = vi.fn().mockResolvedValue(true);
    const onReorderSketchbooks = vi.fn().mockResolvedValue(true);
    render(
      <SketchbooksView
        audio={new BrowserJournalAudioMock()}
        commit={vi.fn()}
        files={new BrowserJournalFilesMock()}
        onCreateSketchbook={vi.fn()}
        onDeleteSketchbook={vi.fn()}
        onOpenSketchbook={vi.fn()}
        onRenameSketchbook={onRenameSketchbook}
        onReorderSketchbooks={onReorderSketchbooks}
        sketchRepository={new BrowserSketchRepository()}
        snapshot={{
          ...snapshot,
          sketchbooks: [first, second],
        }}
        transcription={new BrowserAppleTranscriptionMock()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Arrange" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[0]!);
    fireEvent.change(
      screen.getByRole("textbox", { name: "Sketchbook name" }),
      { target: { value: "Favourite Places Updated" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() =>
      expect(onRenameSketchbook).toHaveBeenCalledWith(
        first.id,
        "Favourite Places Updated",
      ),
    );

    const animalsHandle = screen.getByRole("button", {
      name: /Drag to reorder Animals/i,
    });
    fireEvent.keyDown(animalsHandle, {
      key: "ArrowLeft",
      shiftKey: true,
    });
    expect(onReorderSketchbooks).toHaveBeenCalledWith([
      second.id,
      first.id,
    ]);
  });

  it("confirms sketchbook deletion from Arrange mode", () => {
    const snapshot = createInitialJournalSnapshot(
      new Date("2026-08-03T09:00:00.000Z"),
    );
    const sketchbook = snapshot.sketchbooks[0]!;
    const onDeleteSketchbook = vi.fn().mockResolvedValue(true);
    render(
      <SketchbooksView
        audio={new BrowserJournalAudioMock()}
        commit={vi.fn()}
        files={new BrowserJournalFilesMock()}
        onCreateSketchbook={vi.fn()}
        onDeleteSketchbook={onDeleteSketchbook}
        onOpenSketchbook={vi.fn()}
        onRenameSketchbook={vi.fn()}
        onReorderSketchbooks={vi.fn()}
        sketchRepository={new BrowserSketchRepository()}
        snapshot={snapshot}
        transcription={new BrowserAppleTranscriptionMock()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Arrange" }));
    fireEvent.click(
      screen.getByRole("button", { name: `Delete ${sketchbook.name}` }),
    );
    expect(
      screen.getByRole("alertdialog", { name: "Delete this sketchbook?" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete sketchbook" }));
    expect(onDeleteSketchbook).toHaveBeenCalledWith(sketchbook.id);
  });

  it("offers a first page for legacy empty sketchbooks", () => {
    const snapshot = createInitialJournalSnapshot(
      new Date("2026-08-03T09:00:00.000Z"),
    );
    const sketchbook = snapshot.sketchbooks[0]!;
    const onAddPage = vi.fn();
    render(
      <EmptySketchbookView
        onAddPage={onAddPage}
        onBack={vi.fn()}
        sketchbook={sketchbook}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add first page" }),
    );
    expect(onAddPage).toHaveBeenCalledOnce();
  });
});
