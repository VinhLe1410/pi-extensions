import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { TAB_LABELS, TAB_ORDER } from "./constants";
import {
  centerLine,
  clampLines,
  fitCell,
  formatTokens,
  padLeft,
  padRight,
  pickFittingText,
} from "./formatting";
import { getTableLayout } from "./table-layout";
import type {
  BaseStats,
  ModelStats,
  TabName,
  TableLayout,
  UsageData,
} from "./types";

const GRAPH_HEIGHT = 8;
const GRAPH_CELL_WIDTH = 2;
const GRAPH_LABEL_HANG_WIDTH = 4;
const FALLBACK_CONTENT_ROWS = 30;
const MAX_TABLE_ROWS = 16;

interface ModelRow {
  label: string;
  stats: ModelStats;
}

function alignGraphLine(line: string, width: number): string {
  const lineWidth = visibleWidth(line);
  const virtualWidth = lineWidth + GRAPH_LABEL_HANG_WIDTH;
  const desiredPadding = Math.floor(Math.max(0, width - virtualWidth) / 2);
  const maxPaddingWithoutClipping = Math.max(0, width - lineWidth);
  const padding = Math.min(desiredPadding, maxPaddingWithoutClipping);

  return (
    " ".repeat(padding) + truncateToWidth(line, Math.max(0, width - padding))
  );
}

function niceScaleStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;

  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

export class UsageComponent {
  private activeTab: TabName = "thisMonth";
  private data: UsageData;
  private selectedIndex = 0;
  private tableScroll = 0;
  private theme: Theme;
  private getTerminalRows: () => number | undefined;
  private requestRender: () => void;
  private done: () => void;

