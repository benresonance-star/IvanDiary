import { describe, expect, it } from "vitest";

import { createInitialJournalSnapshot } from "./initialState";
import { normalizedStoryRenderOrder } from "./storyRenderOrder";

describe("My Story render order", () => {
  it("keeps valid cross-type order and removes duplicates and stale references", () => {
    const page = createInitialJournalSnapshot().myStory!.pages[0]!;
    const populated = {
      ...page,
      textBlocks: [{ id: "text", text: "Hello", role: "body" as const, color: "#171410", revision: 0, createdAt: "2026-08-20T00:00:00.000Z" }],
      links: [{ id: "link", url: "https://example.com", title: "Example", revision: 0, createdAt: "2026-08-20T00:00:00.000Z" }],
      shapes: [{ id: "shape", pageId: page.id, type: "shape" as const, shapeKind: "triangle" as const, position: { x: .2, y: .2 }, frame: { width: .2, height: .2 }, outlineWidth: 3, revision: 0, createdAt: "2026-08-20T00:00:00.000Z" }],
      renderOrder: [
        { kind: "shape" as const, id: "shape" },
        { kind: "text" as const, id: "text" },
        { kind: "shape" as const, id: "shape" },
        { kind: "photo" as const, id: "missing" },
      ],
    };

    expect(normalizedStoryRenderOrder(populated)).toEqual([
      { kind: "shape", id: "shape" },
      { kind: "text", id: "text" },
      { kind: "link", id: "link" },
    ]);
  });
});
