import { afterEach, describe, expect, it, vi } from "vitest";

import { readImageSize } from "./assets";

describe("photograph assets", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the source pixel size", async () => {
    vi.stubGlobal(
      "URL",
      class {
        static createObjectURL() {
          return "blob:photo";
        }
        static revokeObjectURL() {}
      },
    );
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 1920;
        naturalHeight = 1080;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );

    await expect(readImageSize(new File(["photo"], "garden.jpg"))).resolves.toEqual({
      width: 1920,
      height: 1080,
    });
  });
});
