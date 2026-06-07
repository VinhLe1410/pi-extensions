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

export interface EditorMeta {
  modelLabel: string;
  thinkingLevel: string;
  contextMeter?: EditorContextMeter;
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

    return truncateToWidth(left, width, "");
  }

  private renderIdentityBadge(meta: EditorMeta): string {
    const model = this.labelTheme.bg(
      "toolPendingBg",
      this.labelTheme.bold(this.labelTheme.fg("text", ` ${meta.modelLabel} `)),
    );
    const effort = this.renderEffortBadge(meta.thinkingLevel);
    const context = meta.contextMeter ? `  ${this.renderContextMeter(meta.contextMeter)}` : "";

    return `${model}${effort}${context}`;
  }

  private renderEffortBadge(thinkingLevel: string): string {
    if (!thinkingLevel || thinkingLevel === "off") return "";

    return this.labelTheme.inverse(
      this.labelTheme.bold(
        this.labelTheme.fg(thinkingColor(thinkingLevel), ` ${thinkingLevel.toUpperCase()} `),
      ),
    );
  }

  private renderContextMeter(meter: EditorContextMeter): string {
    const label = truncateToWidth(meter.label, CONTEXT_METER_WIDTH - 2, "");
    const labelChars = Array.from(label);
    const labelWidth = visibleWidth(label);
    const labelStart = Math.max(0, Math.floor((CONTEXT_METER_WIDTH - labelWidth) / 2));
    const clampedPercent = Math.max(0, Math.min(100, meter.percent));
    const filledCells = Math.round((CONTEXT_METER_WIDTH * clampedPercent) / 100);
    const color = contextColor(meter.percent);

    return Array.from({ length: CONTEXT_METER_WIDTH }, (_, index) => {
      const labelIndex = index - labelStart;
      const labelChar =
        labelIndex >= 0 && labelIndex < labelChars.length ? labelChars[labelIndex] : undefined;
      const char = labelChar ?? " ";
      const isFilled = index < filledCells;

      if (isFilled) {
        return this.labelTheme.inverse(this.labelTheme.bold(this.labelTheme.fg(color, char)));
      }

      return this.labelTheme.bg(
        "toolPendingBg",
        labelChar ? this.labelTheme.fg("text", char) : char,
      );
    }).join("");
  }
}
