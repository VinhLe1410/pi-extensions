import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import {
  addDays,
  differenceInCalendarDays,
  endOfWeek,
  format,
  isAfter,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { promises as fs } from "node:fs";
import path from "node:path";

const CELL_WIDTH = 2;
const MONTHS_PER_YEAR = 12;
const FALLBACK_ACCENT = "#61afef";
const WEEK_STARTS_ON = 1 as const;

type DayTotals = Map<string, number>;

type UsageStats = {
  year: number;
  generatedAt: Date;
  days: DayTotals;
  totalOutput: number;
  activeDays: number;
  maxDayKey?: string;
  maxDayOutput: number;
  dedupedOutput: number;
  dedupedMessages: number;
  scannedFiles: number;
  scannedMessages: number;
  errors: number;
};

type AssistantUsageRecord = {
  dedupeKey: string;
  date: Date;
  output: number;
};

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };
type MonthRange = { month: number; monthIndex: number; start: Date; weeks: number; padStart: boolean; padEnd: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function dateFromValue(value: unknown): Date | undefined {
  const date = typeof value === "number" || typeof value === "string" ? new Date(value) : undefined;
  return date && !Number.isNaN(date.getTime()) ? date : undefined;
}

async function findSessionFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          files.push(fullPath);
        }
      }),
    );
  }

  await walk(root);
  return files;
}

function readAssistantUsage(entry: unknown, filePath: string, lineNumber: number): AssistantUsageRecord | undefined {
  if (!isRecord(entry) || entry.type !== "message" || !isRecord(entry.message)) return undefined;

  const message = entry.message;
  if (message.role !== "assistant" || !isRecord(message.usage)) return undefined;

  const usage = message.usage;
  const output = Math.trunc(numberValue(usage.output));
  if (output <= 0) return undefined;

  const date = dateFromValue(message.timestamp) ?? dateFromValue(entry.timestamp);
  if (!date) return undefined;

  const entryId = typeof entry.id === "string" ? entry.id : `${filePath}:${lineNumber}`;
  const timestamp = typeof message.timestamp === "number" || typeof message.timestamp === "string"
    ? String(message.timestamp)
    : typeof entry.timestamp === "string"
      ? entry.timestamp
      : "";
  const provider = typeof message.provider === "string" ? message.provider : "";
  const model = typeof message.model === "string" ? message.model : "";
  const input = Math.trunc(numberValue(usage.input));
  const cacheRead = Math.trunc(numberValue(usage.cacheRead));
  const cacheWrite = Math.trunc(numberValue(usage.cacheWrite));
  const totalTokens = Math.trunc(numberValue(usage.totalTokens));

  return {
    date,
    output,
    dedupeKey: [entryId, timestamp, provider, model, input, output, cacheRead, cacheWrite, totalTokens].join("|"),
  };
}

