import { describe, expect, it } from "vitest";

import { createInitialJournalSnapshot } from "../domain/initialState";
import type { Page } from "../domain/models";
import {
  pageShareLinks,
  pageShareRecordings,
  pageShareTitle,
  paperShareRect,
  shareFileStem,
  storyShareLinks,
  storyShareRecordings,
} from "./pageShare";

function pageWithRecording(overrides?: Partial<Page>): Page {
  const snapshot = createInitialJournalSnapshot(
    new Date("2026-08-14T09:00:00.000Z"),
  );
  const base = snapshot.pages[0]!;
  return {
    ...base,
    objects: [
      {
        id: "voice-1",
        type: "voice",
        pageId: base.id,
        position: { x: 0.1, y: 0.1 },
        createdAt: base.createdAt,
        revision: 0,
        asset: {
          id: "audio-1",
          localUri: "file:///voice.m4a",
          mimeType: "audio/mp4",
          byteLength: 12,
          checksum: "sum",
        },
        durationMs: 1200,
        transcriptionStatus: "complete",
      },
      {
        id: "transcript-1",
        type: "transcript",
        pageId: base.id,
        position: { x: 0.1, y: 0.2 },
        createdAt: base.createdAt,
        revision: 0,
        recordingId: "voice-1",
        rawText: "Saw an owl.",
        locale: "en-AU",
        engine: "apple-speech",
      },
    ],
    ...overrides,
  };
}

describe("pageShare helpers", () => {
  it("names diary, sketchbook, and Story shares from the display name", () => {
    expect(
      pageShareTitle({
        displayName: "Ivan",
        context: { kind: "diary", date: "2026-08-14" },
      }),
    ).toBe("Ivan 14 August 2026");
    expect(
      pageShareTitle({
        displayName: "Ivan",
        context: {
          kind: "sketchbook",
          sketchbook: { name: "Garden birds" },
        },
      }),
    ).toBe("Ivan Garden birds");
    expect(
      pageShareTitle({
        displayName: "Ivan",
        context: { kind: "story", pageNumber: 2 },
      }),
    ).toBe("Ivan My Story page 2");
  });

  it("attaches durable Story recordings", () => {
    const snapshot = createInitialJournalSnapshot(
      new Date("2026-08-14T09:00:00.000Z"),
    );
    const page = snapshot.stories[0]!.pages[0]!;
    page.recordings = [{
      id: "story-voice",
      asset: {
        id: "story-audio",
        localUri: "file:///story.m4a",
        mimeType: "audio/mp4",
        byteLength: 12,
        checksum: "story-sum",
      },
      durationMs: 1_200,
      transcriptionStatus: "not-requested",
      revision: 0,
      createdAt: page.createdAt,
    }];

    expect(storyShareRecordings(page)).toEqual({
      hasRecordings: true,
      audioUris: ["file:///story.m4a"],
    });
  });

  it("keeps a filesystem-safe file stem", () => {
    expect(shareFileStem("Ivan 14 August 2026")).toBe("Ivan-14-August-2026");
    expect(shareFileStem('Ivan: "Notes"/one')).toBe("Ivan-Notesone");
  });

  it("attaches file recordings and falls back when no transcript exists", () => {
    const withTranscript = pageShareRecordings(pageWithRecording());
    expect(withTranscript.hasRecordings).toBe(true);
    expect(withTranscript.audioUris).toEqual(["file:///voice.m4a"]);
    expect(withTranscript.transcripts).toEqual(["Saw an owl."]);

    const withoutTranscript = pageShareRecordings(
      pageWithRecording({
        objects: [
          {
            id: "voice-1",
            type: "voice",
            pageId: "page-1",
            position: { x: 0.1, y: 0.1 },
            createdAt: "2026-08-14T00:00:00.000Z",
            revision: 0,
            asset: {
              id: "audio-1",
              localUri: "demo://welcome-voice",
              mimeType: "audio/mp4",
              byteLength: 0,
              checksum: "demo",
            },
            durationMs: 1000,
            transcriptionStatus: "not-requested",
          },
        ],
      }),
    );
    expect(withoutTranscript.audioUris).toEqual([]);
    expect(withoutTranscript.transcripts).toEqual([
      "No written text for this recording",
    ]);
  });

  it("keeps only openable web links for PDF export", () => {
    const snapshot = createInitialJournalSnapshot(
      new Date("2026-08-14T09:00:00.000Z"),
    );
    const base = snapshot.pages[0]!;
    expect(
      pageShareLinks({
        ...base,
        objects: [
          {
            id: "link-1",
            type: "link",
            pageId: base.id,
            position: { x: 0.2, y: 0.3 },
            frame: { width: 0.3, height: 0.12 },
            createdAt: base.createdAt,
            revision: 0,
            url: "https://example.com/garden",
            title: "Garden birds",
          },
          {
            id: "link-2",
            type: "link",
            pageId: base.id,
            position: { x: 0.5, y: 0.5 },
            createdAt: base.createdAt,
            revision: 0,
            url: "javascript:alert(1)",
            title: "Ignore me",
          },
        ],
      }),
    ).toEqual([
      {
        url: "https://example.com/garden",
        title: "Garden birds",
        x: 0.2,
        y: 0.3,
        width: 0.3,
        height: 0.12,
      },
    ]);
  });

  it("maps Story link cards into tappable PDF regions", () => {
    const snapshot = createInitialJournalSnapshot(
      new Date("2026-08-14T09:00:00.000Z"),
    );
    const page = snapshot.stories[0]!.pages[0]!;
    page.links = [{
      id: "story-link",
      url: "https://example.com/memory",
      title: "Family archive",
      revision: 0,
      createdAt: page.createdAt,
    }];
    const paper = document.createElement("div");
    const link = document.createElement("button");
    link.dataset.storyLinkId = "story-link";
    paper.append(link);
    Object.defineProperty(paper, "getBoundingClientRect", {
      value: () => ({
        x: 10, y: 20, width: 400, height: 800,
        top: 20, left: 10, right: 410, bottom: 820,
        toJSON: () => undefined,
      }),
    });
    Object.defineProperty(link, "getBoundingClientRect", {
      value: () => ({
        x: 50, y: 100, width: 200, height: 80,
        top: 100, left: 50, right: 250, bottom: 180,
        toJSON: () => undefined,
      }),
    });

    expect(storyShareLinks(page, paper)).toEqual([{
      url: "https://example.com/memory",
      title: "Family archive",
      x: 0.1,
      y: 0.1,
      width: 0.5,
      height: 0.1,
    }]);
  });

  it("ignores a paper target that is too small to capture", () => {
    const paper = document.createElement("div");
    Object.defineProperty(paper, "getBoundingClientRect", {
      value: () => ({ x: 0, y: 0, width: 2, height: 2, top: 0, left: 0, right: 2, bottom: 2, toJSON: () => undefined }),
    });
    expect(paperShareRect(paper)).toBeUndefined();
  });
});
