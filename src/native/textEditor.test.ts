import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  available: true,
  open: vi.fn(),
  platform: "ios",
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => bridge.platform,
    isPluginAvailable: () => bridge.available,
  },
  registerPlugin: () => ({ open: bridge.open }),
}));

import { hasNativeTextEditor, openNativeTextEditor } from "./textEditor";

describe("native text editor bridge", () => {
  beforeEach(() => {
    bridge.available = true;
    bridge.platform = "ios";
    bridge.open.mockReset();
  });

  it("requires both iOS and the registered native plugin", () => {
    expect(hasNativeTextEditor()).toBe(true);
    bridge.platform = "web";
    expect(hasNativeTextEditor()).toBe(false);
    bridge.platform = "ios";
    bridge.available = false;
    expect(hasNativeTextEditor()).toBe(false);
  });

  it("normalizes bridge input and returns a valid result", async () => {
    bridge.open.mockResolvedValue({ cancelled: false, text: "Hello" });

    await expect(
      openNativeTextEditor({
        initialText: "",
        mode: "add",
        contextualStrings: [" Ivan ", "", ...Array(110).fill("word")],
        recordingLimitMilliseconds: 100,
      }),
    ).resolves.toEqual({ cancelled: false, text: "Hello" });

    expect(bridge.open).toHaveBeenCalledWith({
      initialText: "",
      mode: "add",
      contextualStrings: expect.arrayContaining(["Ivan"]),
      recordingLimitMilliseconds: 1_000,
    });
    expect(
      bridge.open.mock.calls[0]?.[0].contextualStrings,
    ).toHaveLength(100);
  });

  it("preserves cancellation", async () => {
    bridge.open.mockResolvedValue({ cancelled: true, text: "Draft" });

    await expect(
      openNativeTextEditor({
        initialText: "Draft",
        mode: "edit",
        contextualStrings: [],
      }),
    ).resolves.toEqual({ cancelled: true, text: "Draft" });
  });

  it("rejects malformed native responses", async () => {
    bridge.open.mockResolvedValue({ text: 42 });

    await expect(
      openNativeTextEditor({
        initialText: "",
        mode: "add",
        contextualStrings: [],
      }),
    ).rejects.toThrow("invalid result");
  });
});
