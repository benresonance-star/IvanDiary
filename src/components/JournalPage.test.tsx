import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialJournalSnapshot } from "../domain/initialState";
import type {
  DocumentOperationInput,
  Page,
  SaveHealth,
  TextObject,
} from "../domain/models";
import {
  BrowserAppleTranscriptionMock,
  BrowserJournalAudioMock,
  BrowserJournalFilesMock,
} from "../native/browserMocks";
import type { NativeSharePlugin } from "../native/contracts";
import { PageWorkspace } from "./JournalPage";
import { BrowserSketchRepository } from "../repository/browserSketchRepository";
import { openExternalUrl } from "../utils/openExternalUrl";

vi.mock("../sketch/SketchSurface", async () => {
  const { forwardRef } = await import("react");
  return {
    SketchSurface: forwardRef(function SketchSurfaceMock() {
      return <div className="sketch-surface" />;
    }),
  };
});

vi.mock("../sketch/NativeSketchPreview", () => ({
  NativeSketchPreview: () => null,
}));

vi.mock("../native/pencilKit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../native/pencilKit")>();
  return {
    ...actual,
    hasNativePencilKit: () => false,
  };
});

const nativeTextEditor = vi.hoisted(() => ({
  available: false,
  open: vi.fn(),
}));

vi.mock("../native/textEditor", () => ({
  hasNativeTextEditor: () => nativeTextEditor.available,
  openNativeTextEditor: nativeTextEditor.open,
}));

vi.mock("../utils/openExternalUrl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/openExternalUrl")>();
  return {
    ...actual,
    openExternalUrl: vi.fn(),
  };
});

vi.mock("./pageShare", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./pageShare")>();
  return {
    ...actual,
    paperShareRect: () => ({ x: 12, y: 90, width: 800, height: 520 }),
    controlShareRect: () => ({ x: 920, y: 18, width: 56, height: 56 }),
    waitForShareCapture: vi.fn(async () => undefined),
  };
});

const HEALTH: SaveHealth = {
  localDurability: "saved",
  remoteSync: "offline",
  durableRevision: 1,
  pendingOperationCount: 0,
};

const sketchRepository = new BrowserSketchRepository();

function diaryPage(): Page {
  const snapshot = createInitialJournalSnapshot(
    new Date("2026-08-14T09:00:00.000Z"),
  );
  return {
    ...snapshot.pages[0]!,
    objects: [],
  };
}

function renderWorkspace({
  page = diaryPage(),
  pages,
  share = {
    exportPage: vi.fn(async () => ({
      fileUri: "file:///Ivan 14 August 2026.jpg",
      fileName: "Ivan 14 August 2026.jpg",
    })),
    share: vi.fn(async () => ({ completed: true, activityType: "mail" })),
  } satisfies NativeSharePlugin,
  audio = new BrowserJournalAudioMock(),
  commit = vi.fn(async () => true),
  favourite = false,
  isFirstPage = true,
  textEditorPreference = "native",
}: {
  page?: Page;
  pages?: Page[];
  share?: NativeSharePlugin;
  audio?: BrowserJournalAudioMock;
  commit?: (operation: DocumentOperationInput) => Promise<boolean>;
  favourite?: boolean;
  isFirstPage?: boolean;
  textEditorPreference?: "native" | "standard";
} = {}) {
  const snapshot = createInitialJournalSnapshot(
    new Date("2026-08-14T09:00:00.000Z"),
  );
  render(
    <PageWorkspace
      audio={audio}
      commit={commit}
      files={new BrowserJournalFilesMock()}
      context={{
        kind: "diary",
        date: snapshot.days[0]!.date,
        favourite,
        journalDayId: snapshot.days[0]!.id,
        isFirstPage,
      }}
      displayName="Ivan"
      health={HEALTH}
      onAddPage={vi.fn(async () => true)}
      onDrawingHealthChange={vi.fn()}
      onDeletePage={vi.fn(async () => true)}
      onReorderPages={vi.fn(async () => true)}
      onSelectPage={vi.fn()}
      onToolChange={vi.fn()}
      page={page}
      pages={pages ?? [page]}
      penColor="#171410"
      fingerDrawingEnabled
      fingerErasingEnabled={false}
      favouriteColourLongPressEnabled
      favouriteColourLongPressSeconds={2}
      favouritePenColours={["#171410"]}
      penNib="pen"
      penNibProfiles={{
        pen: { color: "#171410", width: 4.2, opacity: 1 },
        marker: { color: "#171410", width: 14, opacity: 0.45 },
        pencil: { color: "#171410", width: 5, opacity: 0.72 },
        brush: { color: "#171410", width: 12, opacity: 0.68 },
      }}
      penOpacity={1}
      penWidth={4.2}
      myWords={[]}
      recordingLimitMinutes={5}
      textEditorPreference={textEditorPreference}
      share={share}
      sketchRepository={sketchRepository}
      tool="view"
      transcription={new BrowserAppleTranscriptionMock()}
    />,
  );
  return { share, audio, commit };
}

