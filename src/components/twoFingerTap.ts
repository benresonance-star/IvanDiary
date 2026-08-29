export type TouchPointerSample = {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  timeStamp: number;
};

type ActiveTouch = {
  startX: number;
  startY: number;
};

const MAX_SECOND_TOUCH_DELAY_MS = 180;
const MAX_GESTURE_DURATION_MS = 350;
const MAX_MOVEMENT_PX = 12;

export class TwoFingerTapRecognizer {
  readonly #activeTouches = new Map<number, ActiveTouch>();
  #contactCount = 0;
  #firstTouchAt = 0;
  #invalid = false;
  #reachedTwoTouches = false;

  pointerDown(sample: TouchPointerSample): void {
    if (sample.pointerType !== "touch") return;
    if (this.#activeTouches.size === 0) {
      this.reset();
      this.#firstTouchAt = sample.timeStamp;
    }
    this.#contactCount += 1;
    this.#activeTouches.set(sample.pointerId, {
      startX: sample.clientX,
      startY: sample.clientY,
    });
    if (this.#contactCount > 2) {
      this.#invalid = true;
    }
    if (this.#activeTouches.size === 2) {
      this.#reachedTwoTouches = true;
      if (
        sample.timeStamp - this.#firstTouchAt >
        MAX_SECOND_TOUCH_DELAY_MS
      ) {
        this.#invalid = true;
      }
    }
  }

  pointerMove(sample: TouchPointerSample): void {
    if (sample.pointerType !== "touch") return;
    const touch = this.#activeTouches.get(sample.pointerId);
    if (!touch) return;
    if (
      Math.hypot(
        sample.clientX - touch.startX,
        sample.clientY - touch.startY,
      ) > MAX_MOVEMENT_PX
    ) {
      this.#invalid = true;
    }
  }

  pointerUp(sample: TouchPointerSample): boolean {
    if (sample.pointerType !== "touch") return false;
    this.pointerMove(sample);
    this.#activeTouches.delete(sample.pointerId);
    if (this.#activeTouches.size > 0) return false;
    const recognized =
      this.#reachedTwoTouches &&
      !this.#invalid &&
      sample.timeStamp - this.#firstTouchAt <= MAX_GESTURE_DURATION_MS;
    this.reset();
    return recognized;
  }

  pointerCancel(sample: Pick<TouchPointerSample, "pointerId" | "pointerType">): void {
    if (sample.pointerType !== "touch") return;
    this.#invalid = true;
    this.#activeTouches.delete(sample.pointerId);
    if (this.#activeTouches.size === 0) {
      this.reset();
    }
  }

  reset(): void {
    this.#activeTouches.clear();
    this.#contactCount = 0;
    this.#firstTouchAt = 0;
    this.#invalid = false;
    this.#reachedTwoTouches = false;
  }
}
