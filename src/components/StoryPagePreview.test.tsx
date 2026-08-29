import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MyStoryPage } from "../domain/models";
import { BrowserSketchRepository } from "../repository/browserSketchRepository";
import { StoryPagePreview } from "./StoryPagePreview";

const timestamp = "2026-08-23T00:00:00.000Z";

function page(): MyStoryPage {
  return {
    id: "story-page", drawingDocumentId: "story-drawing", splitRatio: .62, textSide: "right",
    textBackgroundColor: "#cbd5e1", textColor: "#234567",
    textBlocks: [{ id: "title", text: "A visible title", role: "title", color: "#234567", revision: 0, createdAt: timestamp }],
    links: [{ id: "link", url: "https://example.com", title: "Example link", revision: 0, createdAt: timestamp }],
    photos: [{ id: "photo", asset: { id: "asset", localUri: "demo://photo/one", mimeType: "image/jpeg", byteLength: 1, checksum: "demo" }, size: { width: 100, height: 80 }, width: .75, revision: 0, createdAt: timestamp }],
    recordings: [],
    shapes: [{ id: "shape", pageId: "story-page", type: "shape", shapeKind: "triangle", position: { x: .1, y: .2 }, frame: { width: .3, height: .25 }, fillColor: "#abcdef", outlineColor: "#123456", outlineWidth: 4, rotationDegrees: 30, layer: "above-sketch", revision: 0, createdAt: timestamp }],
    renderOrder: [{ kind: "text", id: "title" }, { kind: "photo", id: "photo" }, { kind: "link", id: "link" }, { kind: "shape", id: "shape" }],
    revision: 0, createdAt: timestamp, updatedAt: timestamp,
  };
}

describe("StoryPagePreview", () => {
  it("reflects the story layout, content, shape geometry, and saved placement", () => {
    const { container } = render(<StoryPagePreview page={page()} sketchRepository={new BrowserSketchRepository()} />);
    expect(screen.getByText("A visible title")).toHaveStyle({ color: "#234567" });
    expect(screen.getByText("Example link")).toBeInTheDocument();
    expect(container.querySelector(".story-preview-text-background")).toHaveStyle({ left: "38%", width: "62%", backgroundColor: "#cbd5e1", zIndex: 1 });
    expect(container.querySelector(".story-preview-text-pane")).toHaveStyle({ left: "38%", width: "62%", zIndex: 50 });
    expect(container.querySelector(".story-preview-image-background")).toHaveStyle({ left: "0%", width: "38%", zIndex: 1 });
    expect(container.querySelector(".story-preview-image-pane")).toHaveStyle({ left: "0%", width: "38%", zIndex: 50 });
    expect(container.querySelector(".story-preview-photo")).toHaveStyle({ width: "75%" });
    expect(container.querySelector(".story-preview-shape")).toHaveStyle({ left: "10%", top: "20%", width: "30%", height: "25%", transform: "rotate(30deg)" });
    expect(container.querySelector(".story-preview-shape polygon")).toHaveAttribute("fill", "#abcdef");
    expect(container.querySelector(".story-preview-shape polygon")).toHaveAttribute("vector-effect", "none");
  });

  it("stacks an over-ink shape above the sketch thumbnail", () => {
    const over = {
      ...page(),
      shapes: [{
        ...page().shapes![0]!,
        inFrontOfSketch: true,
      }],
    };
    const { container } = render(
      <StoryPagePreview page={over} sketchRepository={new BrowserSketchRepository()} />,
    );
    expect(container.querySelector(".story-preview-shape")).toHaveStyle({
      zIndex: 45 + 3,
    });
  });
});
