import { describe, expect, it } from "vitest";

import { BrowserSketchRepository } from "./browserSketchRepository";
import { SKETCH_SCHEMA_VERSION } from "../sketch/types";

describe("BrowserSketchRepository", () => {
  it("removes the stored drawing document for a deleted page", async () => {
    const repository = new BrowserSketchRepository();
    const document = {
      schemaVersion: SKETCH_SCHEMA_VERSION,
      id: "deleted-page-drawing",
      size: { width: 1200, height: 820 },
      strokes: [
        {
          id: "stroke-1",
          tool: "pen" as const,
          points: [
            {
              x: 10,
              y: 10,
              pressure: 0.5,
              timestamp: 1,
            },
          ],
          color: "#171410",
          width: 4,
          createdAt: "2026-08-14T10:00:00.000Z",
        },
      ],
      revision: 1,
    };
    await repository.save(document);

    await repository.remove(document.id);

    const reloaded = await repository.load(document.id);
    expect(reloaded.strokes).toEqual([]);
    expect(reloaded.revision).toBe(0);
  });
});
