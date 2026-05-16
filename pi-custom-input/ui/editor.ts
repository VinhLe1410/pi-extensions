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
    if (width < 2) return super.render(width);

    const innerWidth = width - 2;
    const contentWidth = Math.max(1, innerWidth - INPUT_PADDING_LEFT);
    const leftPadding = " ".repeat(Math.min(INPUT_PADDING_LEFT, innerWidth));
    const lines = super.render(contentWidth);
    const bottomIndex = lines.findIndex((line, index) => index > 0 && isHorizontalBorder(line));
    const bodyEnd = bottomIndex === -1 ? lines.length : bottomIndex;
    const bodyLines = lines.slice(1, bodyEnd);
    const suggestionLines = bottomIndex === -1 ? [] : lines.slice(bottomIndex + 1);

    const { labels, backgroundAnsi } = this.getChrome();
    const applyBackground = createBackgroundApplier(backgroundAnsi);
    const wrapLine = (line: string): string => {
      const paddedLine = leftPadding + line;
      const content = padRight(truncateToWidth(paddedLine, innerWidth, ""), innerWidth);
      return this.borderColor("│") + applyBackground(content) + this.borderColor("│");
    };

    return [
      this.renderBorder("top", innerWidth, labels.topLeft, labels.topRight),
      wrapLine(""),
      ...bodyLines.map(wrapLine),
      wrapLine(""),
      ...(suggestionLines.length > 0
        ? [
            this.renderSectionSeparator(innerWidth, "auto-suggestions"),
            wrapLine(""),
            ...suggestionLines.map(wrapLine),
            wrapLine(""),
          ]
        : []),
      this.renderBorder("bottom", innerWidth, labels.bottomLeft, labels.bottomRight),
    ];
  }

  private renderSectionSeparator(innerWidth: number, label: string): string {
    const labelText = ` ${label} `;
    const styledLabel = this.labelTheme.fg("dim", labelText);
    const fill = Math.max(0, innerWidth - visibleWidth(labelText) - 1);
    return this.borderColor("├─") + styledLabel + this.borderColor(`${"─".repeat(fill)}┤`);
  }

  private renderBorder(
    position: "top" | "bottom",
    innerWidth: number,
    left: string | null,
    right: string | null,
  ): string {
    const open = position === "top" ? "╭" : "╰";
    const close = position === "top" ? "╮" : "╯";
    if (innerWidth < 3 || (!left && !right)) {
      return this.borderColor(`${open}${"─".repeat(innerWidth)}${close}`);
    }

    const leftText = left ? ` ${left} ` : "";
    const rightText = right ? ` ${right} ` : "";
    const leftCapWidth = leftText ? 1 : 0;
    const rightCapWidth = rightText ? 1 : 0;
    const reserved = visibleWidth(leftText) + visibleWidth(rightText) + leftCapWidth + rightCapWidth;

    if (reserved >= innerWidth) {
      const label = truncateToWidth(leftText || rightText, Math.max(0, innerWidth - 1), "");
      const fill = Math.max(0, innerWidth - visibleWidth(label) - 1);
      return this.borderColor(`${open}─`) + label + this.borderColor(`${"─".repeat(fill)}${close}`);
    }

    const gap = Math.max(1, innerWidth - reserved);
    return (
      this.borderColor(open + (leftText ? "─" : "")) +
      leftText +
      this.borderColor("─".repeat(gap)) +
      rightText +
      this.borderColor((rightText ? "─" : "") + close)
    );
  }
}
