import { describe, expect, it } from "vitest";

import type { Page, TextObject } from "./models";
import {
  displayedTextLayout,
  materializeLegacyTextStack,
} from "./textLayout";

const text: TextObject = {
  id: "text-1",
  type: "text",
  pageId: "page-1",
  position: { x: 0.3, y: 0.25 },
  frame: { width: 0.4, height: 0.2 },
  createdAt: "2026-08-29T00:00:00.000Z",
  revision: 0,
  text: "Words",
  textScale: 1,
};

describe("independent text layout", () => {
  it("preserves free text geometry within the canvas", () => {
    expect(displayedTextLayout(text)).toEqual({
      position: { x: 0.3, y: 0.25 },
      frame: text.frame,
    });
  });

  it("flattens legacy members in reading order without copying column appearance", () => {
    const second = { ...text, id: "text-2", text: "More words" };
    const page = {
      schemaVersion: 1,
      id: "page-1",
      paperStyle: "clean-paper",
      drawingDocumentId: "drawing-1",
      objects: [text, second],
      textStack: {
        position: { x: 0.1, y: 0.1 },
        frame: { width: 0.5, height: 0.6 },
        memberIds: [second.id, text.id],
        dock: "right",
        backgroundColor: "#ffffff",
      },
      revision: 0,
      createdAt: text.createdAt,
      updatedAt: text.createdAt,
    } satisfies Page;

    const migrated = materializeLegacyTextStack(page, true);
    const firstVisual = migrated.objects.find(({ id }) => id === second.id);
    const secondVisual = migrated.objects.find(({ id }) => id === text.id);
    expect(migrated).not.toHaveProperty("textStack");
    expect(firstVisual).toEqual(expect.objectContaining({
      position: { x: 0.48, y: 0.04 },
    }));
    expect(firstVisual).not.toHaveProperty("dock");
    expect(secondVisual?.position.y).toBeGreaterThan(firstVisual?.position.y ?? 1);
    expect(firstVisual).not.toHaveProperty("backgroundColor");
  });
});
