import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as pencilKit from "../native/pencilKit";
import type { SketchRepository } from "../sketch/types";
import { SketchThumbnail } from "./SketchThumbnail";

describe("SketchThumbnail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reloads when the saved drawing changes", async () => {
    const context = {
      clearRect: vi.fn(),
      setTransform: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context,
    );
    let notify: () => void = () => undefined;
    const load = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      id: "drawing-one",
      size: { width: 1200, height: 820 },
      strokes: [],
      revision: 0,
    });
    const repository: SketchRepository = {
      load,
      save: vi.fn(),
      subscribe: (_documentId, listener) => {
        notify = listener;
        return vi.fn();
      },
    };

    render(
      <SketchThumbnail
        documentId="drawing-one"
        repository={repository}
      />,
    );
    await waitFor(() => expect(load).toHaveBeenCalledOnce());

    act(() => notify());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it("hides the web fallback after the native preview becomes available", async () => {
    vi.spyOn(pencilKit, "hasNativePencilKit").mockReturnValue(true);
    vi.spyOn(pencilKit, "getNativeDrawingPreview").mockResolvedValue({
      saved: true,
      available: true,
      previewSrc: "capacitor://localhost/story-preview.png",
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      setTransform: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const repository: SketchRepository = {
      load: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        id: "drawing-one",
        size: { width: 1200, height: 820 },
        strokes: [],
        revision: 0,
      }),
      save: vi.fn(),
    };

    const { container } = render(
      <SketchThumbnail documentId="drawing-one" repository={repository} />,
    );

    await waitFor(() => expect(
      container.querySelector(".sketch-thumbnail"),
    ).not.toBeInTheDocument());
    expect(container.querySelector(".native-sketch-thumbnail")).toHaveAttribute(
      "src",
      "capacitor://localhost/story-preview.png",
    );
  });
});