  constructor(
    theme: Theme,
    data: UsageData,
    getTerminalRows: () => number | undefined,
    requestRender: () => void,
    done: () => void,
  ) {
    this.theme = theme;
    this.data = data;
    this.getTerminalRows = getTerminalRows;
    this.requestRender = requestRender;
    this.done = done;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "q")) {
      this.done();
      return;
    }

    if (matchesKey(data, "tab") || matchesKey(data, "right")) {
      this.switchTab(1);
    } else if (matchesKey(data, "shift+tab") || matchesKey(data, "left")) {
      this.switchTab(-1);
    } else if (matchesKey(data, "up")) {
      this.moveSelection(-1);
    } else if (matchesKey(data, "down")) {
      this.moveSelection(1);
    }
  }

  getTitle(): string {
    return "Usage Statistics";
  }

  render(width: number): string[] {
    const layout = getTableLayout(width);
    const rows = this.getModelRows();
    this.clampSelection(rows.length);

    const tabs = this.renderTabs(width, layout);
    const header = this.renderHeader(layout, width);
    const totals = this.renderTotals(layout, width);
    const formula = this.renderFormulaNote(width);
    const graph = this.renderTokenGraph(width);
    const help = this.renderHelp(width);
    const reservedRows =
      1 +
      tabs.length +
      header.length +
      totals.length +
      formula.length +
      graph.length +
      help.length;
    const maxTableRows = this.getMaxTableRows(reservedRows);

    return clampLines(
      [
        "",
        ...tabs,
        ...header,
        ...this.renderRows(rows, layout, width, maxTableRows),
        ...totals,
        ...formula,
        ...graph,
        ...help,
      ],
      width,
    );
  }

  private switchTab(direction: -1 | 1): void {
    const idx = TAB_ORDER.indexOf(this.activeTab);
    this.activeTab =
      TAB_ORDER[(idx + direction + TAB_ORDER.length) % TAB_ORDER.length]!;
    this.selectedIndex = 0;
    this.tableScroll = 0;
    this.requestRender();
  }

  private moveSelection(direction: -1 | 1): void {
    const rowCount = this.getModelRows().length;
    if (rowCount === 0) return;

    const nextIndex = Math.max(
      0,
      Math.min(rowCount - 1, this.selectedIndex + direction),
    );
    if (nextIndex === this.selectedIndex) return;

    this.selectedIndex = nextIndex;
    this.requestRender();
  }

  private getModelRows(): ModelRow[] {
    const stats = this.data[this.activeTab];
    const rows: ModelRow[] = [];

    for (const [providerName, providerStats] of stats.providers) {
      for (const modelStats of providerStats.models.values()) {
        rows.push({
          label: `${modelStats.displayName} (${providerName})`,
          stats: modelStats,
        });
      }
    }

    return rows.sort((a, b) => {
      const tokenDelta = b.stats.tokens.total - a.stats.tokens.total;
      if (tokenDelta !== 0) return tokenDelta;
      const costDelta = b.stats.cost - a.stats.cost;
      if (costDelta !== 0) return costDelta;
      return a.label.localeCompare(b.label);
    });
  }

  private getMaxTableRows(reservedRows: number): number {
    const terminalRows = this.getTerminalRows();
    const contentRows = terminalRows
      ? Math.max(8, Math.floor(terminalRows * 0.8) - 2)
      : FALLBACK_CONTENT_ROWS;
    const availableRows = contentRows - reservedRows;
    return Math.max(1, Math.min(MAX_TABLE_ROWS, availableRows));
  }

  private clampSelection(rowCount: number): void {
    if (rowCount === 0) {
      this.selectedIndex = 0;
      this.tableScroll = 0;
      return;
    }

    this.selectedIndex = Math.max(
      0,
      Math.min(this.selectedIndex, rowCount - 1),
    );
  }

  private keepSelectionVisible(rowCount: number, visibleRows: number): void {
    this.clampSelection(rowCount);
    if (rowCount === 0) return;

    const windowRows = Math.max(1, visibleRows);
    const maxScroll = Math.max(0, rowCount - windowRows);
    let nextScroll = Math.min(this.tableScroll, maxScroll);

    if (this.selectedIndex < nextScroll) {
      nextScroll = this.selectedIndex;
    } else if (this.selectedIndex >= nextScroll + windowRows) {
      nextScroll = this.selectedIndex - windowRows + 1;
    }

    this.tableScroll = Math.max(0, Math.min(nextScroll, maxScroll));
  }

  private renderTokenGraph(width: number): string[] {
    if (this.activeTab === "allTime") return [];

    const th = this.theme;
    const buckets = this.data[this.activeTab].tokenBuckets;
    const title = centerLine(th.fg("accent", th.bold("Tokens")), width);

    if (buckets.length === 0 || buckets.every((value) => value === 0)) {
      return [
        title,
        centerLine(th.fg("dim", "No usage data available yet."), width),
        "",
      ];
    }

    const maxValue = Math.max(...buckets);
    const step = niceScaleStep(maxValue / GRAPH_HEIGHT);
    const scaleMax = step * GRAPH_HEIGHT;
    const scaleLabels = Array.from({ length: GRAPH_HEIGHT }, (_, index) =>
      formatTokens(step * (GRAPH_HEIGHT - index)),
    );
    const labelWidth = Math.max(
      1,
      ...scaleLabels.map((label) => visibleWidth(label)),
    );
    const graphLines: string[] = [];

    for (let row = GRAPH_HEIGHT; row >= 1; row--) {
      const label = formatTokens(step * row);
      const bars = buckets
        .map((value) =>
          Math.ceil((value / scaleMax) * GRAPH_HEIGHT) >= row
            ? th.fg("accent", "█") + " ".repeat(GRAPH_CELL_WIDTH - 1)
            : " ".repeat(GRAPH_CELL_WIDTH),
        )
        .join("");

      graphLines.push(
        padLeft(label, labelWidth) + th.fg("border", " ┤") + bars,
      );
    }

    graphLines.push(
      padLeft("0", labelWidth) +
        th.fg("border", " └" + "─".repeat(buckets.length * GRAPH_CELL_WIDTH)),
    );
    graphLines.push(
      " ".repeat(labelWidth + 2) + this.renderGraphAxisLabels(buckets.length),
    );

    return [
      title,
      ...graphLines.map((line) => alignGraphLine(line, width)),
      "",
    ];
  }

  private renderGraphAxisLabels(bucketCount: number): string {
    const axisWidth = bucketCount * GRAPH_CELL_WIDTH;
    const chars = Array(axisWidth).fill(" ");
    const labels: Array<{ index: number; text: string }> = [];

    if (this.activeTab === "today") {
      for (let hour = 0; hour < bucketCount; hour += 4) {
        labels.push({ index: hour, text: String(hour).padStart(2, "0") });
      }
    } else if (this.activeTab === "thisWeek") {
      ["M", "T", "W", "T", "F", "S", "S"].forEach((text, dayIndex) => {
        const index = dayIndex * 3 + 1;
        if (index < bucketCount) labels.push({ index, text });
      });
    } else if (this.activeTab === "thisMonth") {
      for (let day = 1; day <= bucketCount; day += 6) {
        labels.push({ index: day - 1, text: String(day) });
      }
    }

    for (const label of labels) {
      const start = Math.min(
        label.index * GRAPH_CELL_WIDTH,
        Math.max(0, axisWidth - label.text.length),
      );
      for (let i = 0; i < label.text.length; i++) {
        chars[start + i] = label.text[i]!;
      }
    }

    return chars.join("");
  }

  private renderTabs(width: number, layout: TableLayout): string[] {
    const th = this.theme;
    const fullTabs = TAB_ORDER.map((tab) => {
      const label = TAB_LABELS[tab];
      return tab === this.activeTab
        ? th.fg("accent", `[${label}]`)
        : th.fg("dim", ` ${label} `);
    }).join("  ");

    const activeTabOnly = th.fg("accent", `[${TAB_LABELS[this.activeTab]}]`);
    const tabLine = pickFittingText(width, [
      fullTabs,
      `${activeTabOnly}  ${th.fg("dim", "[Tab/←→]")}`,
      activeTabOnly,
    ]);

    const infoLines = layout.compact
      ? wrapTextWithAnsi(
          th.fg("dim", "Compact view. Widen the terminal for more columns."),
          Math.max(width, 1),
        )
      : [];

    return [
      centerLine(tabLine, width),
      ...infoLines.map((line) => centerLine(line, width)),
      "",
    ];
  }

  private renderHeader(layout: TableLayout, width: number): string[] {
    const th = this.theme;

    let headerLine = fitCell("Model (Provider)", layout.nameWidth);
    for (const col of layout.columns) {
      const label = fitCell(col.label, col.width, "right");
      headerLine += col.dimmed ? th.fg("dim", label) : label;
    }

    return [
      centerLine(th.fg("muted", headerLine), width),
      centerLine(th.fg("border", "─".repeat(layout.tableWidth)), width),
    ];
  }

  private renderDataRow(
    name: string,
    stats: BaseStats & { sessions: Set<string> | number },
    layout: TableLayout,
    options: {
      selected?: boolean;
      dimAll?: boolean;
      prefix?: string;
    } = {},
  ): string {
    const th = this.theme;
    const { selected = false, dimAll = false, prefix = "" } = options;

    const safePrefix =
      layout.nameWidth > 0
        ? truncateToWidth(prefix, layout.nameWidth, "")
        : "";
    const prefixWidth = visibleWidth(safePrefix);
    const innerNameWidth = Math.max(layout.nameWidth - prefixWidth, 0);
    const truncName =
      innerNameWidth > 0 ? truncateToWidth(name, innerNameWidth) : "";
    const styledName = selected
      ? th.fg("text", truncName)
      : th.fg("dim", truncName);

    let row =
      safePrefix +
      (innerNameWidth > 0 ? padRight(styledName, innerNameWidth) : "");

    for (const col of layout.columns) {
      const value = fitCell(col.getValue(stats), col.width, "right");
      const shouldDim = col.dimmed || dimAll;
      row += shouldDim ? th.fg("dim", value) : value;
    }

    return row;
  }

  private renderRows(
    rows: ModelRow[],
    layout: TableLayout,
    width: number,
    maxRows: number,
  ): string[] {
    const th = this.theme;
    const lines: string[] = [];

    if (rows.length === 0) {
      lines.push(
        centerLine(th.fg("dim", "No usage data for this period"), width),
      );
      return lines;
    }

    this.keepSelectionVisible(rows.length, maxRows);
    const visibleRows = rows.slice(
      this.tableScroll,
      this.tableScroll + Math.max(1, maxRows),
    );

    for (let i = 0; i < visibleRows.length; i++) {
      const rowIndex = this.tableScroll + i;
      const row = visibleRows[i]!;
      const isSelected = rowIndex === this.selectedIndex;
      const prefix = isSelected ? th.fg("text", "▸ ") : "  ";

      lines.push(
        centerLine(
          this.renderDataRow(row.label, row.stats, layout, {
            selected: isSelected,
            dimAll: !isSelected,
            prefix,
          }),
          width,
        ),
      );
    }

    return lines;
  }

  private renderTotals(layout: TableLayout, width: number): string[] {
    const th = this.theme;
    const stats = this.data[this.activeTab];

    let totalRow = fitCell(th.bold("Total"), layout.nameWidth);
    for (const col of layout.columns) {
      const value = fitCell(col.getValue(stats.totals), col.width, "right");
      totalRow += col.dimmed ? th.fg("dim", value) : value;
    }

    return [
      centerLine(th.fg("border", "─".repeat(layout.tableWidth)), width),
      centerLine(totalRow, width),
      "",
    ];
  }

  private renderFormulaNote(width: number): string[] {
    const line = pickFittingText(width, [
      "Tokens = Input + Output + CacheWrite  ·  ↑In = Input + CacheWrite  (as of 0.2.0)",
      "Tokens = In + Out + CacheWrite  ·  ↑In = In + CacheWrite  (v0.2.0+)",
      "Tokens & ↑In include CacheWrite (v0.2.0+)",
      "Incl. CacheWrite (v0.2.0+)",
    ]);
    return [centerLine(this.theme.fg("dim", line), width), ""];
  }

  private renderHelp(width: number): string[] {
    const line = pickFittingText(width, [
      "[Tab/←→] period  [↑↓] select/scroll  [q] close",
      "[Tab] period  [↑↓] scroll  [q] close",
      "[↑↓] scroll  [q] close",
      "[q] close",
    ]);
    return [centerLine(this.theme.fg("dim", line), width)];
  }

  invalidate(): void {}
  dispose(): void {}
}
