import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
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
    SketchSurface: forwardRef(function SketchSurfaceMock(
      {
        capabilities,
      }: {
        capabilities: { kind: string };
      },
      _ref,
    ) {
      return (
        <div
          className="sketch-surface"
          data-capabilities={capabilities.kind}
        />
      );
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
    exportDiary: vi.fn(async () => ({ pdfFileUri: "file:///diary.pdf", archiveFileUri: "file:///diary.tar" })),
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
  tool = "view",
  onToolChange = vi.fn(),
  trackTool = false,
}: {
  page?: Page;
  pages?: Page[];
  share?: NativeSharePlugin;
  audio?: BrowserJournalAudioMock;
  commit?: (operation: DocumentOperationInput) => Promise<boolean>;
  favourite?: boolean;
  isFirstPage?: boolean;
  textEditorPreference?: "native" | "standard";
  tool?: "view" | "arrange" | "pen" | "eraser";
  onToolChange?: (tool: "view" | "arrange" | "pen" | "eraser") => void;
  trackTool?: boolean;
} = {}) {
  const snapshot = createInitialJournalSnapshot(
    new Date("2026-08-14T09:00:00.000Z"),
  );
  function Workspace({
    pageTool,
    handleToolChange,
  }: {
    pageTool: "view" | "arrange" | "pen" | "eraser";
    handleToolChange: (next: "view" | "arrange" | "pen" | "eraser") => void;
  }) {
    return (
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
        onToolChange={handleToolChange}
        page={page}
        pages={pages ?? [page]}
        penColor="#171410"
        fingerDrawingEnabled
        fingerErasingEnabled={false}
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
        tool={pageTool}
        transcription={new BrowserAppleTranscriptionMock()}
      />
    );
  }
  function TrackedWorkspace() {
    const [pageTool, setPageTool] = useState(tool);
    return (
      <Workspace
        handleToolChange={(next) => {
          onToolChange(next);
          setPageTool(next);
        }}
        pageTool={pageTool}
      />
    );
  }
  if (trackTool) {
    render(<TrackedWorkspace />);
  } else {
    render(<Workspace handleToolChange={onToolChange} pageTool={tool} />);
  }
  return { share, audio, commit, onToolChange };
}