async function collectUsage(now = new Date()): Promise<UsageStats> {
  const year = now.getFullYear();
  const today = startOfDay(now);
  const sessionsDir = path.join(getAgentDir(), "sessions");
  const sessionFiles = await findSessionFiles(sessionsDir);
  const seen = new Set<string>();
  const days: DayTotals = new Map();

  let totalOutput = 0;
  let dedupedOutput = 0;
  let dedupedMessages = 0;
  let scannedMessages = 0;
  let errors = 0;

  await Promise.all(
    sessionFiles.map(async (filePath) => {
      let content: string;
      try {
        content = await fs.readFile(filePath, "utf8");
      } catch {
        errors += 1;
        return;
      }

      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!.trim();
        if (!line) continue;

        let entry: unknown;
        try {
          entry = JSON.parse(line);
        } catch {
          errors += 1;
          continue;
        }

        const record = readAssistantUsage(entry, filePath, i + 1);
        if (!record) continue;

        const day = startOfDay(record.date);
        if (day.getFullYear() !== year || isAfter(day, today)) continue;

        scannedMessages += 1;
        if (seen.has(record.dedupeKey)) {
          dedupedOutput += record.output;
          dedupedMessages += 1;
          continue;
        }
        seen.add(record.dedupeKey);

        const key = format(day, "yyyy-MM-dd");
        days.set(key, (days.get(key) ?? 0) + record.output);
        totalOutput += record.output;
      }
    }),
  );

  let activeDays = 0;
  let maxDayKey: string | undefined;
  let maxDayOutput = 0;
  for (const [key, output] of days) {
    if (output <= 0) continue;
    activeDays += 1;
    if (output > maxDayOutput) {
      maxDayOutput = output;
      maxDayKey = key;
    }
  }

  return {
    year,
    generatedAt: now,
    days,
    totalOutput,
    activeDays,
    maxDayKey,
    maxDayOutput,
    dedupedOutput,
    dedupedMessages,
    scannedFiles: sessionFiles.length,
    scannedMessages,
    errors,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): Rgb | undefined {
  const match = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return undefined;
  const value = match[1]!;
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: lightness * 100 };

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;

  switch (max) {
    case red:
      hue = (green - blue) / delta + (green < blue ? 6 : 0);
      break;
    case green:
      hue = (blue - red) / delta + 2;
      break;
    default:
      hue = (red - green) / delta + 4;
      break;
  }

  return { h: hue * 60, s: saturation * 100, l: lightness * 100 };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hue = h / 60;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const match = lightness - chroma / 2;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue >= 0 && hue < 1) [red, green, blue] = [chroma, x, 0];
  else if (hue < 2) [red, green, blue] = [x, chroma, 0];
  else if (hue < 3) [red, green, blue] = [0, chroma, x];
  else if (hue < 4) [red, green, blue] = [0, x, chroma];
  else if (hue < 5) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];

  return {
    r: Math.round((red + match) * 255),
    g: Math.round((green + match) * 255),
    b: Math.round((blue + match) * 255),
  };
}

