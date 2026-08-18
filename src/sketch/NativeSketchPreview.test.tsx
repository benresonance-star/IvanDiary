import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as pencilKit from "../native/pencilKit";
import { NativeSketchPreview } from "./NativeSketchPreview";

describe("NativeSketchPreview", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a native preview and refreshes after a drawing update", async () => {
    vi.spyOn(pencilKit, "hasNativePencilKit").mockReturnValue(true);
    const getPreview = vi
      .spyOn(pencilKit, "getNativeDrawingPreview")
      .mockResolvedValueOnce({
        saved: true,
        available: true,
        previewSrc: "capacitor://localhost/preview-one.png",
      })
      .mockResolvedValueOnce({
        saved: true,
        available: true,
        previewSrc: "capacitor://localhost/preview-two.png",
      });

    const { container } = render(
      <NativeSketchPreview documentId="drawing-one" />,
    );

    await waitFor(() =>
      expect(container.querySelector("img")?.getAttribute("src")).toBe(
        "capacitor://localhost/preview-one.png",
      ),
    );

    act(() => {
      globalThis.dispatchEvent(
        new CustomEvent(pencilKit.NATIVE_DRAWING_UPDATED_EVENT, {
          detail: { documentId: "drawing-one" },
        }),
      );
    });

    await waitFor(() =>
      expect(container.querySelector("img")?.getAttribute("src")).toBe(
        "capacitor://localhost/preview-two.png",
      ),
    );
    expect(getPreview).toHaveBeenCalledTimes(2);
  });

  it("renders nothing when PencilKit is unavailable", () => {
    vi.spyOn(pencilKit, "hasNativePencilKit").mockReturnValue(false);
    const { container } = render(
      <NativeSketchPreview documentId="drawing-one" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offsets the preview to match the draw-mode overlay inset", async () => {
    vi.spyOn(pencilKit, "hasNativePencilKit").mockReturnValue(true);
    vi.spyOn(pencilKit, "getNativeDrawingPreview").mockResolvedValue({
      saved: true,
      available: true,
      previewSrc: "capacitor://localhost/preview.png",
    });

    const { container } = render(
      <NativeSketchPreview
        contentInsetTop={64}
        documentId="drawing-one"
      />,
    );

    await waitFor(() =>
      expect(container.querySelector("img")).not.toBeNull(),
    );
    expect(container.querySelector("img")).toHaveStyle({
      top: "64px",
      height: "calc(100% - 64px)",
    });
  });

  it("renders thumbnails from source canvas coordinates", async () => {
    vi.spyOn(pencilKit, "hasNativePencilKit").mockReturnValue(true);
    const getPreview = vi
      .spyOn(pencilKit, "getNativeDrawingPreview")
      .mockResolvedValue({ saved: true, available: false });

    render(
      <NativeSketchPreview
        documentId="drawing-one"
        renderSize={{ width: 1200, height: 820 }}
      />,
    );

    await waitFor(() =>
      expect(getPreview).toHaveBeenCalledWith("drawing-one", {
        width: 1200,
        height: 820,
      }),
    );
  });
});
