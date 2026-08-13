import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FavouriteConfirmation } from "./FavouriteConfirmation";

describe("FavouriteConfirmation", () => {
  afterEach(() => vi.useRealTimers());

  it("announces and automatically dismisses favourite feedback", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<FavouriteConfirmation message="Added to Your Favourites" onDone={onDone} />);

    expect(screen.getByRole("status")).toHaveTextContent("Added to Your Favourites");
    act(() => vi.advanceTimersByTime(1_800));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
