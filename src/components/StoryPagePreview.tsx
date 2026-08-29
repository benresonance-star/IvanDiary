import type { CSSProperties, ReactNode } from "react";

import { isInFrontOfSketch } from "../domain/inkStack";
import { normalizedStoryRenderOrder, storyStackIndex } from "../domain/storyRenderOrder";
import type { MyStoryPage } from "../domain/models";
import type { SketchRepository } from "../sketch/types";
import { displayAssetUri } from "../utils/displayAssetUri";
import { VOICE_FRAME } from "./arrangeGeometry";
import { canvasObjectZIndex } from "./canvasObjectStack";
import { ShapeCard } from "./ShapeCard";
import { SketchThumbnail } from "./SketchThumbnail";

function storyText(block: MyStoryPage["textBlocks"][number], color: string) {
  const style = { color };
  if (block.role === "title") return <h1 style={style}>{block.text}</h1>;
  if (block.role === "heading") return <h2 style={style}>{block.text}</h2>;
  return <p style={style}>{block.text}</p>;
}

function positionedStyle(item: { position?: { x: number; y: number }; frame?: { width: number; height: number }; layer?: "above-sketch" | "behind-sketch"; inFrontOfSketch?: boolean }, stackIndex: number): CSSProperties {
  const position = item.position ?? { x: .06, y: .7 };
  const frame = item.frame ?? VOICE_FRAME;
  return {
    height: `${frame.height * 100}%`,
    left: `${position.x * 100}%`,
    top: `${position.y * 100}%`,
    width: `${frame.width * 100}%`,
    zIndex: canvasObjectZIndex(stackIndex, isInFrontOfSketch(item)),
  };
}

export function StoryPagePreview({ className = "", page, sketchRepository }: {
  className?: string;
  page: MyStoryPage;
  sketchRepository: SketchRepository;
}) {
  const ordered = normalizedStoryRenderOrder(page);
  const textWidth = page.splitRatio * 100;
  const imageWidth = 100 - textWidth;
  const textLeft = page.textSide === "left" ? 0 : imageWidth;
  const imageLeft = page.textSide === "left" ? textWidth : 0;
  const stack = (kind: Parameters<typeof storyStackIndex>[1], id: string) => 1 + storyStackIndex(page, kind, id);
  const renderCanvasObject = (item: (typeof ordered)[number]): ReactNode => {
    if (item.kind === "shape") {
      const shape = (page.shapes ?? []).find(({ id }) => id === item.id);
      if (!shape) return null;
      return <span className="story-preview-positioned story-preview-shape" key={`shape:${shape.id}`} style={{ ...positionedStyle(shape, storyStackIndex(page, "shape", shape.id)), transform: `rotate(${shape.rotationDegrees ?? 0}deg)` }}><ShapeCard preview shape={shape} /></span>;
    }
    if (item.kind === "recording") {
      const recording = page.recordings.find(({ id }) => id === item.id);
      if (!recording) return null;
      return <span className="story-preview-positioned story-preview-voice" key={`recording:${recording.id}`} style={positionedStyle(recording, storyStackIndex(page, "recording", recording.id))} />;
    }
    return null;
  };
  const canvasItemInFront = (item: (typeof ordered)[number]) => {
    if (item.kind === "shape") {
      return isInFrontOfSketch((page.shapes ?? []).find(({ id }) => id === item.id) ?? {});
    }
    if (item.kind === "recording") {
      return isInFrontOfSketch(page.recordings.find(({ id }) => id === item.id) ?? {});
    }
    return false;
  };

  return <span aria-hidden="true" className={`diary-page-preview story-page-preview ${className}`}>
    {ordered.map((item) => canvasItemInFront(item) ? null : renderCanvasObject(item))}
    <SketchThumbnail documentId={page.drawingDocumentId} repository={sketchRepository} />
    {ordered.map((item) => canvasItemInFront(item) ? renderCanvasObject(item) : null)}
    <span className="story-preview-pane story-preview-text-pane" style={{ backgroundColor: page.textBackgroundColor, left: `${textLeft}%`, width: `${textWidth}%` }}>
      {page.textBlocks.map((block) => <span className={`story-preview-text story-preview-text-${block.role}`} key={block.id} style={{ zIndex: stack("text", block.id) }}>{storyText(block, page.textColor)}</span>)}
      {page.links.map((link) => <span className="story-preview-link" key={link.id} style={{ zIndex: stack("link", link.id) }}>{link.title}</span>)}
    </span>
    <span className="story-preview-pane story-preview-image-pane" style={{ left: `${imageLeft}%`, width: `${imageWidth}%` }}>
      {page.photos.map((photo) => <img alt="" className="story-preview-photo" key={photo.id} src={displayAssetUri(photo.asset.localUri)} style={{ width: `${photo.width * 100}%`, zIndex: stack("photo", photo.id) }} />)}
    </span>
  </span>;
}
