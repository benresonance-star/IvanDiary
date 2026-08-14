import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createInitialJournalSnapshot } from "../domain/initialState";
import type { Favourite, Page } from "../domain/models";
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
        lastViewedFavouriteId={favourite.id}
        onOpenFavourite={onOpenFavourite}
        onReorderFavourites={vi.fn()}
        sketchRepository={new BrowserSketchRepository()}
        snapshot={{ ...snapshot, favourites: [favourite] }}
      />,
    );

    expect(
      container.querySelector(".favourite-page-preview"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Open favourite: 3 August 2026/i,
      }).closest("article"),
    ).toHaveClass("last-viewed");
    fireEvent.click(
      screen.getByRole("button", {
        name: /Open favourite: 3 August 2026/i,
      }),
    );
    expect(onOpenFavourite).toHaveBeenCalledWith(favourite);
  });

  it("shows a later diary page favourite as its own card", () => {
    const snapshot = createInitialJournalSnapshot(
      new Date("2026-08-03T09:00:00.000Z"),
    );
    const day = snapshot.days[0]!;
    const firstPage = snapshot.pages[0]!;
    const secondPage: Page = {
      ...firstPage,
      id: "page-2026-08-03-2",
      drawingDocumentId: "drawing-page-2026-08-03-2",
    };
    const favourite: Favourite = {
      id: "favourite-page-two",
      targetType: "page",
      targetId: secondPage.id,
      createdAt: "2026-08-03T10:00:00.000Z",
    };
    const onOpenFavourite = vi.fn();
    const { container } = render(
      <FavouritesView
        commit={vi.fn()}
        lastViewedFavouriteId={favourite.id}
        onOpenFavourite={onOpenFavourite}
        onReorderFavourites={vi.fn()}
        sketchRepository={new BrowserSketchRepository()}
        snapshot={{
          ...snapshot,
          days: [{ ...day, pageIds: [...day.pageIds, secondPage.id] }],
          pages: [...snapshot.pages, secondPage],
          favourites: [favourite],
        }}
      />,
    );

    expect(
      container.querySelector(".favourite-page-preview"),
    ).toBeInTheDocument();
    expect(screen.getByText("Diary page")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Open favourite: 3 August 2026, page 2/i,
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
        onReorderFavourites={vi.fn()}
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

  it("reorders favourites and labels removal controls in Arrange mode", () => {
    const snapshot = createInitialJournalSnapshot(
      new Date("2026-08-03T09:00:00.000Z"),
    );
    const dayFavourite: Favourite = {
      id: "favourite-day",
      targetType: "journal-day",
      targetId: snapshot.days[0]!.id,
      createdAt: "2026-08-03T10:00:00.000Z",
    };
    const sketchbookFavourite: Favourite = {
      id: "favourite-sketchbook",
      targetType: "sketchbook",
      targetId: snapshot.sketchbooks[0]!.id,
      createdAt: "2026-08-03T10:01:00.000Z",
    };
    const onReorderFavourites = vi.fn().mockResolvedValue(true);
    render(
      <FavouritesView
        commit={vi.fn()}
        onOpenFavourite={vi.fn()}
        onReorderFavourites={onReorderFavourites}
        sketchRepository={new BrowserSketchRepository()}
        snapshot={{
          ...snapshot,
          favourites: [dayFavourite, sketchbookFavourite],
        }}
      />,
    );

    const arrangeButton = screen.getByRole("button", { name: "Arrange" });
    fireEvent.click(arrangeButton);
    expect(arrangeButton).toHaveClass("arrange-action", "selected");
    expect(
      screen.getAllByRole("button", { name: /Remove .* from favourites/i }),
    ).toHaveLength(2);

    fireEvent.click(
      screen.getByRole("button", { name: "Move Favourite Places earlier" }),
    );
    expect(onReorderFavourites).toHaveBeenCalledWith([
      sketchbookFavourite.id,
      dayFavourite.id,
    ]);
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
        lastViewedSketchbookId="sketchbook-favourite-places"
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
    expect(
      screen.getByRole("button", { name: "Open Favourite Places" }).closest("article"),
    ).toHaveClass("last-viewed");
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

    fireEvent.click(
      screen.getByRole("button", { name: "Move Animals earlier" }),
    );
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
