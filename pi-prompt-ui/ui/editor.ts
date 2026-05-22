import { CustomEditor } from "@earendil-works/pi-coding-agent";
import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  renderBorderLine,
  type BorderLabels,
  type BorderLine,
} from "./border-layout";
import { separator } from "./theme";

const INPUT_PADDING_LEFT = 0;

export interface EditorChrome {
  labels: BorderLabels;
}

function padRight(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function isHorizontalBorder(line: string): boolean {
  const plain = stripAnsi(line);
  return plain.length > 0 && /^[─ ↑↓0-9more]+$/.test(plain) && plain.includes("─");
}

export class RoundedInputEditor extends CustomEditor {
  private getChrome: () => EditorChrome;
  private labelTheme: Theme;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    getChrome: () => EditorChrome,
    labelTheme: Theme,
  ) {
    super(tui, theme, keybindings);
    this.getChrome = getChrome;
    this.labelTheme = labelTheme;
  }

  render(width: number): string[] {
    if (width < 1) return super.render(width);

    const lineWidth = width;
    const contentWidth = Math.max(1, lineWidth - INPUT_PADDING_LEFT);
    const leftPadding = " ".repeat(Math.min(INPUT_PADDING_LEFT, lineWidth));
    const lines = super.render(contentWidth);
    const bottomIndex = lines.findIndex((line, index) => index > 0 && isHorizontalBorder(line));
    const bodyEnd = bottomIndex === -1 ? lines.length : bottomIndex;
    const bodyLines = lines.slice(1, bodyEnd);
    const suggestionLines = bottomIndex === -1 ? [] : lines.slice(bottomIndex + 1);

    const { labels } = this.getChrome();
    const wrapLine = (line: string): string => {
      const paddedLine = leftPadding + line;
      return padRight(truncateToWidth(paddedLine, lineWidth, ""), lineWidth);
    };

    return [
      this.renderRule(lineWidth, labels.top),
      ...bodyLines.map(wrapLine),
      ...(suggestionLines.length > 0
        ? [
            this.renderSectionSeparator(lineWidth, "󰳽 auto-suggestions"),
            wrapLine(""),
            ...suggestionLines.map(wrapLine),
            wrapLine(""),
          ]
        : []),
      this.renderRule(lineWidth, labels.bottom),
    ];
  }

  private renderSectionSeparator(lineWidth: number, label: string): string {
    const labelText = ` ${label} `;
    const styledLabel = this.labelTheme.fg("dim", labelText);
    const prefix = "──";
    const fill = Math.max(0, lineWidth - visibleWidth(labelText) - visibleWidth(prefix));
    return this.borderColor(prefix) + styledLabel + this.borderColor("─".repeat(fill));
  }

  private renderRule(lineWidth: number, line: BorderLine): string {
    return renderBorderLine({
      lineWidth,
      line,
      separator: separator(this.labelTheme),
      borderColor: (text) => this.borderColor(text),
    });
  }
}
