import { CustomEditor } from "@earendil-works/pi-coding-agent";
import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  type EditorTheme,
  type TUI,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { contextColor, thinkingColor } from "./theme";

const RAIL_GAP = " ";
const CONTEXT_METER_WIDTH = 18;

export interface EditorContextMeter {
  percent: number;
  label: string;
}

export interface EditorBranchMeta {
  name: string;
  dirty: boolean;
  ahead: number;
  behind: number;
}

export interface EditorMeta {
  modelLabel: string;
  thinkingLevel: string;
  contextMeter?: EditorContextMeter;
  branch?: EditorBranchMeta;
}

export interface EditorChrome {
  meta: EditorMeta;
}

type AutocompleteEditorInternals = {
  autocompleteList?: Pick<Component, "render">;
  isShowingAutocomplete?: () => boolean;
};

function padRight(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

function clampRenderedLines(lines: string[], width: number): string[] {
  const maxWidth = Math.max(0, width);
  return lines.map((line) => truncateToWidth(line, maxWidth, ""));
}

export class PolishedInputEditor extends CustomEditor {
  private getChrome: () => EditorChrome;
  private labelTheme: Theme;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    getChrome: () => EditorChrome,
    labelTheme: Theme,
  ) {
    super(tui, theme, keybindings, { paddingX: 0 });
    this.borderColor = (text: string) => labelTheme.fg("border", text);
    this.getChrome = getChrome;
    this.labelTheme = labelTheme;
  }

  render(width: number): string[] {
    if (width <= 2) return clampRenderedLines(super.render(width), width);

    const { meta } = this.getChrome();
    const rail = this.renderRail();
    const railWidth = visibleWidth(rail);
    const innerWidth = Math.max(1, width - railWidth);
    const rendered = super.render(innerWidth);
    const editorInternals = this as unknown as AutocompleteEditorInternals;
    const isShowingAutocomplete =
      typeof editorInternals.isShowingAutocomplete === "function" &&
      editorInternals.isShowingAutocomplete();

    if (rendered.length < 2) {
      return clampRenderedLines(super.render(width), width);
    }

    const { autocompleteList } = editorInternals;
    const autocompleteCount =
      isShowingAutocomplete && typeof autocompleteList?.render === "function"
        ? autocompleteList.render(innerWidth).length
        : 0;
    const editorFrame =
      autocompleteCount > 0 && autocompleteCount < rendered.length
        ? rendered.slice(0, -autocompleteCount)
        : rendered;
    const autocompleteLines =
      autocompleteCount > 0 && autocompleteCount < rendered.length
        ? rendered.slice(-autocompleteCount)
        : [];

    if (editorFrame.length < 2) return clampRenderedLines(rendered, width);

    const editorLines = editorFrame.slice(1, -1);
    const metadata = this.renderMetadata(meta, innerWidth);
    const lines = ["", ...editorLines, "", metadata];
    const top = this.renderBorder(width);
    const bottom = this.renderBorder(width);

    return clampRenderedLines(
      [
        top,
        ...lines.map((line) => `${rail}${this.fillLine(line, innerWidth)}`),
        bottom,
        ...autocompleteLines,
      ],
      width,
    );
  }

  private renderRail(): string {
    return this.borderColor("│") + RAIL_GAP;
  }

  private renderBorder(width: number): string {
    return this.labelTheme.fg("borderMuted", "─".repeat(Math.max(0, width)));
  }

  private fillLine(content: string, width: number): string {
    return padRight(truncateToWidth(content, Math.max(0, width), ""), width);
  }

  private renderMetadata(meta: EditorMeta, width: number): string {
    const left = this.renderIdentityBadge(meta);
    const right = meta.contextMeter ? this.renderContextMeter(meta.contextMeter) : "";

    if (!right) return truncateToWidth(left, width, "");

    const leftWidth = visibleWidth(left);
    const rightWidth = visibleWidth(right);
    const gapWidth = width - leftWidth - rightWidth;
    if (gapWidth >= 2) return `${left}${" ".repeat(gapWidth)}${right}`;

    return truncateToWidth(left, width, "");
  }

  private renderIdentityBadge(meta: EditorMeta): string {
    const model = this.labelTheme.bg(
      "toolPendingBg",
      this.labelTheme.bold(this.labelTheme.fg("text", ` ${meta.modelLabel} `)),
    );
    const effort = this.renderEffortBadge(meta.thinkingLevel);
    const branch = meta.branch ? `  ${this.renderBranchBadge(meta.branch)}` : "";

    return `${model}${effort}${branch}`;
  }

  private renderEffortBadge(thinkingLevel: string): string {
    if (!thinkingLevel || thinkingLevel === "off") return "";

    return this.labelTheme.inverse(
      this.labelTheme.bold(
        this.labelTheme.fg(thinkingColor(thinkingLevel), ` ${thinkingLevel.toUpperCase()} `),
      ),
    );
  }

  private renderBranchBadge(branch: EditorBranchMeta): string {
    const color = branch.dirty ? "warning" : "success";
    const ahead = branch.ahead > 0 ? this.labelTheme.fg("success", ` ↑${branch.ahead}`) : "";
    const behind = branch.behind > 0 ? this.labelTheme.fg("error", ` ↓${branch.behind}`) : "";
    const dirty = branch.dirty ? this.labelTheme.fg("warning", " *") : "";

    return [
      this.labelTheme.fg(color, " "),
      this.labelTheme.bold(this.labelTheme.fg(color, branch.name)),
      dirty,
      ahead,
      behind,
    ].join("");
  }

  private renderContextMeter(meter: EditorContextMeter): string {
    const clampedPercent = Math.max(0, Math.min(100, meter.percent));
    const filledCells = Math.round((CONTEXT_METER_WIDTH * clampedPercent) / 100);
    const color = contextColor(meter.percent);
    const bar = Array.from({ length: CONTEXT_METER_WIDTH }, (_, index) => {
      const isFilled = index < filledCells;
      return this.labelTheme.fg(isFilled ? color : "borderMuted", isFilled ? "━" : "─");
    }).join("");

    return [
      this.labelTheme.fg("muted", "CTX"),
      this.labelTheme.fg("borderMuted", " "),
      bar,
      this.labelTheme.fg("borderMuted", " "),
      this.labelTheme.bold(this.labelTheme.fg("text", meter.label)),
    ].join("");
  }
}
