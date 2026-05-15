import {
  CustomEditor,
  buildSessionContext,
  type ExtensionAPI,
  type ExtensionContext,
  type ReadonlyFooterDataProvider,
  type Theme,
  type ThemeColor,
} from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { PROVIDER_MAP, USAGE_REFRESH_INTERVAL } from "./core/config";
import type { GitCache, RateWindow, UsageSnapshot } from "./core/types";
import { createFetcherRegistry } from "./fetchers";
import { createAuthResolver } from "./seams/auth";
import { createGitState } from "./seams/git";
import { createUsageState, type UsageState } from "./seams/usage-state";

const INPUT_PADDING_LEFT = 1;
const SEPARATOR = " · ";
const RESET_ICON = "";
const GIT_REFRESH_INTERVAL_MS = 1000;

interface BorderLabels {
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

function separator(theme: Theme): string {
  return theme.fg("dim", SEPARATOR);
}

function percentColor(percent: number): ThemeColor {
  if (percent >= 85) return "error";
  if (percent >= 60) return "warning";
  return "success";
}

function contextColor(percent: number): ThemeColor {
  if (percent >= 60) return "error";
  if (percent >= 40) return "warning";
  return "success";
}

function thinkingColor(thinkingLevel: string): ThemeColor {
  switch (thinkingLevel) {
    case "minimal":
      return "thinkingMinimal";
    case "low":
      return "thinkingLow";
    case "medium":
      return "thinkingMedium";
    case "high":
      return "thinkingHigh";
    case "xhigh":
      return "thinkingXhigh";
    default:
      return "thinkingOff";
  }
}

function renderThinking(theme: Theme, thinkingLevel: string): string {
  const label = thinkingLevel === "off" ? "no-thinking" : thinkingLevel;
  return theme.fg(thinkingColor(thinkingLevel), label);
}

function renderUsageWindow(theme: Theme, window: RateWindow): string {
  const rounded = Math.round(window.usedPercent);
  const pct = theme.fg(percentColor(rounded), `${rounded}%`);
  const reset = window.resetsIn
    ? " " + theme.fg("dim", `${RESET_ICON} ${window.resetsIn}`)
    : "";
  return `${pct}${reset}`;
}

function usageWindows(snapshot: UsageSnapshot | null): RateWindow[] {
  if (!snapshot) return [];
  if (snapshot.provider.toLowerCase() === "copilot") {
    return snapshot.windows.filter(
      (window) => window.label.toLowerCase() === "premium",
    );
  }
  return snapshot.windows;
}

function compactPath(path: string, homeDir: string | undefined): string {
  if (!homeDir || !path.startsWith(homeDir)) return path;
  return `~${path.slice(homeDir.length)}`;
}

function renderBranch(theme: Theme, git: GitCache): string | null {
  if (!git.branch) return null;

  const color = git.dirty ? "warning" : "success";
  let text = theme.fg(color, ` ${git.branch}`);
  if (git.dirty) text += theme.fg("warning", "*");
  if (git.ahead) text += theme.fg("success", ` ↑${git.ahead}`);
  if (git.behind) text += theme.fg("error", ` ↓${git.behind}`);
  return text;
}

function getThinkingLevel(ctx: ExtensionContext): string {
  if (!ctx.model?.reasoning) return "off";

  const entries = ctx.sessionManager.getEntries();
  const leafId = ctx.sessionManager.getLeafId();
  return buildSessionContext(entries, leafId).thinkingLevel || "off";
}

function getContextInfo(ctx: ExtensionContext): { percentage: number; used: number; total: number } {
  const usage = ctx.getContextUsage();
  const total = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
  const used = usage?.tokens ?? 0;
  const percentage = usage?.percent ?? (total > 0 ? (used / total) * 100 : 0);
  return { percentage, used, total };
}

function renderContextWindow(ctx: ExtensionContext, theme: Theme): string {
  const { percentage, used, total } = getContextInfo(ctx);
  const value = total > 0 ? `${used}/${total}` : "?";
  return theme.fg("dim", "context: ") + theme.fg(contextColor(percentage), value);
}

function detectProvider(modelProvider: string | undefined): string | null {
  return modelProvider ? PROVIDER_MAP[modelProvider] || null : null;
}

function renderExtensionStatusFooter(
  footerData: ReadonlyFooterDataProvider,
  width: number,
  theme: Theme,
): string[] {
  const statusLine = Array.from(footerData.getExtensionStatuses().entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, text]) =>
      text
        .replace(/[\r\n\t]/g, " ")
        .replace(/ +/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join(" ");

  return statusLine
    ? [truncateToWidth(statusLine, width, theme.fg("dim", "…"))]
    : [];
}

class RoundedInputEditor extends CustomEditor {
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
    const trailingLines = bottomIndex === -1 ? [] : lines.slice(bottomIndex + 1);