function parseThemeAccent(theme: Theme): Rgb {
  const trueColorMatch = theme.getFgAnsi("accent").match(/\x1b\[38;2;(\d+);(\d+);(\d+)m/);
  if (trueColorMatch) {
    return {
      r: Number(trueColorMatch[1]),
      g: Number(trueColorMatch[2]),
      b: Number(trueColorMatch[3]),
    };
  }

  return hexToRgb(FALLBACK_ACCENT)!;
}

function colorCell(rgb: Rgb, text: string): string {
  return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m${text}\x1b[39m`;
}

function makeLevelStyles(theme: Theme): Array<(text: string) => string> {
  const accent = rgbToHsl(parseThemeAccent(theme));
  const styles: Array<(text: string) => string> = [(text) => theme.fg("dim", text)];

  for (let level = 1; level <= 5; level++) {
    const rgb = hslToRgb({
      h: accent.h,
      s: clamp(accent.s * (0.42 + level * 0.12), 25, 96),
      l: clamp(18 + level * 8 + (accent.l - 50) * 0.15, 18, 72),
    });
    styles.push((text, color = rgb) => colorCell(color, text));
  }

  return styles;
}

function upperBound(values: number[], target: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (values[mid]! <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function createLevelResolver(days: DayTotals): (value: number) => number {
  const values = Array.from(days.values()).filter((value) => value > 0).sort((a, b) => a - b);
  if (values.length === 0) return () => 0;

  return (value) => {
    if (value <= 0) return 0;
    return clamp(Math.ceil((upperBound(values, value) / values.length) * 5), 1, 5);
  };
}

function formatTokens(tokens: number): string {
  const abs = Math.abs(tokens);
  if (abs < 1_000) return String(tokens);
  if (abs < 1_000_000) return `${(tokens / 1_000).toFixed(abs < 10_000 ? 1 : 0)}k`;
  if (abs < 1_000_000_000) return `${(tokens / 1_000_000).toFixed(abs < 10_000_000 ? 1 : 0)}M`;
  return `${(tokens / 1_000_000_000).toFixed(1)}B`;
}

function fit(line: string, width: number): string {
  return truncateToWidth(line, width, "");
}

function centerLine(line: string, width: number): string {
  const lineWidth = visibleWidth(line);
  if (lineWidth >= width) return fit(line, width);
  return `${" ".repeat(Math.floor((width - lineWidth) / 2))}${line}`;
}

function centerPlain(text: string, width: number): string {
  const textWidth = visibleWidth(text);
  if (textWidth >= width) return fit(text, width);
  const left = Math.floor((width - textWidth) / 2);
  const right = width - textWidth - left;
  return `${" ".repeat(left)}${text}${" ".repeat(right)}`;
}

function monthLabel(month: number): string {
  if (month < 10) return `[ ${month} ]`;
  const text = String(month);
  return `[${text[0]} ${text[1]}]`;
}

function getMonthRanges(year: number): MonthRange[] {
  return Array.from({ length: MONTHS_PER_YEAR }, (_, monthIndex) => {
    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 0);
    const start = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON });
    const end = endOfWeek(monthEnd, { weekStartsOn: WEEK_STARTS_ON });
    const weeks = Math.floor(differenceInCalendarDays(end, start) / 7) + 1;
    return {
      month: monthIndex + 1,
      monthIndex,
      start,
      weeks,
      padStart: monthStart.getDay() === WEEK_STARTS_ON,
      padEnd: monthEnd.getDay() === 0,
    };
  });
}

function shouldAddLeadingPad(monthRanges: MonthRange[], index: number): boolean {
  return monthRanges[index]!.padStart && !monthRanges[index - 1]?.padEnd;
}

function monthRangeWidth(monthRanges: MonthRange[], index: number): number {
  const range = monthRanges[index]!;
  return (range.weeks + (shouldAddLeadingPad(monthRanges, index) ? 1 : 0) + (range.padEnd ? 1 : 0)) * CELL_WIDTH;
}

function graphWidthForMonths(monthRanges: MonthRange[]): number {
  const cellsWidth = monthRanges.reduce((sum, _range, index) => sum + monthRangeWidth(monthRanges, index), 0);
  return 4 + cellsWidth;
}

function minimumWidthForYear(year: number): number {
  return graphWidthForMonths(getMonthRanges(year));
}

function minimumWidthMessage(year: number): string {
  return `Minimum of ${minimumWidthForYear(year)} columns to view`;
}

function renderMonthLabels(theme: Theme, monthRanges: MonthRange[]): string {
  const body = monthRanges
    .map((range, index) => centerPlain(monthLabel(range.month), monthRangeWidth(monthRanges, index)))
    .join("");

  return `    ${theme.fg("muted", body)}`;
}

function renderFooterLines(stats: UsageStats, width: number): string[] {
  const maxPart = stats.maxDayKey
    ? `max ${formatTokens(stats.maxDayOutput)} on ${format(new Date(`${stats.maxDayKey}T00:00:00`), "MMM d")}`
    : "max 0";
  const dedupePart = stats.dedupedOutput > 0
    ? ` • deduped ${formatTokens(stats.dedupedOutput)} copied tokens`
    : "";
  const errorPart = stats.errors > 0 ? ` • ${stats.errors} read errors` : "";
  const statsLine = `${stats.year} • ${formatTokens(stats.totalOutput)} output tokens • ${stats.activeDays} active days • ${maxPart}${dedupePart}${errorPart}`;
  const controls = "r refresh • Esc close";
  const combined = `${statsLine} • ${controls}`;

  return visibleWidth(combined) <= width ? [combined] : [statsLine, controls];
}

function buildHeatmapLines(stats: UsageStats, theme: Theme, width: number): string[] {
  const today = startOfDay(stats.generatedAt);
  const monthRanges = getMonthRanges(stats.year);
  const graphWidth = graphWidthForMonths(monthRanges);
  const indent = " ".repeat(Math.max(0, Math.floor((width - graphWidth) / 2)));
  const styles = makeLevelStyles(theme);
  const levelFor = createLevelResolver(stats.days);
  const dayLabels = ["Mon", "", "Wed", "", "Fri", "", ""];
  const lines: string[] = [];

  lines.push(centerLine(`${theme.fg("accent", theme.bold("Usage heatmap"))} ${theme.fg("muted", "assistant output tokens")}`, width));
  lines.push("");
  lines.push(fit(indent + renderMonthLabels(theme, monthRanges), width));

  for (let row = 0; row < 7; row++) {
    const label = dayLabels[row] ? theme.fg("muted", dayLabels[row]!.padEnd(4)) : "    ";
    let line = indent + label;

    for (let rangeIndex = 0; rangeIndex < monthRanges.length; rangeIndex++) {
      const range = monthRanges[rangeIndex]!;
      if (shouldAddLeadingPad(monthRanges, rangeIndex)) line += " ".repeat(CELL_WIDTH);

      for (let col = 0; col < range.weeks; col++) {
        const day = startOfDay(addDays(range.start, col * 7 + row));
        if (day.getFullYear() !== stats.year || day.getMonth() !== range.monthIndex) {
          line += " ".repeat(CELL_WIDTH);
          continue;
        }

        const key = format(day, "yyyy-MM-dd");
        const output = isAfter(day, today) ? 0 : stats.days.get(key) ?? 0;
        const level = isAfter(day, today) ? 0 : levelFor(output);
        line += styles[level]!("■".repeat(CELL_WIDTH));
      }

      if (range.padEnd) line += " ".repeat(CELL_WIDTH);
    }

    lines.push(fit(line, width));
  }

  const legend = [0, 1, 2, 3, 4, 5].map((level) => styles[level]!("■".repeat(CELL_WIDTH))).join(" ");
  lines.push("");
  lines.push(centerLine(`${theme.fg("dim", "Less")} ${legend} ${theme.fg("dim", "More")}`, width));
  for (const footerLine of renderFooterLines(stats, width)) {
    lines.push(centerLine(theme.fg("dim", footerLine), width));
  }

  return lines.map((line) => fit(line, width));
}

class UsageHeatmapComponent implements Component {
  private stats?: UsageStats;
  private loading = false;
  private error?: string;
  private closed = false;
  private version = 0;
  private cachedWidth = -1;
  private cachedVersion = -1;
  private cachedLines: string[] = [];

  constructor(
    private readonly tui: { requestRender(): void },
    private readonly theme: Theme,
    private readonly done: () => void,
  ) {}

  async refresh(): Promise<void> {
    if (this.loading) return;

    this.loading = true;
    this.error = undefined;
    this.bump();

    try {
      this.stats = await collectUsage();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
      this.bump();
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.closed = true;
      this.done();
      return;
    }

    if (data === "r" || data === "R") void this.refresh();
  }

  invalidate(): void {
    this.cachedWidth = -1;
    this.cachedVersion = -1;
  }

  render(width: number): string[] {
    if (this.cachedWidth === width && this.cachedVersion === this.version) return this.cachedLines;

    const year = this.stats?.year ?? new Date().getFullYear();
    const minimumWidth = minimumWidthForYear(year);
    let lines: string[];
    if (width < minimumWidth) {
      lines = [centerLine(this.theme.fg("warning", minimumWidthMessage(year)), width)];
    } else if (this.error) {
      lines = [
        centerLine(this.theme.fg("error", "Failed to read usage sessions"), width),
        centerLine(this.theme.fg("dim", this.error), width),
        centerLine(this.theme.fg("dim", "r refresh • Esc close"), width),
      ];
    } else if (!this.stats) {
      lines = [centerLine(this.theme.fg("muted", "Loading usage heatmap…"), width)];
    } else {
      lines = buildHeatmapLines(this.stats, this.theme, width);
      if (this.loading) lines.push(centerLine(this.theme.fg("muted", "Refreshing…"), width));
    }

    this.cachedLines = lines.map((line) => fit(line, width));
    this.cachedWidth = width;
    this.cachedVersion = this.version;
    return this.cachedLines;
  }

  private bump(): void {
    this.version += 1;
    this.invalidate();
    if (!this.closed) this.tui.requestRender();
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("usage", {
    description: "Show current-year assistant output token heatmap",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/usage requires interactive TUI mode", "error");
        return;
      }

      await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
        const component = new UsageHeatmapComponent(tui, theme, () => done(undefined));
        void component.refresh();
        return component;
      });
    },
  });
}
