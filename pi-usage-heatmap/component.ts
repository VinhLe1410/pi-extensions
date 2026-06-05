import type { Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, type Component } from "@earendil-works/pi-tui";
import { collectUsage } from "./collect-usage.ts";
import {
  minimumWidthForYear,
  minimumWidthMessage,
} from "./calendar-layout.ts";
import { centerLine, fit } from "./format.ts";
import { buildHeatmapLines } from "./render-heatmap.ts";
import type { UsageStats } from "./types.ts";

export class UsageHeatmapComponent implements Component {
  private stats?: UsageStats;
  private loading = false;
  private error?: string;
  private closed = false;
  private version = 0;
  private cachedWidth = -1;
  private cachedVersion = -1;
  private cachedLines: string[] = [];
  private abortController?: AbortController;

  constructor(
    private readonly tui: { requestRender(): void },
    private readonly theme: Theme,
    private readonly done: () => void,
  ) {}

  async refresh(): Promise<void> {
    if (this.loading) return;

    const controller = new AbortController();
    this.abortController = controller;
    this.loading = true;
    this.error = undefined;
    this.bump();

    try {
      this.stats = await collectUsage(new Date(), controller.signal);
    } catch (error) {
      if (!controller.signal.aborted)
        this.error = error instanceof Error ? error.message : String(error);
    } finally {
      if (this.abortController === controller) this.abortController = undefined;
      this.loading = false;
      this.bump();
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.closed = true;
      this.abortController?.abort();
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
    if (this.cachedWidth === width && this.cachedVersion === this.version)
      return this.cachedLines;

    const year = this.stats?.year ?? new Date().getFullYear();
    const minimumWidth = minimumWidthForYear(year);
    let lines: string[];
    if (width < minimumWidth) {
      lines = [
        centerLine(this.theme.fg("warning", minimumWidthMessage(year)), width),
      ];
    } else if (this.error) {
      lines = [
        centerLine(
          this.theme.fg("error", "Failed to read usage sessions"),
          width,
        ),
        centerLine(this.theme.fg("dim", this.error), width),
        centerLine(this.theme.fg("dim", "r refresh • Esc close"), width),
      ];
    } else if (!this.stats) {
      lines = [
        centerLine(this.theme.fg("muted", "Loading usage heatmap…"), width),
      ];
    } else {
      lines = buildHeatmapLines(this.stats, this.theme, width);
      if (this.loading)
        lines.push(centerLine(this.theme.fg("muted", "Refreshing…"), width));
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
