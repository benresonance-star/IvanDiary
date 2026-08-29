import { describe, expect, it } from "vitest";

import { workspacePageTool } from "./App";

describe("workspacePageTool", () => {
  it("suppresses drawing while the Welcome screen is visible", () => {
    expect(workspacePageTool("pen", true, false)).toBe("view");
    expect(workspacePageTool("eraser", true, false)).toBe("view");
  });

  it("suppresses the page drawing overlay during Welcome preview", () => {
    expect(workspacePageTool("pen", false, true)).toBe("view");
  });

  it("restores the selected tool after Welcome closes", () => {
    expect(workspacePageTool("pen", false, false)).toBe("pen");
    expect(workspacePageTool("eraser", false, false)).toBe("eraser");
    expect(workspacePageTool("arrange", false, false)).toBe("arrange");
  });
});
