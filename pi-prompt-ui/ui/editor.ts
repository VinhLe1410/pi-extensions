import { CustomEditor } from "@earendil-works/pi-coding-agent";
import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  type EditorTheme,
  type TUI,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

const RAIL_GAP = " ";

export interface EditorMeta {
  modelLabel: string;
  providerLabel: string;
  thinkingLabel?: string;
  quotaLabels: string[];
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
    const metadata = this.renderMetadata();
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
    return this.labelTheme.fg("accent", "│") + RAIL_GAP;
  }

  private renderBorder(width: number): string {
    return this.labelTheme.fg("borderMuted", "─".repeat(Math.max(0, width)));
  }

  private fillLine(content: string, width: number): string {
    return padRight(truncateToWidth(content, Math.max(0, width), ""), width);
  }

  private renderMetadata(): string {
    const { meta } = this.getChrome();
    const separator = this.labelTheme.fg("borderMuted", "  ");
    return [
      meta.modelLabel,
      meta.providerLabel,
      meta.thinkingLabel,
      ...meta.quotaLabels,
    ]
      .filter((part): part is string => Boolean(part))
      .join(separator);
  }
}