describe("PageWorkspace share", () => {
  beforeEach(() => {
    nativeTextEditor.available = false;
    nativeTextEditor.open.mockReset();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("puts drawing and history immediately before Share", () => {
    renderWorkspace();
    const tools = screen.getByLabelText("Page tools");
    const share = screen.getByRole("button", { name: "Share this page" });
    expect(tools.contains(share)).toBe(true);
    const toolbarTools = tools.querySelectorAll(".tool");
    expect(toolbarTools[toolbarTools.length - 1]).toBe(share);
    const toolLabels = Array.from(toolbarTools, (tool) => tool.textContent?.trim());
    expect(toolLabels.slice(-5)).toEqual([
      expect.stringMatching(/^Draw/),
      "Erase",
      "Undo",
      "Redo",
      "Share",
    ]);
    const favourite = screen.getByRole("button", {
      name: "Add this page to favourites",
    });
    const entryLabel = document.querySelector(
      ".today-diary-entry, .earlier-diary-entry",
    );
    expect(entryLabel).toBeInTheDocument();
    expect(entryLabel?.compareDocumentPosition(favourite)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(tools).not.toContainElement(favourite);
  });

  it("blocks share while a recording is in progress", async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Voice" }));
    await screen.findByRole("button", { name: /Stop recording/ });
    fireEvent.click(screen.getByRole("button", { name: "Share this page" }));
    expect(screen.queryByRole("dialog", { name: "Share this page" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop recording first, then share." })).toBeInTheDocument();
  });

  it("exports a picture after the chooser closes and reports a destination", async () => {
    const share: NativeSharePlugin = {
      exportPage: vi.fn(async () => {
        expect(document.querySelector(".journal-workspace.share-capturing")).toBeTruthy();
        expect(
          screen.queryByRole("button", { name: "Preparing to send" }),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole("button", { name: "Ready to send" }),
        ).not.toBeInTheDocument();
        return {
          fileUri: "file:///Ivan 14 August 2026.jpg",
          fileName: "Ivan 14 August 2026.jpg",
        };
      }),
      share: vi.fn(async () => ({ completed: true, activityType: "mail" })),
    };
    renderWorkspace({
      share,
      page: {
        ...diaryPage(),
        objects: [
          {
            id: "voice-1",
            type: "voice",
            pageId: "page-1",
            position: { x: 0.1, y: 0.2 },
            createdAt: "2026-08-14T00:00:00.000Z",
            revision: 0,
            asset: {
              id: "audio-1",
              localUri: "file:///voice.m4a",
              mimeType: "audio/mp4",
              byteLength: 24,
              checksum: "sum",
            },
            durationMs: 1500,
            transcriptionStatus: "not-requested",
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Share this page" }));
    await screen.findByRole("dialog", { name: "Share this page" });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Send this page as a picture in Messages or Mail",
      }),
    );

    await waitFor(() => expect(share.exportPage).toHaveBeenCalled());
    expect(screen.queryByRole("dialog", { name: "Share this page" })).not.toBeInTheDocument();
    expect(share.exportPage).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "jpg",
        title: expect.stringMatching(/^Ivan /),
        fileStem: expect.stringMatching(/^Ivan-\d/),
        documentId: diaryPage().drawingDocumentId,
        transcripts: ["No written text for this recording"],
      }),
    );
    expect(share.share).toHaveBeenCalledWith(
      expect.objectContaining({
        fileUris: ["file:///Ivan 14 August 2026.jpg", "file:///voice.m4a"],
      }),
    );
    expect(screen.getByRole("button", { name: "Ready to send" })).toBeInTheDocument();
  });

  it("exports PDF web links with the page", async () => {
    const share: NativeSharePlugin = {
      exportPage: vi.fn(async () => ({
        fileUri: "file:///Ivan-14-August-2026.pdf",
        fileName: "Ivan-14-August-2026.pdf",
      })),
      share: vi.fn(async () => ({ completed: true, activityType: "mail" })),
    };
    renderWorkspace({
      share,
      page: {
        ...diaryPage(),
        objects: [
          {
            id: "link-1",
            type: "link",
            pageId: "page-1",
            position: { x: 0.2, y: 0.3 },
            frame: { width: 0.3, height: 0.12 },
            createdAt: "2026-08-14T00:00:00.000Z",
            revision: 0,
            url: "https://example.com/garden",
            title: "Garden birds",
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Share this page" }));
    await screen.findByRole("dialog", { name: "Share this page" });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Send this page as a PDF document in Messages or Mail",
      }),
    );

    await waitFor(() => expect(share.exportPage).toHaveBeenCalled());
    expect(share.exportPage).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "pdf",
        links: [
          {
            url: "https://example.com/garden",
            title: "Garden birds",
            x: 0.2,
            y: 0.3,
            width: 0.3,
            height: 0.12,
          },
        ],
      }),
    );
  });

  it("does not announce success when the share sheet is cancelled", async () => {
    const share: NativeSharePlugin = {
      exportPage: vi.fn(async () => ({
        fileUri: "file:///page.jpg",
        fileName: "page.jpg",
      })),
      share: vi.fn(async () => ({ completed: false })),
    };
    renderWorkspace({ share });
    fireEvent.click(screen.getByRole("button", { name: "Share this page" }));
    await screen.findByRole("dialog", { name: "Share this page" });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Send this page as a PDF document in Messages or Mail",
      }),
    );
    await waitFor(() => expect(share.share).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Share cancelled." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ready to send" })).not.toBeInTheDocument();
  });

  it("opens a canvas link from View mode", () => {
    renderWorkspace({
      page: {
        ...diaryPage(),
        objects: [
          {
            id: "link-1",
            type: "link",
            pageId: "page-1",
            position: { x: 0.2, y: 0.2 },
            createdAt: "2026-08-14T00:00:00.000Z",
            revision: 0,
            url: "https://example.com/garden",
            title: "Garden birds",
          },
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Garden birds" }));
    expect(openExternalUrl).toHaveBeenCalledWith("https://example.com/garden");
  });
});

describe("PageWorkspace favourites", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("favourites the current diary page", async () => {
    const commit = vi.fn(async () => true);
    const page = diaryPage();
    renderWorkspace({ commit, page });
    fireEvent.click(
      screen.getByRole("button", { name: "Add this page to favourites" }),
    );
    await waitFor(() => {
      expect(commit).toHaveBeenCalledWith({
        type: "favourite-set",
        targetType: "page",
        targetId: page.id,
        favourite: true,
      });
    });
    expect(commit).not.toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "journal-day" }),
    );
  });

  it("clears a legacy day favourite when unfavouriting the first page", async () => {
    const commit = vi.fn(async () => true);
    const page = diaryPage();
    renderWorkspace({
      commit,
      page,
      favourite: true,
      isFirstPage: true,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove this page from favourites" }),
    );
    await waitFor(() => {
      expect(commit).toHaveBeenCalledWith({
        type: "favourite-set",
        targetType: "page",
        targetId: page.id,
        favourite: false,
      });
      expect(commit).toHaveBeenCalledWith({
        type: "favourite-set",
        targetType: "journal-day",
        targetId: expect.any(String),
        favourite: false,
      });
    });
  });

  it("favourites a later diary page as its own card", async () => {
    const commit = vi.fn(async () => true);
    const firstPage = diaryPage();
    const secondPage = {
      ...firstPage,
      id: "page-2026-08-14-2",
      drawingDocumentId: "drawing-page-2026-08-14-2",
    };
    renderWorkspace({
      commit,
      page: secondPage,
      pages: [firstPage, secondPage],
      isFirstPage: false,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add this page to favourites" }),
    );
    await waitFor(() => {
      expect(commit).toHaveBeenCalledWith({
        type: "favourite-set",
        targetType: "page",
        targetId: secondPage.id,
        favourite: true,
      });
    });
    expect(commit).not.toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "journal-day" }),
    );
  });

  it("adds native text through the existing page operation", async () => {
    nativeTextEditor.available = true;
    nativeTextEditor.open.mockResolvedValue({
      cancelled: false,
      text: "Native words",
    });
    const commit = vi.fn(async () => true);
    const page = diaryPage();
    renderWorkspace({ commit, page });

    fireEvent.click(screen.getByRole("button", { name: "Text" }));

    await waitFor(() =>
      expect(nativeTextEditor.open).toHaveBeenCalledWith(
        expect.objectContaining({
          initialText: "",
          mode: "add",
          localeIdentifier: "en-AU",
        }),
      ),
    );
    await waitFor(() =>
      expect(commit).toHaveBeenCalledWith({
        type: "page-object-add",
        pageId: page.id,
        object: expect.objectContaining({
          type: "text",
          text: "Native words",
        }),
      }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Add text" }),
    ).not.toBeInTheDocument();
  });

  it("uses the standard editor when selected in settings", async () => {
    nativeTextEditor.available = true;
    nativeTextEditor.open.mockImplementation(() => new Promise(() => undefined));
    renderWorkspace({ textEditorPreference: "standard" });

    fireEvent.click(screen.getByRole("button", { name: "Text" }));

    expect(
      await screen.findByRole("dialog", { name: "Add text" }),
    ).toBeInTheDocument();
  });

  it("does not create text when the native editor is cancelled", async () => {
    nativeTextEditor.available = true;
    nativeTextEditor.open.mockResolvedValue({
      cancelled: true,
      text: "Unsaved words",
    });
    const commit = vi.fn(async () => true);
    renderWorkspace({ commit });

    fireEvent.click(screen.getByRole("button", { name: "Text" }));

    await waitFor(() => expect(nativeTextEditor.open).toHaveBeenCalled());
    expect(commit).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "page-object-add" }),
    );
  });

  it("opens the standard editor when the native bridge fails", async () => {
    nativeTextEditor.available = true;
    nativeTextEditor.open.mockRejectedValue(new Error("Bridge unavailable"));
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Text" }));

    expect(
      await screen.findByRole("dialog", { name: "Add text" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The native editor was unavailable. The standard editor is open.",
      ),
    ).toBeInTheDocument();
  });

  it("edits an existing text block natively with one revision", async () => {
    nativeTextEditor.available = true;
    nativeTextEditor.open.mockResolvedValue({
      cancelled: false,
      text: "Edited words",
    });
    const textObject: TextObject = {
      id: "text-1",
      type: "text",
      pageId: "page-1",
      position: { x: 0.2, y: 0.3 },
      frame: { width: 0.42, height: 0.24 },
      createdAt: "2026-08-14T09:00:00.000Z",
      revision: 3,
      text: "Original words",
      textScale: 1,
      textAlign: "left",
      layer: "above-sketch",
    };
    const page = {
      ...diaryPage(),
      id: "page-1",
      objects: [textObject],
    };
    const commit = vi.fn(async () => true);
    renderWorkspace({ commit, page });

    fireEvent.click(
      screen.getByRole("button", { name: "Edit journal text" }),
    );

    await waitFor(() =>
      expect(commit).toHaveBeenCalledWith({
        type: "page-object-update",
        pageId: page.id,
        object: {
          ...textObject,
          text: "Edited words",
          revision: 4,
        },
      }),
    );
  });
});
