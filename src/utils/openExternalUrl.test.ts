import { afterEach, describe, expect, it, vi } from "vitest";

import { openExternalUrl } from "./openExternalUrl";

describe("openExternalUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens http links in a new browsing context", () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    openExternalUrl("https://example.com/garden");
    expect(open).toHaveBeenCalledWith(
      "https://example.com/garden",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("ignores addresses that are not web links", () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    openExternalUrl("javascript:alert(1)");
    openExternalUrl("not a url");
    expect(open).not.toHaveBeenCalled();
  });
});
