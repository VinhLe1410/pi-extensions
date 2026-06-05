import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { format, isAfter, startOfDay } from "date-fns";
import {
  CELL_WIDTH,
  MONTH_GAP_WIDTH,
  NON_ZERO_LEVELS,
  ROW_LABEL_WIDTH,
} from "./constants.ts";
import {
  buildMonthSpans,
  getWeekdayDates,
  leadingYearBlankWidth,
  monthLabel,
} from "./calendar-layout.ts";
import { createLevelResolver, makeLevelStyles } from "./colors.ts";
import { centerLine, fit, formatTokens } from "./format.ts";
import type { MonthSpan, UsageStats } from "./types.ts";

function renderMonthLabels(
  theme: Theme,
  spans: MonthSpan[],
  bodyWidth: number,
): string {
  const chars = Array.from({ length: bodyWidth }, () => " ");

  for (let monthIndex = 0; monthIndex < spans.length; monthIndex++) {
    const span = spans[monthIndex]!;
    const label = monthLabel(monthIndex + 1);
    const labelStart =
      span.start +
      Math.max(0, Math.floor((span.end - span.start - label.length) / 2));
    for (let i = 0; i < label.length && labelStart + i < chars.length; i++) {
      chars[labelStart + i] = label[i]!;
    }
  }

  return theme.fg("muted", chars.join(""));
}

function renderFooterLines(stats: UsageStats, width: number): string[] {
  const maxPart = stats.maxDayKey
    ? `max ${formatTokens(stats.maxDayOutput)} on ${format(new Date(`${stats.maxDayKey}T00:00:00`), "MMM d")}`
    : "max 0";
  const dedupePart =
    stats.dedupedOutput > 0
      ? ` • deduped ${formatTokens(stats.dedupedOutput)} copied tokens`
      : "";
  const errorPart = stats.errors > 0 ? ` • ${stats.errors} read errors` : "";
  const statsLine = `${stats.year} • ${formatTokens(stats.totalOutput)} output tokens • ${stats.activeDays} active days • ${maxPart}${dedupePart}${errorPart}`;
  const controls = "r refresh • Esc close";
  const combined = `${statsLine} • ${controls}`;

  return visibleWidth(combined) <= width ? [combined] : [statsLine, controls];
}

function createHeatmapRenderLayout(
  width: number,
  bodyWidth: number,
): {
  bodyPrefix: string;
  labelPrefix: string;
  panelPrefix: string;
  panelWidth: number;
} {
  const bodyIndent = Math.max(
    ROW_LABEL_WIDTH,
    Math.floor((width - bodyWidth) / 2),
  );
  const labelIndent = bodyIndent - ROW_LABEL_WIDTH;

  return {
    bodyPrefix: " ".repeat(bodyIndent),
    labelPrefix: " ".repeat(labelIndent),
    panelPrefix: " ".repeat(labelIndent),
    panelWidth: ROW_LABEL_WIDTH + bodyWidth + ROW_LABEL_WIDTH,
  };
}

export function buildHeatmapLines(
  stats: UsageStats,
  theme: Theme,
  width: number,
): string[] {
  const today = startOfDay(stats.generatedAt);
  const { spans, width: bodyWidth } = buildMonthSpans(stats.year);
  const layout = createHeatmapRenderLayout(width, bodyWidth);
  const styles = makeLevelStyles(theme);
  const levelFor = createLevelResolver(stats.days);
  const dayLabels = ["Mon", "", "Wed", "", "Fri", "", ""];
  const panelBorder = fit(
    layout.panelPrefix +
      theme.fg("borderMuted", "─".repeat(layout.panelWidth)),
    width,
  );
  const lines: string[] = [];

  lines.push(panelBorder);
  lines.push(
    centerLine(theme.fg("accent", theme.bold("AI Usage Heatmap")), width),
  );
  lines.push(
    centerLine(
      theme.fg("muted", "Token usage throughout the current year"),
      width,
    ),
  );
  lines.push("");
  lines.push(
    fit(layout.bodyPrefix + renderMonthLabels(theme, spans, bodyWidth), width),
  );

  for (let row = 0; row < 7; row++) {
    const label = dayLabels[row]
      ? theme.fg("muted", dayLabels[row]!.padEnd(4))
      : "    ";
    let line =
      layout.labelPrefix +
      label +
      " ".repeat(leadingYearBlankWidth(stats.year, row));
    const dates = getWeekdayDates(stats.year, row);

    for (let i = 0; i < dates.length; i++) {
      const day = dates[i]!;
      const key = format(day, "yyyy-MM-dd");
      const output = isAfter(day, today) ? 0 : (stats.days.get(key) ?? 0);
      const level = isAfter(day, today) ? 0 : levelFor(output);
      line += styles[level]!("■".repeat(CELL_WIDTH));

      const next = dates[i + 1];
      if (next && next.getMonth() !== day.getMonth())
        line += " ".repeat(MONTH_GAP_WIDTH);
    }

    lines.push(fit(line, width));
  }

  const legend = Array.from({ length: NON_ZERO_LEVELS + 1 }, (_, level) =>
    styles[level]!("■".repeat(CELL_WIDTH)),
  ).join(" ");
  lines.push("");
  lines.push(
    centerLine(
      `${theme.fg("dim", "Less")} ${legend} ${theme.fg("dim", "More")}`,
      width,
    ),
  );
  for (const footerLine of renderFooterLines(stats, width)) {
    lines.push(centerLine(theme.fg("dim", footerLine), width));
  }
  lines.push(panelBorder);

  return lines.map((line) => fit(line, width));
}
