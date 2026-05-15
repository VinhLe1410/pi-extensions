import {
  buildSessionContext,
  type ExtensionContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import type { BorderLabels } from "./editor";
import type { GitCache, RateWindow, UsageSnapshot } from "../core/types";
import type { UsageState } from "../seams/usage-state";
import { contextColor, percentColor, RESET_ICON, separator, thinkingColor } from "./theme";

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

export function buildBorderLabels(
  ctx: ExtensionContext,
  theme: Theme,
  git: GitCache,
  usageState: UsageState,
): BorderLabels {
  const modelName = ctx.model?.name ?? null;
  const topLeft = modelName
    ? [theme.fg("accent", ` ${modelName}`), renderThinking(theme, getThinkingLevel(ctx))].join(separator(theme))
    : null;

  const usageLine = usageWindows(usageState.current())
    .map((window) => renderUsageWindow(theme, window))
    .join(separator(theme));

  const cwd = theme.fg("accent", compactPath(ctx.cwd, process.env.HOME || process.env.USERPROFILE));
  const branch = renderBranch(theme, git);

  return {
    topLeft,
    topRight: usageLine || null,
    bottomLeft: branch ? `${cwd}${separator(theme)}${branch}` : cwd,
    bottomRight: renderContextWindow(ctx, theme),
  };
}
