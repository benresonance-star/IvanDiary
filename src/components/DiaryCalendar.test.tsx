import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DiaryCalendar } from "./DiaryCalendar";

describe("DiaryCalendar", () => {
  it("opens the month view and selects a day with an entry marker", () => {
    const onSelectDate = vi.fn();
    render(
      <DiaryCalendar
        entryDates={new Set(["2026-08-03"])}
        onSelectDate={onSelectDate}
        selectedDate="2026-08-07"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open diary calendar" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Diary calendar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "2026-08-03, has diary entries",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "2026-08-03, has diary entries",
      }),
    );
    expect(onSelectDate).toHaveBeenCalledWith("2026-08-03");
  });
});
