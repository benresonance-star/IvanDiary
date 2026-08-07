export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export type CalendarCell = {
  dateKey: string;
  dayOfMonth: number;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
};

export function buildMonthGrid(
  year: number,
  monthIndex: number,
  today = new Date(),
): CalendarCell[] {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday-first
  const gridStart = new Date(year, monthIndex, 1 - startOffset);
  const todayKey = localDateKey(today);
  const cells: CalendarCell[] = [];

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
    );
    const dateKey = localDateKey(date);
    cells.push({
      dateKey,
      dayOfMonth: date.getDate(),
      inMonth: date.getMonth() === monthIndex,
      isToday: dateKey === todayKey,
      isFuture: dateKey > todayKey,
    });
  }

  return cells;
}

export function shiftMonth(
  year: number,
  monthIndex: number,
  delta: number,
): { year: number; monthIndex: number } {
  const date = new Date(year, monthIndex + delta, 1);
  return {
    year: date.getFullYear(),
    monthIndex: date.getMonth(),
  };
}
