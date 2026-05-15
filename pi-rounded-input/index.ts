import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";

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

const INPUT_PADDING_LEFT = 1;

class RoundedInputEditor extends CustomEditor {
  render(width: number): string[] {
    if (width < 2) return super.render(width);

    const innerWidth = width - 2;
    const contentWidth = Math.max(1, innerWidth - INPUT_PADDING_LEFT);
    const leftPadding = " ".repeat(Math.min(INPUT_PADDING_LEFT, innerWidth));
    const lines = super.render(contentWidth);
    const bottomIndex = lines.findIndex((line, index) => index > 0 && isHorizontalBorder(line));
    const bodyEnd = bottomIndex === -1 ? lines.length : bottomIndex;
    const bodyLines = lines.slice(1, bodyEnd);
    const trailingLines = bottomIndex === -1 ? [] : lines.slice(bottomIndex + 1);

    const wrappedLines = [...bodyLines, ...trailingLines].map((line) => {
      const paddedLine = leftPadding + line;
      const content = padRight(truncateToWidth(paddedLine, innerWidth, ""), innerWidth);
      return this.borderColor("│") + content + this.borderColor("│");
    });

    return [
      this.borderColor(`╭${"─".repeat(innerWidth)}╮`),
      ...wrappedLines,
      this.borderColor(`╰${"─".repeat(innerWidth)}╯`),
    ];
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;

    ctx.ui.setEditorComponent((tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) =>
      new RoundedInputEditor(tui, theme, keybindings),
    );
  });
}
