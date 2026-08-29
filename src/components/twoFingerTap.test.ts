import { describe, expect, it } from "vitest";

import {
  TwoFingerTapRecognizer,
  type TouchPointerSample,
} from "./twoFingerTap";

const touch = (
  pointerId: number,
  timeStamp: number,
  clientX = pointerId * 10,
  clientY = pointerId * 10,
): TouchPointerSample => ({
  pointerId,
  pointerType: "touch",
  clientX,
  clientY,
  timeStamp,
});

describe("TwoFingerTapRecognizer", () => {
  it("recognizes a quick, stationary two-finger tap", () => {
    const recognizer = new TwoFingerTapRecognizer();

    recognizer.pointerDown(touch(1, 100));
    recognizer.pointerDown(touch(2, 150));

    expect(recognizer.pointerUp(touch(1, 220))).toBe(false);
    expect(recognizer.pointerUp(touch(2, 240))).toBe(true);
  });

  it("rejects movement beyond the tap threshold", () => {
    const recognizer = new TwoFingerTapRecognizer();

    recognizer.pointerDown(touch(1, 100, 20, 20));
    recognizer.pointerDown(touch(2, 130, 40, 40));
    recognizer.pointerMove(touch(1, 160, 40, 20));

    expect(recognizer.pointerUp(touch(1, 180, 40, 20))).toBe(false);
    expect(recognizer.pointerUp(touch(2, 200, 40, 40))).toBe(false);
  });

  it("rejects touches that do not begin close together", () => {
    const recognizer = new TwoFingerTapRecognizer();

    recognizer.pointerDown(touch(1, 100));
    recognizer.pointerDown(touch(2, 300));

    expect(recognizer.pointerUp(touch(1, 320))).toBe(false);
    expect(recognizer.pointerUp(touch(2, 330))).toBe(false);
  });

  it("rejects a single-finger tap", () => {
    const recognizer = new TwoFingerTapRecognizer();

    recognizer.pointerDown(touch(1, 100));

    expect(recognizer.pointerUp(touch(1, 180))).toBe(false);
  });

  it("rejects cancellation and more than two contacts", () => {
    const recognizer = new TwoFingerTapRecognizer();

    recognizer.pointerDown(touch(1, 100));
    recognizer.pointerDown(touch(2, 120));
    recognizer.pointerDown(touch(3, 140));
    recognizer.pointerCancel(touch(3, 150));

    expect(recognizer.pointerUp(touch(1, 170))).toBe(false);
    expect(recognizer.pointerUp(touch(2, 180))).toBe(false);
  });
});
