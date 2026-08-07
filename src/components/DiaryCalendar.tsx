import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import {
  buildMonthGrid,
  localDateKey,
  parseLocalDateKey,
  shiftMonth,
} from "../utils/date";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function DiaryCalendar({
  entryDates,
  onOpen,
  onSelectDate,
  selectedDate,
}: {
  entryDates: ReadonlySet<string>;
  onOpen?: () => void;
  onSelectDate: (dateKey: string) => void;
  selectedDate: string;
}) {
  const todayKey = localDateKey(new Date());
  const selected = parseLocalDateKey(selectedDate);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState({
    year: selected.getFullYear(),
    monthIndex: selected.getMonth(),
  });

  const cells = useMemo(
    () => buildMonthGrid(visibleMonth.year, visibleMonth.monthIndex),
    [visibleMonth.monthIndex, visibleMonth.year],
  );

  const monthLabel = new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
  }).format(new Date(visibleMonth.year, visibleMonth.monthIndex, 1));

  const jumpToToday = () => {
    const today = new Date();
    setVisibleMonth({
      year: today.getFullYear(),
      monthIndex: today.getMonth(),
    });
    onSelectDate(todayKey);
    setOpen(false);
  };

  return (
    <div className="diary-calendar">
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open diary calendar"
        className="diary-calendar-trigger"
        onClick={() => {
          setVisibleMonth({
            year: selected.getFullYear(),
            monthIndex: selected.getMonth(),
          });
          setOpen((current) => {
            const next = !current;
            if (next) {
              onOpen?.();
            }
            return next;
          });
        }}
        type="button"
      >
        <CalendarDays aria-hidden="true" />
      </button>

      {open ? (
        <>
          <button
            aria-label="Close diary calendar"
            className="diary-calendar-backdrop"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div
            aria-label="Diary calendar"
            className="diary-calendar-popover"
            role="dialog"
          >
            <div className="diary-calendar-header">
              <button
                aria-label="Previous month"
                className="diary-calendar-nav"
                onClick={() =>
                  setVisibleMonth((current) =>
                    shiftMonth(current.year, current.monthIndex, -1),
                  )
                }
                type="button"
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <h2>{monthLabel}</h2>
              <button
                aria-label="Next month"
                className="diary-calendar-nav"
                onClick={() =>
                  setVisibleMonth((current) =>
                    shiftMonth(current.year, current.monthIndex, 1),
                  )
                }
                type="button"
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>

            <div className="diary-calendar-weekdays">
              {WEEKDAYS.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>

            <div className="diary-calendar-grid">
              {cells.map((cell) => {
                const hasEntry = entryDates.has(cell.dateKey);
                const isSelected = cell.dateKey === selectedDate;
                return (
                  <button
                    aria-current={isSelected ? "date" : undefined}
                    aria-label={
                      hasEntry
                        ? `${cell.dateKey}, has diary entries`
                        : cell.dateKey
                    }
                    className={[
                      "diary-calendar-day",
                      cell.inMonth ? "" : "outside-month",
                      cell.isToday ? "today" : "",
                      isSelected ? "selected" : "",
                      cell.isFuture ? "future" : "",
                      hasEntry ? "has-entry" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={cell.isFuture}
                    key={cell.dateKey}
                    onClick={() => {
                      onSelectDate(cell.dateKey);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    <span>{cell.dayOfMonth}</span>
                    {hasEntry ? (
                      <span aria-hidden="true" className="entry-dot" />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <button
              className="diary-calendar-today-action"
              onClick={jumpToToday}
              type="button"
            >
              Jump to today
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
