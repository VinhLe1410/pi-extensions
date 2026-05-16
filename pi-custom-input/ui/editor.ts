import { CustomEditor } from "@earendil-works/pi-coding-agent";
import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const INPUT_PADDING_LEFT = 1;

export interface BorderLabels {
  topLeft: string | null;
  topRight: string | null;
  bottomLeft: string | null;
  bottomRight: string | null;
}

export interface EditorChrome {
  labels: BorderLabels;
  backgroundAnsi: string | null;
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

function reapplyBackgroundAfterReset(text: string, backgroundAnsi: string): string {
  return text
    .replace(/\x1b\[(?:0)?m/g, (reset) => `${reset}${backgroundAnsi}`)
    .replace(/\x1b\[49m/g, (reset) => `${reset}${backgroundAnsi}`);
}

function createBackgroundApplier(backgroundAnsi: string | null): (text: string) => string {
  if (!backgroundAnsi) return (text) => text;

  return (text) => {
    if (!text.includes("\x1b[")) return `${backgroundAnsi}${text}\x1b[49m`;
    return `${backgroundAnsi}${reapplyBackgroundAfterReset(text, backgroundAnsi)}\x1b[49m`;
  };
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

    const { labels, backgroundAnsi } = this.getChrome();
    const applyBackground = createBackgroundApplier(backgroundAnsi);
    const wrapLine = (line: string): string => {
      const paddedLine = leftPadding + line;
      const content = padRight(truncateToWidth(paddedLine, lineWidth, ""), lineWidth);
      return applyBackground(content);
    };

    return [
      this.renderRule(lineWidth, labels.topLeft, labels.topRight),
      wrapLine(""),
      ...bodyLines.map(wrapLine),
      wrapLine(""),
      ...(suggestionLines.length > 0
        ? [
            this.renderSectionSeparator(lineWidth, "auto-suggestions"),
            wrapLine(""),
            ...suggestionLines.map(wrapLine),
            wrapLine(""),
          ]
        : []),
      this.renderRule(lineWidth, labels.bottomLeft, labels.bottomRight),
    ];
  }

  private renderSectionSeparator(lineWidth: number, label: string): string {
    const labelText = ` ${label} `;
    const styledLabel = this.labelTheme.fg("dim", labelText);
    const prefix = "──";
    const fill = Math.max(0, lineWidth - visibleWidth(labelText) - visibleWidth(prefix));
    return this.borderColor(prefix) + styledLabel + this.borderColor("─".repeat(fill));
  }

  private renderRule(
    lineWidth: number,
    left: string | null,
    right: string | null,
  ): string {
    if (lineWidth < 1) return "";
    if (!left && !right) return this.borderColor("─".repeat(lineWidth));

    const leftText = left ? ` ${left} ` : "";
    const rightText = right ? ` ${right} ` : "";
    const leftPrefix = leftText ? "──" : "";
    const rightSuffix = rightText ? "──" : "";
    const reserved = visibleWidth(leftPrefix) + visibleWidth(leftText) + visibleWidth(rightText) + visibleWidth(rightSuffix);

    if (reserved >= lineWidth) {
      return truncateToWidth(leftText || rightText, lineWidth, "");
    }

    const gap = lineWidth - reserved;
    return this.borderColor(leftPrefix) + leftText + this.borderColor("─".repeat(gap)) + rightText + this.borderColor(rightSuffix);
  }
}
