import { addDays, format, startOfDay, startOfWeek } from "date-fns";
import {
  CELL_WIDTH,
  MINIMUM_WIDTH_PADDING,
  MONTH_GAP_WIDTH,
  MONTHS_PER_YEAR,
  WEEK_STARTS_ON,
} from "./constants.ts";
import type { MonthSpan } from "./types.ts";

export function monthLabel(month: number): string {
  return format(new Date(2000, month - 1, 1), "MMM");
}

function firstWeekdayOfYear(year: number, weekdayIndex: number): Date {
  const firstDay = startOfDay(new Date(year, 0, 1));
  const offset = (weekdayIndex - firstDay.getDay() + 7) % 7;
  return addDays(firstDay, offset);
}

export function getWeekdayDates(year: number, row: number): Date[] {
  const weekdayIndex = (row + WEEK_STARTS_ON) % 7;
  const dates: Date[] = [];
  for (
    let day = firstWeekdayOfYear(year, weekdayIndex);
    day.getFullYear() === year;
    day = addDays(day, 7)
  ) {
    dates.push(day);
  }
  return dates;
}

export function leadingYearBlankWidth(year: number, row: number): number {
  const firstWeekStart = startOfWeek(new Date(year, 0, 1), {
    weekStartsOn: WEEK_STARTS_ON,
  });
  const rowDate = addDays(firstWeekStart, row);
  return rowDate.getFullYear() === year ? 0 : CELL_WIDTH;
}

export function buildMonthSpans(year: number): {
  spans: MonthSpan[];
  width: number;
} {
  const spans = Array.from({ length: MONTHS_PER_YEAR }, () => ({
    start: Number.POSITIVE_INFINITY,
    end: 0,
  }));
  let width = 0;

  for (let row = 0; row < 7; row++) {
    let cursor = leadingYearBlankWidth(year, row);
    const dates = getWeekdayDates(year, row);
    for (let i = 0; i < dates.length; i++) {
      const day = dates[i]!;
      const monthSpan = spans[day.getMonth()]!;
      monthSpan.start = Math.min(monthSpan.start, cursor);
      monthSpan.end = Math.max(monthSpan.end, cursor + CELL_WIDTH);
      cursor += CELL_WIDTH;

      const next = dates[i + 1];
      if (next && next.getMonth() !== day.getMonth()) cursor += MONTH_GAP_WIDTH;
    }
    width = Math.max(width, cursor);
  }

  return {
    spans: spans.map((span) =>
      span.start === Number.POSITIVE_INFINITY ? { start: 0, end: 0 } : span,
    ),
    width,
  };
}

export function minimumWidthForYear(year: number): number {
  return 4 + buildMonthSpans(year).width + MINIMUM_WIDTH_PADDING;
}

export function minimumWidthMessage(year: number): string {
  return `Minimum of ${minimumWidthForYear(year)} columns to view`;
}
