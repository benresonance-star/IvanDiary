import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SketchSurface } from "./SketchSurface";
import type { SketchDocument, SketchRepository } from "./types";

const capabilities = {
  kind: "readonly",
  tools: [],
  fingerDrawing: false,
  pressure: false,
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SketchSurface", () => {
  it("does not reload a document when callback identities change", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const repository: SketchRepository = {
      load: vi.fn(() => new Promise<SketchDocument>(() => undefined)),
      save: vi.fn(),
    };
    const firstErrorHandler = vi.fn();
    const secondErrorHandler = vi.fn();

    const view = render(
      <SketchSurface
        capabilities={capabilities}
        documentId="drawing-one"
        onError={firstErrorHandler}
        penColor="#244A60"
        penWidth={4}
        repository={repository}
        tool="pen"
      />,
    );
    view.rerender(
      <SketchSurface
        capabilities={capabilities}
        documentId="drawing-one"
        onError={secondErrorHandler}
        penColor="#244A60"
        penWidth={4}
        repository={repository}
        tool="pen"
      />,
    );

    expect(repository.load).toHaveBeenCalledTimes(1);
  });

  it("reports a repository load failure instead of remaining busy", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const repository: SketchRepository = {
      load: vi.fn().mockRejectedValue(new Error("IndexedDB unavailable")),
      save: vi.fn(),
    };
    const onError = vi.fn();
    const view = render(
      <SketchSurface
        capabilities={capabilities}
        documentId="drawing-one"
        onError={onError}
        penColor="#244A60"
        penWidth={4}
        repository={repository}
        tool="pen"
      />,
    );

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "storage-failed",
          message: "IndexedDB unavailable",
        }),
      ),
    );
    expect(view.queryByText(/Opening page/)).not.toBeInTheDocument();
  });

  it("refreshes when another drawing layer replaces the stored document", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const initial: SketchDocument = {
      schemaVersion: 1,
      id: "drawing-one",
      size: { width: 1200, height: 820 },
      strokes: [{
        id: "legacy-stroke",
        tool: "pen",
        color: "#244A60",
        width: 4,
        createdAt: "2026-08-15T00:00:00.000Z",
        points: [{ x: 20, y: 30, pressure: 0.5, timestamp: 1 }],
      }],
      revision: 1,
    };
    const migrated = { ...initial, strokes: [], revision: 2 };
    let notify: (() => void) | undefined;
    const repository: SketchRepository = {
      load: vi.fn()
        .mockResolvedValueOnce(initial)
        .mockResolvedValueOnce(migrated),
      save: vi.fn(),
      subscribe: vi.fn((_documentId, listener) => {
        notify = listener;
        return vi.fn();
      }),
    };
    const onSaveHealthChange = vi.fn();
    render(
      <SketchSurface
        capabilities={capabilities}
        documentId="drawing-one"
        onSaveHealthChange={onSaveHealthChange}
        penColor="#244A60"
        penWidth={4}
        repository={repository}
        tool="pen"
      />,
    );
    await waitFor(() => expect(repository.load).toHaveBeenCalledTimes(1));

    notify?.();

    await waitFor(() =>
      expect(onSaveHealthChange).toHaveBeenCalledWith(
        expect.objectContaining({ durableRevision: 2 }),
      ),
    );
    expect(repository.load).toHaveBeenCalledTimes(2);
  });
});
