import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { forwardRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type {
  MyStoryPage,
  SaveHealth,
} from "../domain/models";
import {
  BrowserAppleTranscriptionMock,
  BrowserJournalAudioMock,
  BrowserJournalFilesMock,
  BrowserNativeShareMock,
} from "../native/browserMocks";
import { BrowserSketchRepository } from "../repository/browserSketchRepository";
import type { PageTool } from "./JournalPage";
import { MyStoryWorkspace } from "./MyStoryWorkspace";

vi.mock("../hooks/useNativeDrawingOverlay", () => ({
  useNativeDrawingOverlay: () => ({
    nativeAvailable: false,
    overlayActive: false,
    overlayRequested: false,
    overlayReady: false,
    suspendOverlay: vi.fn(async () => true),
  }),
}));

vi.mock("../sketch/SketchSurface", () => ({
  SketchSurface: forwardRef(function SketchSurfaceMock() {
    return <div data-testid="story-sketch-surface" />;
  }),
}));

vi.mock("../sketch/NativeSketchPreview", () => ({
  NativeSketchPreview: () => null,
}));

vi.mock("../native/textEditor", () => ({
  hasNativeTextEditor: () => false,
  openNativeTextEditor: vi.fn(),
}));

const HEALTH: SaveHealth = {
  localDurability: "saved",
  remoteSync: "offline",
  durableRevision: 1,
  pendingOperationCount: 0,
};

function storyPage(): MyStoryPage {
  return {
    id: "story-page",
    drawingDocumentId: "story-drawing",
    splitRatio: 0.5,
    textSide: "left",
    textBackgroundColor: "#fffaf0",
    textColor: "#245b8a",
    textBlocks: [
      {
        id: "story-title",
        text: "My early years",
        role: "title",
        color: "#171410",
        revision: 0,
        createdAt: "2026-08-15T00:00:00.000Z",
      },
      {
        id: "story-heading",
        text: "Growing up",
        role: "heading",
        color: "#245b8a",
        revision: 0,
        createdAt: "2026-08-15T00:00:00.000Z",
      },
      {
        id: "story-body",
        text: "We lived near the river.",
        role: "body",
        color: "#171410",
        revision: 0,
        createdAt: "2026-08-15T00:00:00.000Z",
      },
    ],
    photos: [],
    links: [],
    recordings: [],
    revision: 0,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
  };
}

function renderStory(
  commit = vi.fn(async () => true),
  page = storyPage(),
) {
  const audio = new BrowserJournalAudioMock();
  const files = new BrowserJournalFilesMock();
  const share = new BrowserNativeShareMock();
  const transcription = new BrowserAppleTranscriptionMock();
  function Harness() {
    const [tool, setTool] = useState<PageTool>("view");
    return (
      <MyStoryWorkspace
        audio={audio}
        commit={commit}
        defaultTextColor="#245b8a"
        displayName="Ivan"
        favouritePenColours={["#171410", "#245b8a"]}
        files={files}
        fingerDrawingEnabled
        fingerErasingEnabled={false}
        health={HEALTH}
        myWords={[]}
        navigationObscured={false}
        onAddPage={vi.fn(async () => true)}
        onDeletePage={vi.fn(async () => true)}
        onDrawingHealthChange={vi.fn()}
        onReorderPages={vi.fn(async () => true)}
        onSelectPage={vi.fn()}
        onToolChange={setTool}
        page={page}
        pages={[page]}
        penColor="#171410"
        penNib="pen"
        penNibProfiles={undefined}
        penOpacity={1}
        penWidth={4}
        recordingLimitMinutes={5}
        share={share}
        sketchRepository={new BrowserSketchRepository()}
        textEditorPreference="standard"
        tool={tool}
        transcription={transcription}
      />
    );
  }
  render(<Harness />);
  return { audio, commit, files, share, transcription };
}

describe("MyStoryWorkspace", () => {
  it("places a selected parametric shape from Draw settings", async () => {
    const { commit } = renderStory();
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    fireEvent.click(screen.getByRole("tab", { name: "Shapes" }));
    expect(screen.queryByRole("button", { name: "Christian Cross" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Triangle" }));
    await waitFor(() => expect(commit).toHaveBeenCalledWith(expect.objectContaining({
      type: "my-story-shape-add",
      shape: expect.objectContaining({ type: "shape", shapeKind: "triangle", fillColor: "#171410", layer: "behind-sketch" }),
    })));
  });

  it("builds a custom polygon from canvas points", async () => {
    const { commit } = renderStory();
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    fireEvent.click(screen.getByRole("tab", { name: "Shapes" }));
    fireEvent.click(screen.getByRole("button", { name: "Custom polygon" }));
    const paper = document.querySelector<HTMLElement>(".my-story-paper")!;
    vi.spyOn(paper, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600, toJSON: () => ({}) });
    fireEvent.click(paper, { clientX: 200, clientY: 150 });
    fireEvent.click(paper, { clientX: 600, clientY: 160 });
    fireEvent.click(paper, { clientX: 400, clientY: 450 });
    fireEvent.click(screen.getByRole("button", { name: "Finish polygon" }));
    await waitFor(() => expect(commit).toHaveBeenCalledWith(expect.objectContaining({
      type: "my-story-shape-add",
      shape: expect.objectContaining({ shapeKind: "polygon", points: expect.arrayContaining([expect.any(Object)]) }),
    })));
  });
  it("uses the existing tools and renders semantic structured text", () => {
    renderStory();

    const toolbar = screen.getByLabelText("My Story tools");
    for (const name of [
      "View",
      "Edit",
      "Draw",
      "Erase",
      "Undo",
      "Redo",
      "Image",
      "Link",
      "Text",
      "Voice",
      "Share this page",
    ]) {
      expect(within(toolbar).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(
      Array.from(
        toolbar.querySelectorAll(".tool"),
        (button) => button.textContent?.trim(),
      ).slice(-5),
    ).toEqual([
      expect.stringMatching(/^Draw/),
      "Erase",
      "Undo",
      "Redo",
      "Share",
    ]);
    expect(within(toolbar).queryByRole("button", { name: "Text colour" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "My early years",
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Growing up",
    );
    expect(screen.getByText("We lived near the river.").tagName).toBe("P");
    expect(screen.getByTestId("story-sketch-surface")).toBeInTheDocument();
    expect(screen.queryByText("Add your first image")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Story text").querySelector(".story-text-background"),
    ).toHaveStyle({ backgroundColor: "#fffaf0" });
    expect(
      screen.queryByRole("button", { name: "Resize text and image sides" }),
    ).not.toBeInTheDocument();
  });

  it("adds a durable web link from the Story toolbar", async () => {
    const { commit } = renderStory();

    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Web address" }),
      { target: { value: "https://example.com/memory" } },
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Family archive" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));

    await waitFor(() =>
      expect(commit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "my-story-link-add",
          link: expect.objectContaining({
            url: "https://example.com/memory",
            title: "Family archive",
          }),
        }),
      ),
    );
  });

  it("keeps the link composer open when the link cannot be saved", async () => {
    renderStory(vi.fn(async () => false));

    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Web address" }),
      { target: { value: "https://example.com/memory" } },
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Family archive" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));

    expect(
      await screen.findByRole("dialog", { name: "Add a web link" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "The link could not be saved. Check the address and try again.",
      ),
    ).toBeInTheDocument();
  });

  it("uses the journal Edit page controls and flips the split layout", () => {
    const { commit } = renderStory();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const page = screen.getByRole("button", {
      name: /Page 1\. Drag to reorder/i,
    });
    expect(page).toHaveClass("diary-page-button", "reorderable");
    expect(page.querySelector(".thumbnail-drag-indicator")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Resize text and image sides" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Move Story text to the right" }),
    );
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "my-story-layout-update",
        pageId: "story-page",
        textSide: "right",
      }),
    );
    expect(
      screen.getByRole("button", {
        name: /Page 1 cannot be deleted/i,
      }),
    ).toHaveClass("page-thumbnail-delete");
  });

  it("renders a restored right-side Story text layout", () => {
    const page = storyPage();
    page.textSide = "right";
    renderStory(vi.fn(async () => true), page);

    expect(screen.getByLabelText("Story text")).toHaveStyle({
      gridColumn: "3",
      gridRow: "1",
    });
    expect(screen.getByLabelText("Story images")).toHaveStyle({
      gridColumn: "1",
      gridRow: "1",
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(
      screen.getByRole("button", { name: "Move Story text to the left" }),
    ).toBeInTheDocument();
  });

  it("opens contextual text and pane controls without changing the toolbar", () => {
    const { commit } = renderStory();

    fireEvent.click(screen.getByText("Growing up"));
    expect(screen.queryByLabelText("My Story options")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Growing up" }));
    expect(screen.getByLabelText("My Story options")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Title" }));
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "my-story-text-update",
        block: expect.objectContaining({ role: "title" }),
      }),
    );
    fireEvent.change(screen.getByLabelText("Text colour"), {
      target: { value: "#fffaf0" },
    });
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "my-story-layout-update",
        textColor: "#000000",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Background colour" }));
    fireEvent.change(screen.getByLabelText("Text side background colour"), {
      target: { value: "#245b8a" },
    });
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "my-story-layout-update",
        textBackgroundColor: "#245b8a",
        textColor: "#ffffff",
      }),
    );
    expect(
      screen.getByLabelText("Text side background colour"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View" }));
    fireEvent.click(screen.getByText("Growing up"));
    expect(screen.queryByLabelText("My Story options")).not.toBeInTheDocument();
  });

  it("confirms before deleting Story text in Edit mode", () => {
    const { commit } = renderStory();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Growing up" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(
      screen.getByRole("alertdialog", { name: "Delete text block?" }),
    ).toHaveTextContent("Do you want to delete “Growing up”?");
    expect(commit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(
      screen.queryByRole("alertdialog", { name: "Delete text block?" }),
    ).not.toBeInTheDocument();
    expect(commit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(
      within(
        screen.getByRole("alertdialog", { name: "Delete text block?" }),
      ).getByRole("button", { name: "Delete" }),
    );

    expect(commit).toHaveBeenCalledWith({
      type: "my-story-text-delete",
      pageId: "story-page",
      blockId: "story-heading",
    });
  });

  it("uses the last selected text colour for new story text", async () => {
    const { commit } = renderStory();

    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Story text" }),
      {
      target: { value: "Another memory" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save to My Story" }));

    await waitFor(() =>
      expect(commit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "my-story-text-add",
          block: expect.objectContaining({
            text: "Another memory",
            color: "#245b8a",
          }),
        }),
      ),
    );
  });

  it("keeps Draw and Erase active while adding Story text", async () => {
    renderStory();

    const draw = screen.getByRole("button", { name: "Draw" });
    fireEvent.click(draw);
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    expect(await screen.findByRole("dialog", { name: "Add story text" }))
      .toBeInTheDocument();
    expect(draw).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    const erase = screen.getByRole("button", { name: "Erase" });
    fireEvent.click(erase);
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    expect(await screen.findByRole("dialog", { name: "Add story text" }))
      .toBeInTheDocument();
    expect(erase).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps existing Story text read-only in Draw and Erase modes", () => {
    renderStory();

    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    const heading = screen.getByText("Growing up");
    expect(
      screen.queryByRole("button", { name: "Growing up" }),
    ).not.toBeInTheDocument();
    fireEvent.doubleClick(heading);
    expect(
      screen.queryByRole("dialog", { name: "Edit story text" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("My Story options")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Erase" }));
    fireEvent.doubleClick(screen.getByText("Growing up"));
    expect(
      screen.queryByRole("dialog", { name: "Edit story text" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erase" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("edits Story text by double click or long hold in Edit mode", async () => {
    renderStory();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const heading = screen.getByRole("button", { name: "Growing up" });

    fireEvent.doubleClick(heading);
    expect(await screen.findByRole("dialog", { name: "Edit story text" }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(heading, {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(650);
      });
      expect(screen.getByRole("dialog", { name: "Edit story text" }))
        .toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens draw settings when Draw is selected again", () => {
    const { commit } = renderStory();
    const draw = screen.getByRole("button", { name: "Draw" });

    fireEvent.click(draw);
    expect(screen.queryByLabelText("Draw settings")).not.toBeInTheDocument();
    fireEvent.click(draw);
    expect(screen.getByLabelText("Draw settings")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Marker" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "settings-update",
        settings: expect.objectContaining({ penNib: "marker" }),
      }),
    );
  });

  it("records and saves durable voice in My Story", async () => {
    const { audio, commit } = renderStory();
    const start = vi.spyOn(audio, "start");
    const voice = screen.getByRole("button", { name: "Voice" });

    fireEvent.click(voice);
    fireEvent.click(await screen.findByRole("button", { name: "Start recording" }));
    await waitFor(() => expect(start).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: "End recording" }));
    fireEvent.click(await screen.findByRole("button", { name: "Place recording" }));

    await waitFor(() =>
      expect(commit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "my-story-recording-add",
          pageId: "story-page",
          recording: expect.objectContaining({
            transcriptionStatus: "not-requested",
          }),
        }),
      ),
    );
  });

  it("plays Story voice outside Edit and uses shared Edit controls", async () => {
    const page = storyPage();
    page.recordings = [{
      id: "story-voice",
      asset: {
        id: "story-voice-asset",
        localUri: "demo://recording/story-voice",
        mimeType: "audio/mp4",
        byteLength: 0,
        checksum: "demo",
      },
      durationMs: 1_000,
      transcriptionStatus: "not-requested",
      position: { x: 0.1, y: 0.7 },
      frame: { width: 0.26, height: 0.1 },
      layer: "above-sketch",
      revision: 0,
      createdAt: "2026-08-15T00:00:00.000Z",
    }];
    renderStory(vi.fn(async () => true), page);

    fireEvent.click(screen.getByRole("button", { name: "Play voice recording" }));
    expect(
      await screen.findByRole("button", { name: "Pause voice recording" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const voiceObject = screen.getByRole("group", {
        name: /voice recording\. Arrow keys move/i,
      });
    fireEvent.click(voiceObject);
    expect(voiceObject).toHaveStyle({ width: "18%", height: "12%" });
    expect(
      screen.getByRole("button", { name: "Drag to move voice recording" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Drag to resize voice recording" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete voice recording" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/convert to text/i)).not.toBeInTheDocument();
  });

  it("shares the complete Story paper using WebView capture", async () => {
    const { share } = renderStory();
    const exportPage = vi.spyOn(share, "exportPage");
    const openShareSheet = vi.spyOn(share, "share");

    fireEvent.click(screen.getByRole("button", { name: "Share this page" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Send this page as a picture in Messages or Mail",
      }),
    );

    await waitFor(() =>
      expect(exportPage).toHaveBeenCalledWith(
        expect.objectContaining({
          captureMode: "webview",
          format: "jpg",
          title: "Ivan My Story page 1",
        }),
      ),
    );
    expect(openShareSheet).toHaveBeenCalled();
  });
});
