import { describe, expect, it } from "vitest";

import { createInitialJournalSnapshot } from "../domain/initialState";
import { readableDiaryText } from "./diaryExport";

describe("readableDiaryText", () => {
  it("includes the user-facing sections and drawing references", () => {
    const text = readableDiaryText(
      createInitialJournalSnapshot(new Date("2026-08-18T10:00:00Z")),
    );

    expect(text).toContain("iPad App — Complete Diary Export");
    expect(text).toContain("WELCOME");
    expect(text).toContain("JOURNAL — 2026-08-18");
    expect(text).toContain("SKETCHBOOK — Favourite Places");
    expect(text).toContain("MY STORY");
    expect(text).toContain("PencilKit drawings");
  });
});
