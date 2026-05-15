import { execFileSync } from "node:child_process";
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
const BRANCH_CACHE_MS = 1000;

function createBranchGetter(cwd: string): () => string | null {
  let cachedBranch: string | null = null;
  let lastRefresh = 0;

  return () => {
    const now = Date.now();
    if (now - lastRefresh < BRANCH_CACHE_MS) return cachedBranch;
    lastRefresh = now;

    try {
      const branch = execFileSync("git", ["branch", "--show-current"], {
        cwd,
        encoding: "utf8",
        timeout: 1000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      cachedBranch = branch || null;
    } catch {
      cachedBranch = null;
    }

    return cachedBranch;
  };
}

class RoundedInputEditor extends CustomEditor {
  private getLabel: () => string | null;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    getLabel: () => string | null,
  ) {
    super(tui, theme, keybindings);
    this.getLabel = getLabel;
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
    const trailingLines = bottomIndex === -1 ? [] : lines.slice(bottomIndex + 1);

    const wrappedLines = [...bodyLines, ...trailingLines].map((line) => {
      const paddedLine = leftPadding + line;
      const content = padRight(truncateToWidth(paddedLine, innerWidth, ""), innerWidth);
      return this.borderColor("│") + content + this.borderColor("│");
    });

    const label = this.getLabel();
    const topBorder = label && innerWidth >= 3
      ? this.renderTopBorderWithLabel(innerWidth, label)
      : this.borderColor(`╭${"─".repeat(innerWidth)}╮`);

    return [
      topBorder,
      ...wrappedLines,
      this.borderColor(`╰${"─".repeat(innerWidth)}╯`),
    ];
  }

  private renderTopBorderWithLabel(innerWidth: number, label: string): string {
    const availableLabelWidth = Math.max(0, innerWidth - 2);
    const labelText = truncateToWidth(` ${label} `, availableLabelWidth, "");
    const rightWidth = Math.max(0, innerWidth - visibleWidth(labelText) - 1);

    return (
      this.borderColor("╭─") +
      labelText +
      this.borderColor(`${"─".repeat(rightWidth)}╮`)
    );
  }
}

export default function (pi: ExtensionAPI) {
  let modelName: string | null = null;

  pi.on("model_select", (event) => {
    modelName = event.model.name;
  });

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;

    modelName = ctx.model?.name ?? null;
    const getBranch = createBranchGetter(ctx.cwd);
    const getLabel = () => {
      if (!modelName) return null;

      const branch = getBranch();
      return branch ? ` ${modelName} ❯  ${branch}` : ` ${modelName}`;
    };

    ctx.ui.setEditorComponent((tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) =>
      new RoundedInputEditor(tui, theme, keybindings, getLabel),
    );
  });
}
