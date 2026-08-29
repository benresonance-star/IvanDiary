import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SketchDocument, SketchRepository } from "../sketch/types";
import { ProfilePortrait } from "./ProfilePortrait";

vi.mock("./SketchThumbnail", () => ({
  SketchThumbnail: () => <span data-testid="portrait-preview" />,
}));

function repository(strokeCount: number): SketchRepository {
  return {
    load: vi.fn(async (id: string): Promise<SketchDocument> => ({
      schemaVersion: 1,
      id,
      size: { width: 900, height: 900 },
      strokes: Array.from({ length: strokeCount }, (_, index) => ({
        id: `stroke-${index}`,
        tool: "pen" as const,
        points: [{ x: 1, y: 1, pressure: 0.5, timestamp: 1 }],
        color: "#171410",
        width: 4,
        createdAt: "2026-08-10T00:00:00.000Z",
      })),
      revision: strokeCount,
    })),
    save: vi.fn(),
  };
}

describe("ProfilePortrait", () => {
  it("keeps the fallback head when no portrait has been drawn", async () => {
    const { container } = render(<ProfilePortrait sketchRepository={repository(0)} />);
    await waitFor(() => expect(container.querySelector(".profile-portrait-fallback")).toBeInTheDocument());
  });

  it("removes the fallback head when portrait strokes exist", async () => {
    const { container } = render(<ProfilePortrait sketchRepository={repository(1)} />);
    await waitFor(() => expect(container.querySelector(".profile-portrait-fallback")).not.toBeInTheDocument());
  });
});
