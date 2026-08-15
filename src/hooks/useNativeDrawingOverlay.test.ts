import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { hasNativePencilKit } from "../native/pencilKit";
import type { SketchDocument, SketchRepository } from "../sketch/types";
import {
  NativeDrawingOverlayCoordinator,
  type NativeDrawingOverlayOperations,
  type NativeDrawingOverlayRequest,
} from "./nativeDrawingOverlayCoordinator";
import { shouldReserveNativeDrawingInput } from "./useNativeDrawingOverlay";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function fixture() {
  const document: SketchDocument = {
    schemaVersion: 1,
    id: "drawing-one",
    size: { width: 1200, height: 820 },
    strokes: [],
    revision: 0,
  };
  const sketchRepository: SketchRepository = {
    load: vi.fn().mockResolvedValue(document),
    save: vi.fn().mockResolvedValue({
      localDurability: "saved",
      remoteSync: "offline",
      durableRevision: 1,
      pendingOperationCount: 0,
    }),
  };
  const owner = Symbol("test-owner");
  const request: NativeDrawingOverlayRequest = {
    owner,
    documentId: document.id,
    color: "#244A60",
    width: 4,
    opacity: 1,
    tool: "pen",
    rect: { x: 0, y: 80, width: 800, height: 920 },
    sketchRepository,
  };
  return { document, owner, request, sketchRepository };
}

function operations(
  show: NativeDrawingOverlayOperations["show"] = vi
    .fn()
    .mockResolvedValue({ importedLegacyStrokes: false }),
) {
  return {
    hide: vi.fn().mockResolvedValue({}),
    show,
    update: vi.fn().mockResolvedValue(undefined),
  } satisfies NativeDrawingOverlayOperations;
}

describe("useNativeDrawingOverlay helpers", () => {
  it("does not claim native PencilKit in the browser test environment", () => {
    expect(hasNativePencilKit()).toBe(false);
  });

  it("reserves input during native presentation but falls back after failure", () => {
    expect(shouldReserveNativeDrawingInput(true, true, false)).toBe(true);
    expect(shouldReserveNativeDrawingInput(true, true, true)).toBe(false);
    expect(shouldReserveNativeDrawingInput(true, false, false)).toBe(false);
    expect(shouldReserveNativeDrawingInput(false, true, false)).toBe(false);
  });

  it("updates pen and eraser in place without hiding the overlay", async () => {
    const native = operations();
    const coordinator = new NativeDrawingOverlayCoordinator(native);
    const { request } = fixture();

    coordinator.request(request);
    await waitFor(() => expect(coordinator.state.active).toBe(true));

    coordinator.request({ ...request, tool: "eraser" });
    await waitFor(() =>
      expect(native.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ tool: "eraser" }),
      ),
    );
    expect(native.show).toHaveBeenCalledTimes(1);
    expect(native.hide).not.toHaveBeenCalled();
    expect(coordinator.state.active).toBe(true);
  });

  it("applies the latest tool before acknowledging a pending presentation", async () => {
    const pendingShow = deferred<{ importedLegacyStrokes: boolean }>();
    const native = operations(vi.fn(() => pendingShow.promise));
    const coordinator = new NativeDrawingOverlayCoordinator(native);
    const { owner, request } = fixture();

    coordinator.request(request);
    await waitFor(() => expect(native.show).toHaveBeenCalledTimes(1));
    coordinator.request({ ...request, tool: "eraser" });
    expect(coordinator.state.active).toBe(false);

    pendingShow.resolve({ importedLegacyStrokes: false });
    await waitFor(() =>
      expect(native.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ tool: "eraser" }),
      ),
    );
    await waitFor(() =>
      expect(coordinator.state).toEqual({
        active: true,
        documentId: "drawing-one",
        owner,
      }),
    );
    expect(native.hide).not.toHaveBeenCalled();
  });

  it("reports a failed presentation to release the web drawing fallback", async () => {
    const native = operations(
      vi.fn().mockRejectedValue(new Error("presentation failed")),
    );
    const coordinator = new NativeDrawingOverlayCoordinator(native);
    const { owner, request } = fixture();

    coordinator.request(request);

    await waitFor(() =>
      expect(coordinator.state).toEqual({
        active: false,
        documentId: "drawing-one",
        failed: true,
        owner,
      }),
    );
  });

  it("hides a presentation that completes after its owner releases it", async () => {
    const pendingShow = deferred<{ importedLegacyStrokes: boolean }>();
    const native = operations(vi.fn(() => pendingShow.promise));
    const coordinator = new NativeDrawingOverlayCoordinator(native);
    const { owner, request } = fixture();

    coordinator.request(request);
    await waitFor(() => expect(native.show).toHaveBeenCalledTimes(1));
    coordinator.release(owner);
    pendingShow.resolve({ importedLegacyStrokes: false });

    await waitFor(() => expect(native.hide).toHaveBeenCalledWith("drawing-one"));
    await waitFor(() => expect(coordinator.state).toEqual({ active: false }));
  });

  it("waits for the active overlay to hide before app UI opens above it", async () => {
    const native = operations();
    const coordinator = new NativeDrawingOverlayCoordinator(native);
    const { request } = fixture();

    coordinator.request(request);
    await waitFor(() => expect(coordinator.state.active).toBe(true));

    await expect(coordinator.suspendAndWait()).resolves.toBe(true);
    expect(native.hide).toHaveBeenCalledWith("drawing-one");
    expect(coordinator.state).toEqual({ active: false });
  });

  it("hides the previous document before presenting a replacement", async () => {
    const native = operations();
    const coordinator = new NativeDrawingOverlayCoordinator(native);
    const { owner, request } = fixture();

    coordinator.request(request);
    await waitFor(() => expect(coordinator.state.active).toBe(true));
    coordinator.request({
      ...request,
      documentId: "drawing-two",
    });

    await waitFor(() =>
      expect(native.hide).toHaveBeenCalledWith("drawing-one"),
    );
    await waitFor(() => expect(native.show).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(coordinator.state).toEqual({
        active: true,
        documentId: "drawing-two",
        owner,
      }),
    );
  });

  it("clears legacy strokes only after native import is confirmed", async () => {
    const pendingShow = deferred<{ importedLegacyStrokes: boolean }>();
    const native = operations(vi.fn(() => pendingShow.promise));
    const coordinator = new NativeDrawingOverlayCoordinator(native);
    const fixtureValues = fixture();
    const documentWithInk: SketchDocument = {
      ...fixtureValues.document,
      strokes: [
        {
          id: "stroke-one",
          tool: "pen",
          color: "#244A60",
          width: 4,
          createdAt: "2026-08-08T00:00:00.000Z",
          points: [
            {
              x: 20,
              y: 30,
              pressure: 0.5,
              timestamp: 1,
            },
          ],
        },
      ],
    };
    vi.mocked(fixtureValues.sketchRepository.load).mockResolvedValue(
      documentWithInk,
    );

    coordinator.request(fixtureValues.request);
    await waitFor(() => expect(native.show).toHaveBeenCalledTimes(1));
    expect(fixtureValues.sketchRepository.save).not.toHaveBeenCalled();

    pendingShow.resolve({ importedLegacyStrokes: true });
    await waitFor(() =>
      expect(fixtureValues.sketchRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ strokes: [], revision: 1 }),
      ),
    );
  });
});
