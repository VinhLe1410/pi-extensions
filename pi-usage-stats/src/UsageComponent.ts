import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { TAB_LABELS, TAB_ORDER } from "./constants";
import {
  clampLines,
  fitCell,
  formatInsightPercent,
  padRight,
  pickFittingText,
} from "./formatting";
import { getTableLayout } from "./table-layout";
import type { BaseStats, TabName, TableLayout, UsageData, ViewMode } from "./types";

export class UsageComponent {
  private activeTab: TabName = "allTime";
  private viewMode: ViewMode = "table";
  private data: UsageData;
  private selectedIndex = 0;
  private expanded = new Set<string>();
  private providerOrder: string[] = [];
  private theme: Theme;
  private requestRender: () => void;
  private done: () => void;

  constructor(
    theme: Theme,
    data: UsageData,
    requestRender: () => void,
    done: () => void,
  ) {
    this.theme = theme;
    this.requestRender = requestRender;
    this.done = done;
    this.data = data;
    this.updateProviderOrder();
  }

  private updateProviderOrder(): void {
    const stats = this.data[this.activeTab];
    this.providerOrder = Array.from(stats.providers.entries())
      .sort((a, b) => b[1].cost - a[1].cost)
      .map(([name]) => name);
    this.selectedIndex = Math.min(
      this.selectedIndex,
      Math.max(0, this.providerOrder.length - 1),
    );
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "q")) {
      this.done();
      return;
    }

    if (matchesKey(data, "v")) {
      this.viewMode = this.viewMode === "table" ? "insights" : "table";
      this.requestRender();
      return;
    }

    if (matchesKey(data, "tab") || matchesKey(data, "right")) {
      const idx = TAB_ORDER.indexOf(this.activeTab);
      this.activeTab = TAB_ORDER[(idx + 1) % TAB_ORDER.length]!;
      this.updateProviderOrder();
      this.requestRender();
    } else if (matchesKey(data, "shift+tab") || matchesKey(data, "left")) {
      const idx = TAB_ORDER.indexOf(this.activeTab);
      this.activeTab =
        TAB_ORDER[(idx - 1 + TAB_ORDER.length) % TAB_ORDER.length]!;
      this.updateProviderOrder();
      this.requestRender();
    } else if (this.viewMode === "table" && matchesKey(data, "up")) {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
        this.requestRender();
      }
    } else if (this.viewMode === "table" && matchesKey(data, "down")) {
      if (this.selectedIndex < this.providerOrder.length - 1) {
        this.selectedIndex++;
        this.requestRender();
      }
    } else if (
      this.viewMode === "table" &&
      (matchesKey(data, "enter") || matchesKey(data, "space"))
    ) {
      const provider = this.providerOrder[this.selectedIndex];
      if (provider) {
        if (this.expanded.has(provider)) {
          this.expanded.delete(provider);
        } else {
          this.expanded.add(provider);
        }
        this.requestRender();
      }
    }
  }

  render(width: number): string[] {
    if (this.viewMode === "insights") {
      return clampLines(
        [
          ...this.renderTitle(),
          ...this.renderTabs(width, getTableLayout(width)),
          ...this.renderInsights(width),
          ...this.renderHelp(width),
        ],
        width,
      );
    }

    const layout = getTableLayout(width);
    return clampLines(
      [
        ...this.renderTitle(),
        ...this.renderTabs(width, layout),
        ...this.renderHeader(layout),
        ...this.renderRows(layout),
        ...this.renderTotals(layout),
        ...this.renderFormulaNote(width),
        ...this.renderHelp(width),
      ],
      width,
    );
  }

  private renderTitle(): string[] {
    const th = this.theme;
    const label =
      this.viewMode === "insights" ? "Usage Insights" : "Usage Statistics";
    return [th.fg("accent", th.bold(label)), ""];
  }

  private renderInsights(width: number): string[] {
    const th = this.theme;
    const stats = this.data[this.activeTab];
    const { insights } = stats.insights;
    const hasMessages = stats.totals.messages > 0;
    const hasCost = stats.totals.cost > 0;
    const lines: string[] = [];

    lines.push("What's contributing to your cost?");
    lines.push(
      th.fg("dim", "Approximate, based on local sessions on this machine."),
    );
    lines.push("");
    const note = `${TAB_LABELS[this.activeTab]} · weighted by cost (USD) · these overlap and can sum to >100%`;
    lines.push(th.fg("dim", note));
    lines.push("");

    if (!hasMessages) {
      lines.push(th.fg("dim", "  No usage recorded for this period."));
      lines.push("");
      return lines;
    }
    if (!hasCost) {
      lines.push(th.fg("dim", "  No cost data recorded for this period."));
      lines.push("");
      return lines;
    }
    if (insights.length === 0) {
      lines.push(th.fg("dim", "  No insights above 1% for this period."));
      lines.push("");
      return lines;
    }

    const indent = "     ";
    const adviceWidth = Math.max(width - indent.length, 30);

    for (const insight of insights) {
      const pct = th.fg(
        "accent",
        th.bold(formatInsightPercent(insight.percent)),
      );
      lines.push(`${pct} ${insight.headline}`);
      for (const wrapped of wrapTextWithAnsi(insight.advice, adviceWidth)) {
        lines.push(`${indent}${th.fg("dim", wrapped)}`);
      }
      lines.push("");
    }

    return lines;
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

    // Compact-note only applies to the table view — it's meaningless for insights.
    const infoLines =
      this.viewMode === "table" && layout.compact
        ? wrapTextWithAnsi(
            th.fg("dim", "Compact view. Widen the terminal for more columns."),
            Math.max(width, 1),
          )
        : [];

    return [tabLine, ...infoLines, ""];
  }

  private renderHeader(layout: TableLayout): string[] {
    const th = this.theme;

    let headerLine = fitCell("Provider / Model", layout.nameWidth);
    for (const col of layout.columns) {
      const label = fitCell(col.label, col.width, "right");
      headerLine += col.dimmed ? th.fg("dim", label) : label;
    }

    return [
      th.fg("muted", headerLine),
      th.fg("border", "─".repeat(layout.tableWidth)),
    ];
  }

  private renderDataRow(
    name: string,
    stats: BaseStats & { sessions: Set<string> | number },
    layout: TableLayout,
    options: {
      indent?: number;
      selected?: boolean;
      dimAll?: boolean;
      prefix?: string;
    } = {},
  ): string {
    const th = this.theme;
    const { indent = 0, selected = false, dimAll = false, prefix } = options;

    const rawPrefix = prefix ?? " ".repeat(indent);
    const safePrefix =
      layout.nameWidth > 0
        ? truncateToWidth(rawPrefix, layout.nameWidth, "")
        : "";
    const prefixWidth = visibleWidth(safePrefix);
    const innerNameWidth = Math.max(layout.nameWidth - prefixWidth, 0);
    const truncName =
      innerNameWidth > 0 ? truncateToWidth(name, innerNameWidth) : "";
    const styledName = selected
      ? th.fg("accent", truncName)
      : dimAll
        ? th.fg("dim", truncName)
        : truncName;

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

  private renderRows(layout: TableLayout): string[] {
    const th = this.theme;
    const stats = this.data[this.activeTab];
    const lines: string[] = [];

    if (this.providerOrder.length === 0) {
      lines.push(th.fg("dim", "  No usage data for this period"));
      return lines;
    }

    for (let i = 0; i < this.providerOrder.length; i++) {
      const providerName = this.providerOrder[i]!;
      const providerStats = stats.providers.get(providerName)!;
      const isSelected = i === this.selectedIndex;
      const isExpanded = this.expanded.has(providerName);
      const arrow = isExpanded ? "▾" : "▸";
      const prefix = isSelected
        ? th.fg("accent", `${arrow} `)
        : th.fg("dim", `${arrow} `);

      lines.push(
        this.renderDataRow(providerName, providerStats, layout, {
          selected: isSelected,
          prefix,
        }),
      );

      if (isExpanded) {
        const models = Array.from(providerStats.models.entries()).sort(
          (a, b) => b[1].cost - a[1].cost,
        );

        for (const [modelName, modelStats] of models) {
          lines.push(
            this.renderDataRow(modelName, modelStats, layout, {
              indent: 4,
              dimAll: true,
            }),
          );
        }
      }
    }

    return lines;
  }

  private renderTotals(layout: TableLayout): string[] {
    const th = this.theme;
    const stats = this.data[this.activeTab];

    let totalRow = fitCell(th.bold("Total"), layout.nameWidth);
    for (const col of layout.columns) {
      const value = fitCell(col.getValue(stats.totals), col.width, "right");
      totalRow += col.dimmed ? th.fg("dim", value) : value;
    }

    return [th.fg("border", "─".repeat(layout.tableWidth)), totalRow, ""];
  }

  private renderFormulaNote(width: number): string[] {
    const line = pickFittingText(width, [
      "Tokens = Input + Output + CacheWrite  ·  ↑In = Input + CacheWrite  (as of 0.2.0)",
      "Tokens = In + Out + CacheWrite  ·  ↑In = In + CacheWrite  (v0.2.0+)",
      "Tokens & ↑In include CacheWrite (v0.2.0+)",
      "Incl. CacheWrite (v0.2.0+)",
    ]);
    return [this.theme.fg("dim", line), ""];
  }

  private renderHelp(width: number): string[] {
    const variants =
      this.viewMode === "insights"
        ? [
            "[Tab/←→] period  [v] table view  [q] close",
            "[Tab] period  [v] table  [q] close",
            "[v] table  [q] close",
            "[q] close",
          ]
        : [
            "[Tab/←→] period  [↑↓] select  [Enter] expand  [v] insights  [q] close",
            "[Tab] period  [↑↓] select  [Enter] expand  [v] insights  [q] close",
            "[↑↓] select  [Enter] expand  [v] insights  [q] close",
            "[↑↓] select  [v] insights  [q] close",
            "[↑↓] select  [q] close",
            "[q] close",
          ];
    const line = pickFittingText(width, variants);
    return [this.theme.fg("dim", line)];
  }

  invalidate(): void {}
  dispose(): void {}
}
