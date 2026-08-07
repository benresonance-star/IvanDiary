import { describe, expect, it } from "vitest";

import {
  buildMonthGrid,
  localDateKey,
  parseLocalDateKey,
  shiftMonth,
} from "./date";

describe("date helpers", () => {
  it("formats and parses local date keys", () => {
    expect(localDateKey(new Date(2026, 7, 8))).toBe("2026-08-08");
    expect(parseLocalDateKey("2026-08-08").getDate()).toBe(8);
  });

  it("builds a Monday-first month grid with today marked", () => {
    const cells = buildMonthGrid(2026, 7, new Date(2026, 7, 8));
    expect(cells).toHaveLength(42);
    expect(cells[0]?.dateKey).toBe("2026-07-27");
    const today = cells.find((cell) => cell.dateKey === "2026-08-08");
    expect(today?.isToday).toBe(true);
    expect(today?.inMonth).toBe(true);
  });

  it("shifts months across year boundaries", () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({
      year: 2025,
      monthIndex: 11,
    });
  });
});
