import { describe, expect, it } from "vitest";

import {
  canMoveInkStack,
  isInFrontOfSketch,
  resolveInkStackMove,
  withInFrontOfSketch,
} from "./inkStack";

describe("ink stack bands", () => {
  it("treats a missing or false flag as under ink", () => {
    expect(isInFrontOfSketch({})).toBe(false);
    expect(isInFrontOfSketch({ inFrontOfSketch: false })).toBe(false);
    expect(isInFrontOfSketch({ inFrontOfSketch: true })).toBe(true);
  });

  it("promotes the only under-ink object on first forward and demotes on backward", () => {
    const items = [{ id: "text-one", type: "text" }];
    expect(resolveInkStackMove(items, "text-one", 1)).toEqual({
      kind: "promote",
    });
    const promoted = { id: "text-one", type: "text", inFrontOfSketch: true };
    expect(resolveInkStackMove([promoted], "text-one", -1)).toEqual({
      kind: "demote",
    });
    expect(canMoveInkStack(items, "text-one", -1)).toBe(false);
    expect(canMoveInkStack([promoted], "text-one", 1)).toBe(false);
  });

  it("reorders inside a band without changing the other band", () => {
    const items = [
      { id: "under-a", type: "text" },
      { id: "under-b", type: "photo" },
      { id: "over-c", type: "shape", inFrontOfSketch: true },
    ];
    expect(resolveInkStackMove(items, "under-a", 1)).toEqual({
      kind: "reorder",
      neighborId: "under-b",
    });
    expect(resolveInkStackMove(items, "under-b", 1)).toEqual({
      kind: "promote",
    });
    expect(resolveInkStackMove(items, "over-c", -1)).toEqual({
      kind: "demote",
    });
  });

  it("omits the durable field when demoting", () => {
    const promoted = withInFrontOfSketch(
      { id: "text-one", inFrontOfSketch: true },
      true,
    );
    expect(promoted).toEqual({ id: "text-one", inFrontOfSketch: true });
    expect(withInFrontOfSketch(promoted, false)).toEqual({ id: "text-one" });
  });
});
