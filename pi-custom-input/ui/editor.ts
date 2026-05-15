import { CustomEditor } from "@earendil-works/pi-coding-agent";
import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const INPUT_PADDING_LEFT = 1;

export interface BorderLabels {
  topLeft: string | null;
  topRight: string | null;
  bottomLeft: string | null;
  bottomRight: string | null;
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
  private getLabels: () => BorderLabels;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    getLabels: () => BorderLabels,
  ) {
    super(tui, theme, keybindings);
    this.getLabels = getLabels;
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

    const wrapLine = (line: string): string => {
      const paddedLine = leftPadding + line;
      const content = padRight(truncateToWidth(paddedLine, innerWidth, ""), innerWidth);
      return this.borderColor("│") + content + this.borderColor("│");
    };

    const labels = this.getLabels();
    const emptyLine = this.borderColor("│") + " ".repeat(innerWidth) + this.borderColor("│");

    return [
      this.renderBorder("top", innerWidth, labels.topLeft, labels.topRight),
      emptyLine,
      ...bodyLines.map(wrapLine),
      ...(suggestionLines.length > 0
        ? [emptyLine, this.renderSectionSeparator(innerWidth, "Suggestions"), emptyLine, ...suggestionLines.map(wrapLine)]
        : []),
      emptyLine,
      this.renderBorder("bottom", innerWidth, labels.bottomLeft, labels.bottomRight),
    ];
  }

  private renderSectionSeparator(innerWidth: number, label: string): string {
    const labelText = ` ${label} `;
    const fill = Math.max(0, innerWidth - visibleWidth(labelText) - 1);
    return this.borderColor("├─") + labelText + this.borderColor(`${"─".repeat(fill)}┤`);
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
