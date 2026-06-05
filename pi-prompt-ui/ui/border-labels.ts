import {
  buildSessionContext,
  type ExtensionContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import type { BorderItem, BorderLabels } from "./border-layout";
import type { GitCache, RateWindow, UsageSnapshot } from "../core/types";
import type { UsageState } from "../seams/usage-state";
import {
  contextColor,
  percentColor,
  RESET_ICON,
  thinkingColor,
} from "./theme";

const TOP_MODEL_PRIORITY = 50;
const TOP_THINKING_PRIORITY = 40;
const TOP_SESSION_USAGE_PRIORITY = 20;
const TOP_WEEKLY_USAGE_PRIORITY = 10;
const BOTTOM_CONTEXT_PRIORITY = 40;
const BOTTOM_BRANCH_PRIORITY = 30;
const BOTTOM_CWD_PRIORITY = 10;

function renderThinking(theme: Theme, thinkingLevel: string): string {
  const label = thinkingLevel === "off" ? "no-thinking" : thinkingLevel;
  return theme.fg(thinkingColor(thinkingLevel), `󰌶 ${label}`);
}

function renderUsageWindow(
  theme: Theme,
  window: RateWindow,
  thinkingLevel: string,
): string {
  const rounded = Math.round(window.usedPercent);
  const pct = theme.fg(percentColor(rounded), `${rounded}%`);
  const reset = window.resetsIn
    ? " " +
      theme.fg(thinkingColor(thinkingLevel), `${RESET_ICON} ${window.resetsIn}`)
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

function usageWindowPriority(window: RateWindow): number {
  const label = window.label.toLowerCase();
  return label.includes("week") || label === "7d"
    ? TOP_WEEKLY_USAGE_PRIORITY
    : TOP_SESSION_USAGE_PRIORITY;
}

function compactPath(path: string, homeDir: string | undefined): string {
  if (!homeDir || !path.startsWith(homeDir)) return path;
  return `~${path.slice(homeDir.length)}`;
}

function renderBranch(theme: Theme, git: GitCache): string | null {
  if (!git.branch) return null;

  const color = git.dirty ? "warning" : "success";
  let text = theme.fg(color, ` ${git.branch}`);
  if (git.dirty) text += theme.fg("warning", " *");
  if (git.ahead) text += theme.fg("success", ` ↑${git.ahead}`);
  if (git.behind) text += theme.fg("error", ` ↓${git.behind}`);
  return text;
}

export function getThinkingLevel(ctx: ExtensionContext): string {
  if (!ctx.model?.reasoning) return "off";

  const entries = ctx.sessionManager.getEntries();
  const leafId = ctx.sessionManager.getLeafId();
  return buildSessionContext(entries, leafId).thinkingLevel || "off";
}

function getContextPercentage(ctx: ExtensionContext): number {
  const usage = ctx.getContextUsage();
  const total = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
  const used = usage?.tokens ?? 0;
  return usage?.percent ?? (total > 0 ? (used / total) * 100 : 0);
}

function renderContextWindow(
  ctx: ExtensionContext,
  theme: Theme,
  thinkingLevel: string,
): string {
  const percentage = getContextPercentage(ctx);
  const value = `${Math.round(percentage)}%`;
  return (
    theme.fg(thinkingColor(thinkingLevel), "context: ") +
    theme.fg(contextColor(percentage), value)
  );
}

export function buildBorderLabels(
  ctx: ExtensionContext,
  theme: Theme,
  git: GitCache,
  usageState: UsageState,
  thinkingLevel = getThinkingLevel(ctx),
): BorderLabels {
  const modelName = ctx.model?.name ?? null;
  const topLeft: BorderItem[] = [
    ...(modelName
      ? [
          {
            id: "model",
            text: theme.fg("accent", ` ${modelName}`),
            priority: TOP_MODEL_PRIORITY,
          },
        ]
      : []),
    {
      id: "thinking",
      text: renderThinking(theme, thinkingLevel),
      priority: TOP_THINKING_PRIORITY,
    },
  ];

  const topRight: BorderItem[] = usageWindows(usageState.current()).map(
    (window, index) => ({
      id: `usage:${index}:${window.label}`,
      text: renderUsageWindow(theme, window, thinkingLevel),
      priority: usageWindowPriority(window),
    }),
  );

  const cwd = theme.fg(
    "accent",
    compactPath(ctx.cwd, process.env.HOME || process.env.USERPROFILE),
  );
  const branch = renderBranch(theme, git);
  const bottomLeft: BorderItem[] = [
    ...(branch
      ? [
          {
            id: "branch",
            text: branch,
            priority: BOTTOM_BRANCH_PRIORITY,
          },
        ]
      : []),
    {
      id: "cwd",
      text: cwd,
      priority: BOTTOM_CWD_PRIORITY,
    },
  ];

  return {
    top: {
      left: topLeft,
      right: topRight,
    },
    bottom: {
      left: bottomLeft,
      right: [
        {
          id: "context",
          text: renderContextWindow(ctx, theme, thinkingLevel),
          priority: BOTTOM_CONTEXT_PRIORITY,
        },
      ],
    },
  };
}