describe("PageWorkspace canvas background", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("applies the page background colour to the paper", () => {
    renderWorkspace({
      page: { ...diaryPage(), backgroundColor: "#aabbcc" },
    });
    expect(document.querySelector(".paper-page")).toHaveStyle({
      "--page-background-colour": "#aabbcc",
    });
  });

  it("selects a diary voice before playing it in Edit mode", async () => {
    const audio = new BrowserJournalAudioMock();
    const play = vi.spyOn(audio, "play");
    const page = diaryPage();
    page.objects = [{
      id: "voice-edit-gate",
      type: "voice",
      pageId: page.id,
      position: { x: 0.1, y: 0.2 },
      createdAt: "2026-08-14T00:00:00.000Z",
      revision: 0,
      asset: {
        id: "audio-edit-gate",
        localUri: "demo://recording/edit-gate",
        mimeType: "audio/mp4",
        byteLength: 24,
        checksum: "sum",
      },
      durationMs: 1_500,
      transcriptionStatus: "not-requested",
    }];
    renderWorkspace({ audio, page, tool: "arrange" });

    const selectButton = screen.getByRole("button", {
      name: "Select voice recording to play",
    });
    fireEvent.click(selectButton);
    expect(play).not.toHaveBeenCalled();
    expect(selectButton.closest("[data-object-id]")).toHaveClass("selected-object");

    fireEvent.click(screen.getByRole("button", { name: "Play voice recording" }));
    await waitFor(() => expect(play).toHaveBeenCalledOnce());
  });

  it("plays a diary voice directly while Draw remains active", async () => {
    const audio = new BrowserJournalAudioMock();
    const play = vi.spyOn(audio, "play");
    const page = diaryPage();
    page.objects = [{
      id: "voice-draw-playback",
      type: "voice",
      pageId: page.id,
      position: { x: 0.1, y: 0.2 },
      createdAt: "2026-08-14T00:00:00.000Z",
      revision: 0,
      asset: {
        id: "audio-draw-playback",
        localUri: "demo://recording/draw-playback",
        mimeType: "audio/mp4",
        byteLength: 24,
        checksum: "sum",
      },
      durationMs: 1_500,
      transcriptionStatus: "not-requested",
    }];
    renderWorkspace({ audio, page, tool: "pen" });

    expect(document.querySelector(".paper-page")).toHaveClass("drawing-active");
    fireEvent.click(screen.getByRole("button", { name: "Play voice recording" }));

    await waitFor(() => expect(play).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Draw" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("offers the background chooser on the canvas in Edit mode", () => {
    const commit = vi.fn(async () => true);
    renderWorkspace({
      commit,
      page: { ...diaryPage(), backgroundColor: "#aabbcc" },
      tool: "arrange",
    });

    const paper = document.querySelector(".paper-page");
    const trigger = screen.getByRole("button", {
      name: "Canvas background colour #aabbcc",
    });
    expect(paper).toContainElement(trigger);
    fireEvent.click(trigger);
    expect(document.querySelector(".canvas-background-backdrop")).toBeInTheDocument();
    const picker = screen.getByLabelText("Choose canvas background colour");
    expect(picker).toHaveFocus();
    fireEvent.change(picker, { target: { value: "#112233" } });
    expect(commit).toHaveBeenCalledWith({
      type: "page-background-update",
      pageId: diaryPage().id,
      backgroundColor: "#112233",
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(trigger).toHaveFocus();
  });
});

describe("PageWorkspace drawing tools", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["pen", "Draw", "Draw settings"],
    ["eraser", "Erase", "Erase settings"],
  ] as const)("keeps %s selected while its settings palette suspends drawing", async (tool, buttonName, dialogName) => {
    const { onToolChange } = renderWorkspace({ tool, trackTool: true });
    const toolButton = screen.getByRole("button", { name: buttonName });
    fireEvent.click(toolButton);

    expect(await screen.findByRole("dialog", { name: dialogName })).toBeVisible();
    expect(toolButton).toHaveAttribute("aria-pressed", "true");
    expect(onToolChange).not.toHaveBeenCalledWith("view");
    expect(document.querySelector(".sketch-surface")).toHaveAttribute(
      "data-capabilities",
      "readonly",
    );

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog", { name: dialogName })).not.toBeInTheDocument();
    expect(toolButton).toHaveAttribute("aria-pressed", "true");
    expect(onToolChange).not.toHaveBeenCalledWith("view");
  });

  it("keeps Erase settings when finger erasing is toggled", async () => {
    renderWorkspace({ tool: "eraser" });
    fireEvent.click(screen.getByRole("button", { name: "Erase" }));

    expect(await screen.findByRole("dialog", { name: "Erase settings" })).toBeVisible();
    fireEvent.click(screen.getByRole("switch", { name: "Erase with finger" }));
    expect(screen.getByRole("dialog", { name: "Erase settings" })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Draw settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erase" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

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

  it("adds a selected vector shape from Draw settings", async () => {
    const commit = vi.fn(async () => true);
    const page = diaryPage();
    renderWorkspace({ commit, page, tool: "pen" });
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    fireEvent.click(screen.getByRole("tab", { name: "Shapes" }));
    fireEvent.click(screen.getByRole("button", { name: "Circle" }));
    await waitFor(() => expect(commit).toHaveBeenCalledWith({
      type: "page-object-add", pageId: page.id,
      object: expect.objectContaining({ type: "shape", shapeKind: "circle", frame: { width: 0.24, height: 0.24 }, fillColor: "#171410", layer: "above-sketch" }),
      renderIndex: 0,
    }));
  });

  it("creates an editable freeform shape from the accessible starter", async () => {
    const commit = vi.fn(async () => true);
    const page = diaryPage();
    renderWorkspace({ commit, page, tool: "pen" });
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    fireEvent.click(screen.getByRole("tab", { name: "Shapes" }));
    fireEvent.click(screen.getByRole("button", { name: "Freeform" }));
    fireEvent.keyDown(screen.getByRole("application", { name: /Draw a freeform shape outline/ }), { key: "Enter" });
    await waitFor(() => expect(commit).toHaveBeenCalledWith({
      type: "page-object-add", pageId: page.id,
      object: expect.objectContaining({ type: "shape", shapeKind: "freeform", points: expect.any(Array), layer: "above-sketch" }),
      renderIndex: 0,
    }));
  });

  it("inserts a custom polygon above the sketch at the final render index", async () => {
    const commit = vi.fn(async () => true);
    const page = diaryPage();
    renderWorkspace({ commit, page, tool: "pen" });
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    fireEvent.click(screen.getByRole("tab", { name: "Shapes" }));
    fireEvent.click(screen.getByRole("button", { name: "Custom polygon" }));
    const paper = document.querySelector<HTMLElement>(".paper-page")!;
    vi.spyOn(paper, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800,
      width: 1000, height: 800, toJSON: () => ({}),
    });
    fireEvent.click(paper, { clientX: 200, clientY: 180 });
    fireEvent.click(paper, { clientX: 600, clientY: 190 });
    fireEvent.click(paper, { clientX: 400, clientY: 500 });
    fireEvent.click(screen.getByRole("button", { name: "Finish polygon" }));

    await waitFor(() => expect(commit).toHaveBeenCalledWith({
      type: "page-object-add",
      pageId: page.id,
      object: expect.objectContaining({
        type: "shape",
        shapeKind: "polygon",
        layer: "above-sketch",
        points: expect.arrayContaining([expect.any(Object)]),
      }),
      renderIndex: 0,
    }));
  });

  it("blocks share while a recording is in progress", async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Voice" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start recording" }));
    expect(await screen.findByRole("button", { name: "Pause recording" })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Share this page" })).not.toBeInTheDocument();
  });

  it("exports a picture after the chooser closes and reports a destination", async () => {
    const share: NativeSharePlugin = {
      exportDiary: vi.fn(async () => ({ pdfFileUri: "file:///diary.pdf", archiveFileUri: "file:///diary.tar" })),
      exportPage: vi.fn(async () => {
        expect(document.querySelector(".journal-workspace.share-capturing")).toBeTruthy();
        expect(screen.getByText("A complete shared page")).toBeInTheDocument();
        expect(document.querySelector('[data-object-id="shape-behind"]')).toHaveClass("behind-sketch");
        expect(document.querySelector('[data-object-id="shape-above"]')).not.toHaveClass("behind-sketch");
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
            id: "text-1",
            type: "text",
            pageId: "page-1",
            position: { x: 0.15, y: 0.12 },
            frame: { width: 0.4, height: 0.18 },
            createdAt: "2026-08-14T00:00:00.000Z",
            revision: 0,
            text: "A complete shared page",
            textScale: 1,
          },
          {
            id: "shape-behind",
            type: "shape",
            pageId: "page-1",
            position: { x: 0.1, y: 0.45 },
            frame: { width: 0.2, height: 0.2 },
            layer: "behind-sketch",
            createdAt: "2026-08-14T00:00:00.000Z",
            revision: 0,
            shapeKind: "circle",
            fillColor: "#ffd166",
            outlineWidth: 2,
          },
          {
            id: "shape-above",
            type: "shape",
            pageId: "page-1",
            position: { x: 0.65, y: 0.45 },
            frame: { width: 0.2, height: 0.2 },
            layer: "above-sketch",
            createdAt: "2026-08-14T00:00:00.000Z",
            revision: 0,
            shapeKind: "rectangle",
            fillColor: "#5aa9e6",
            outlineWidth: 2,
          },
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
        captureMode: "webview",
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

  it("keeps page objects under the drawing in view and edit", () => {
    const objects: Page["objects"] = [
      {
        id: "text-above",
        type: "text",
        pageId: "page-1",
        position: { x: 0.15, y: 0.12 },
        frame: { width: 0.4, height: 0.18 },
        createdAt: "2026-08-14T00:00:00.000Z",
        revision: 0,
        text: "Words over the page",
        textScale: 1,
        layer: "above-sketch",
      },
      {
        id: "shape-behind",
        type: "shape",
        pageId: "page-1",
        position: { x: 0.1, y: 0.45 },
        frame: { width: 0.2, height: 0.2 },
        layer: "behind-sketch",
        createdAt: "2026-08-14T00:00:00.000Z",
        revision: 0,
        shapeKind: "circle",
        fillColor: "#ffd166",
        outlineWidth: 2,
      },
    ];
    renderWorkspace({
      page: { ...diaryPage(), objects },
      tool: "view",
    });
    expect(document.querySelector('[data-object-id="text-above"]')).toHaveStyle({
      zIndex: 1,
    });
    expect(document.querySelector('[data-object-id="shape-behind"]')).toHaveStyle({
      zIndex: 2,
    });
  });

  it("stacks an over-ink object above the drawing preview", () => {
    renderWorkspace({
      page: {
        ...diaryPage(),
        objects: [{
          id: "text-front",
          type: "text",
          pageId: "page-1",
          position: { x: 0.15, y: 0.12 },
          frame: { width: 0.4, height: 0.18 },
          createdAt: "2026-08-14T00:00:00.000Z",
          revision: 0,
          text: "Words in front",
          textScale: 1,
          inFrontOfSketch: true,
        }],
      },
      tool: "view",
    });
    expect(document.querySelector('[data-object-id="text-front"]')).toHaveStyle({
      zIndex: 45,
    });
  });

  it("promotes the only canvas object in front of the sketch on first bring-forward", () => {
    const text: TextObject = {
      id: "text-only",
      type: "text",
      pageId: "page-1",
      position: { x: 0.2, y: 0.2 },
      frame: { width: 0.4, height: 0.12 },
      createdAt: "2026-08-14T09:00:00.000Z",
      revision: 0,
      text: "Only words",
      textScale: 1,
    };
    const commit = vi.fn(async () => true);
    renderWorkspace({
      commit,
      page: { ...diaryPage(), id: "page-1", objects: [text] },
      tool: "arrange",
    });
    fireEvent.click(screen.getByText("Only words"));
    fireEvent.click(screen.getByRole("button", { name: "Bring text block forward" }));
    expect(commit).toHaveBeenCalledWith({
      type: "page-object-update",
      pageId: "page-1",
      object: expect.objectContaining({ id: text.id, inFrontOfSketch: true }),
    });
  });

  it("demotes an over-ink object behind the sketch on send-backward", () => {
    const text: TextObject = {
      id: "text-front",
      type: "text",
      pageId: "page-1",
      position: { x: 0.2, y: 0.2 },
      frame: { width: 0.4, height: 0.12 },
      createdAt: "2026-08-14T09:00:00.000Z",
      revision: 0,
      text: "Front words",
      textScale: 1,
      inFrontOfSketch: true,
    };
    const commit = vi.fn(async () => true);
    renderWorkspace({
      commit,
      page: { ...diaryPage(), id: "page-1", objects: [text] },
      tool: "arrange",
    });
    fireEvent.click(screen.getByText("Front words"));
    fireEvent.click(screen.getByRole("button", { name: "Send text block backward" }));
    expect(commit).toHaveBeenCalledWith({
      type: "page-object-update",
      pageId: "page-1",
      object: expect.objectContaining({ id: text.id }),
    });
    expect(commit).toHaveBeenCalledWith({
      type: "page-object-update",
      pageId: "page-1",
      object: expect.not.objectContaining({ inFrontOfSketch: true }),
    });
    expect(document.querySelector(".sketch-surface")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /sketch: / }),
    ).not.toBeInTheDocument();
  });

  it("exports PDF web links with the page", async () => {
    const share: NativeSharePlugin = {
      exportDiary: vi.fn(async () => ({ pdfFileUri: "file:///diary.pdf", archiveFileUri: "file:///diary.tar" })),
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
      exportDiary: vi.fn(async () => ({ pdfFileUri: "file:///diary.pdf", archiveFileUri: "file:///diary.tar" })),
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
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({
      type: "page-object-add",
      pageId: page.id,
      object: expect.objectContaining({
        position: { x: 0.29, y: 0.38 },
        frame: { width: 0.42, height: 0.24 },
      }),
    }));
    expect(commit).not.toHaveBeenCalledWith(expect.objectContaining({
      type: "page-text-stack-membership-update",
    }));
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
    renderWorkspace({ commit, page, tool: "arrange" });

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

  it("keeps existing canvas text read-only in View mode", () => {
    const textObject: TextObject = {
      id: "text-view", type: "text", pageId: "page-1",
      position: { x: 0.2, y: 0.3 }, createdAt: "2026-08-14T09:00:00.000Z",
      revision: 0, text: "Read only words", textScale: 1,
    };
    renderWorkspace({ page: { ...diaryPage(), id: "page-1", objects: [textObject] } });
    expect(screen.queryByRole("button", { name: "Edit journal text" })).not.toBeInTheDocument();
    expect(screen.getByText("Read only words")).toHaveRole("paragraph");
  });

  it("selects a one-entry column as one frame while preserving legacy free text", () => {
    const stacked: TextObject = {
      id: "text-stacked", type: "text", pageId: "page-1",
      position: { x: 0.2, y: 0.2 }, frame: { width: 0.4, height: 0.12 },
      createdAt: "2026-08-14T09:00:00.000Z", revision: 0,
      text: "Only entry", textScale: 1,
    };
    const legacyFree: TextObject = {
      ...stacked, id: "text-free", text: "Legacy free",
      position: { x: 0.62, y: 0.68 },
    };
    renderWorkspace({
      page: {
        ...diaryPage(), id: "page-1", objects: [stacked, legacyFree],
        textStack: {
          position: { x: 0.1, y: 0.12 }, frame: { width: 0.8, height: 0.7 },
          memberIds: [stacked.id],
        },
      },
      tool: "arrange",
    });

    fireEvent.click(screen.getByText("Only entry"));
    expect(screen.getByRole("button", {
      name: "Drag to move text block",
    })).toBeVisible();
    expect(document.querySelector('[data-object-id="text-free"]')).toBeInTheDocument();
    expect(screen.getByText("Legacy free")).toBeVisible();
  });

  it("renders independent text and exposes accessible text controls", async () => {
    const first: TextObject = {
      id: "text-first", type: "text", pageId: "page-1",
      position: { x: 0.2, y: 0.2 }, frame: { width: 0.4, height: 0.12 },
      createdAt: "2026-08-14T09:00:00.000Z", revision: 0,
      text: "First words", textScale: 1, role: "body",
    };
    const second: TextObject = {
      ...first, id: "text-second", text: "Second words",
    };
    const commit = vi.fn(async () => true);
    renderWorkspace({
      commit,
      page: {
        ...diaryPage(),
        id: "page-1",
        objects: [first, second],
      },
      tool: "arrange",
    });

    expect(screen.getByText("First words")).toBeVisible();
    expect(screen.getByText("Second words")).toBeVisible();

    fireEvent.click(screen.getByText("First words"));
    expect(screen.getByRole("complementary", { name: "Text editing commands" })).toBeVisible();
    expect(screen.getByRole("button", {
      name: "Drag to move text block",
    })).toBeVisible();
    expect(screen.getByRole("button", {
      name: "Bring text block forward",
    })).toBeVisible();
    expect(screen.queryByRole("button", {
      name: "Send text block backward",
    })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Text structure" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    expect(screen.getByRole("group", { name: "Text structure" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Main Text" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Title" }));
    expect(commit).toHaveBeenCalledWith({
      type: "page-object-update",
      pageId: "page-1",
      object: { ...first, role: "title", revision: 1 },
    });
    expect(screen.getByRole("button", { name: "Centre" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Top" }));
    expect(commit).toHaveBeenCalledWith({
      type: "page-object-update",
      pageId: "page-1",
      object: expect.objectContaining({ id: first.id, verticalAlign: "top" }),
    });
    expect(screen.queryByRole("group", { name: "Text font" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit text" })).toHaveClass(
      "contextual-text-edit",
    );
    expect(screen.getByRole("toolbar", { name: "Text editing toolbar" }))
      .toHaveTextContent("Edit textLook");
    expect(screen.queryByRole("button", { name: "New Entry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arrange" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {
      name: "Drag to move text block",
    })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("slider", { name: "Text outline thickness" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Text colour"), {
      target: { value: "#123456" },
    });
    expect(document.querySelector(
      '[data-object-id="text-first"] .page-text-card',
    )).toHaveStyle({ color: "#123456" });
    await waitFor(() => expect(commit).toHaveBeenCalledWith({
      type: "page-object-update",
      pageId: "page-1",
      object: expect.objectContaining({ id: first.id, color: "#123456" }),
    }));
    fireEvent.click(screen.getByRole("button", { name: "Increase text size" }));
    expect(commit).toHaveBeenCalledWith({
      type: "page-object-update",
      pageId: "page-1",
      object: expect.objectContaining({ id: first.id, textScale: 1.25 }),
    });

    expect(screen.queryByLabelText("Text background colour")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Text background" }));
    expect(commit).toHaveBeenCalledWith({
      type: "page-object-update",
      pageId: "page-1",
      object: expect.objectContaining({ id: first.id, backgroundColor: "#fffaf0" }),
    });
    expect(screen.queryByLabelText("Text outline colour")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Text outline" }));
    expect(commit).toHaveBeenCalledWith({
      type: "page-object-update",
      pageId: "page-1",
      object: expect.objectContaining({
        id: first.id,
        outlineColor: "#3f3528",
        outlineWidth: 2,
      }),
    });

    fireEvent.click(document.querySelector('[data-object-id="text-first"]')!);
    expect(screen.queryByLabelText("Text look options")).not.toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: "Drag to move text block",
    })).toBeVisible();
    fireEvent.click(document.querySelector(".paper-page")!);
    expect(screen.queryByRole("complementary", {
      name: "Text editing commands",
    })).not.toBeInTheDocument();
  });
});
