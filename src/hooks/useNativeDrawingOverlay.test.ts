import { describe, expect, it } from "vitest";

import { hasNativePencilKit } from "../native/pencilKit";

describe("useNativeDrawingOverlay helpers", () => {
  it("does not claim native PencilKit in the browser test environment", () => {
    expect(hasNativePencilKit()).toBe(false);
  });
});