    const wrapLine = (line: string): string => {
      const paddedLine = leftPadding + line;
      const content = padRight(truncateToWidth(paddedLine, innerWidth, ""), innerWidth);
      return this.borderColor("│") + content + this.borderColor("│");
    };
    const wrappedBodyLines = bodyLines.map(wrapLine);
    const wrappedSuggestionLines = trailingLines.map(wrapLine);

    const labels = this.getLabels();

    const emptyLine = this.borderColor("│") + " ".repeat(innerWidth) + this.borderColor("│");
    const suggestionSeparator = this.renderSectionSeparator(innerWidth, "Suggestions");

    return [
      this.renderBorder("top", innerWidth, labels.topLeft, labels.topRight),
      emptyLine,
      ...wrappedBodyLines,
      ...(wrappedSuggestionLines.length > 0
        ? [emptyLine, suggestionSeparator, emptyLine, ...wrappedSuggestionLines]
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

export default function (pi: ExtensionAPI) {
  const auth = createAuthResolver();
  const git = createGitState();
  const usage = createUsageState({
    registry: createFetcherRegistry(auth),
    intervalMs: USAGE_REFRESH_INTERVAL,
  });
  let activeTui: TUI | undefined;
  let lastGitRefresh = 0;
  let cleanupUsageListener: (() => void) | undefined;

  function refreshGitIfStale(): void {
    const now = Date.now();
    if (now - lastGitRefresh < GIT_REFRESH_INTERVAL_MS) return;
    lastGitRefresh = now;
    git.refresh();
  }

  function startUsageForProvider(modelProvider: string | undefined): void {
    const provider = detectProvider(modelProvider);
    if (!provider) {
      usage.stop();
      return;
    }
    usage.start(provider);
  }

  function buildLabels(ctx: ExtensionContext, theme: Theme, usageState: UsageState): BorderLabels {
    refreshGitIfStale();

    const modelName = ctx.model?.name ?? null;
    const topLeft = modelName
      ? [theme.fg("accent", ` ${modelName}`), renderThinking(theme, getThinkingLevel(ctx))].join(separator(theme))
      : null;

    const usageLine = usageWindows(usageState.current())
      .map((window) => renderUsageWindow(theme, window))
      .join(separator(theme));

    const cwd = theme.fg("accent", compactPath(ctx.cwd, process.env.HOME || process.env.USERPROFILE));
    const branch = renderBranch(theme, git.current());
    const bottomLeft = branch ? `${cwd}${separator(theme)}${branch}` : cwd;

    return {
      topLeft,
      topRight: usageLine || null,
      bottomLeft,
      bottomRight: renderContextWindow(ctx, theme),
    };
  }

  pi.on("session_start", (_event, ctx) => {
    git.refresh();
    lastGitRefresh = Date.now();
    if (!ctx.hasUI) return;

    startUsageForProvider(ctx.model?.provider);
    cleanupUsageListener?.();
    ctx.ui.setEditorComponent((tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => {
      cleanupUsageListener?.();
      activeTui = tui;
      cleanupUsageListener = usage.onChange(() => tui.requestRender());
      return new RoundedInputEditor(tui, theme, keybindings, () =>
        buildLabels(ctx, ctx.ui.theme, usage),
      );
    });

    ctx.ui.setFooter((_tui: TUI, theme: Theme, footerData: ReadonlyFooterDataProvider) => ({
      invalidate() {},
      render(width: number): string[] {
        return renderExtensionStatusFooter(footerData, width, theme);
      },
    }));
  });

  pi.on("session_shutdown", () => {
    cleanupUsageListener?.();
    cleanupUsageListener = undefined;
    activeTui = undefined;
    usage.stop();
  });

  pi.on("turn_end", () => {
    if (git.refresh()) activeTui?.requestRender();
    lastGitRefresh = Date.now();
  });

  pi.on("model_select", (event) => {
    startUsageForProvider(event.model.provider);
    activeTui?.requestRender();
  });

  pi.on("thinking_level_select", () => {
    activeTui?.requestRender();
  });
}
