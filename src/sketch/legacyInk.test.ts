import { describe, expect, it } from "vitest";

import { toLegacyInkDocument } from "./legacyInk";
import type { SketchDocument } from "./types";

describe("toLegacyInkDocument", () => {
  it("serialises pen strokes for native import", () => {
    const document: SketchDocument = {
      schemaVersion: 1,
      id: "drawing-one",
      size: { width: 1200, height: 820 },
      revision: 2,
      strokes: [
        {
          id: "stroke-one",
          tool: "pen",
          color: "#244A60",
          width: 4,
          createdAt: "2026-08-07T00:00:00.000Z",
          points: [
            { x: 10, y: 20, pressure: 0.4, timestamp: 1000 },
            { x: 18, y: 28, pressure: 0.6, timestamp: 1016 },
          ],
        },
      ],
    };

    expect(toLegacyInkDocument(document)).toEqual({
      width: 1200,
      height: 820,
      strokes: [
        {
          color: "#244A60",
          width: 4,
          points: [
            { x: 10, y: 20, pressure: 0.4, timestamp: 1000 },
            { x: 18, y: 28, pressure: 0.6, timestamp: 1016 },
          ],
        },
      ],
    });
  });

  it("returns undefined when there are no pen strokes", () => {
    const document: SketchDocument = {
      schemaVersion: 1,
      id: "drawing-one",
      size: { width: 1200, height: 820 },
      revision: 0,
      strokes: [],
    };
    expect(toLegacyInkDocument(document)).toBeUndefined();
  });
});
