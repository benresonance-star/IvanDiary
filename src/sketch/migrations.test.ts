import { describe, expect, it } from "vitest";

import { migrateSketchDocument } from "./migrations";
import {
  SKETCH_SCHEMA_VERSION,
  type SketchDocument,
  type SketchStroke,
} from "./types";

describe("sketch migrations", () => {
  it("fixes legacy strokes without changing styled strokes", () => {
    const legacyStroke = {
      id: "legacy",
      tool: "pen",
      points: [{ x: 10, y: 20, pressure: 0.5, timestamp: 1 }],
      createdAt: "2026-08-03T00:00:00.000Z",
    } as SketchStroke;
    const styledStroke: SketchStroke = {
      ...legacyStroke,
      id: "styled",
      color: "#245b8a",
      width: 8,
    };
    const document: SketchDocument = {
      schemaVersion: SKETCH_SCHEMA_VERSION,
      id: "drawing",
      size: { width: 1200, height: 820 },
      strokes: [legacyStroke, styledStroke],
      revision: 2,
    };

    const migrated = migrateSketchDocument(document);

    expect(migrated.changed).toBe(true);
    expect(migrated.document.strokes).toEqual([
      { ...legacyStroke, color: "#171410", width: 4.2, opacity: 1 },
      styledStroke,
    ]);
    expect(migrated.document.revision).toBe(2);
  });

  it("keeps a valid document unchanged", () => {
    const document: SketchDocument = {
      schemaVersion: SKETCH_SCHEMA_VERSION,
      id: "drawing",
      size: { width: 1200, height: 820 },
      strokes: [],
      revision: 0,
    };

    const migrated = migrateSketchDocument(document);
    expect(migrated).toEqual({ changed: false, document });
  });
});
