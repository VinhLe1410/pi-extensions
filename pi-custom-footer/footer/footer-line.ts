import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { RateWindow, UsageSnapshot } from "../core/types";
import type { FooterModel } from "./footer-model";

const SEPARATOR = " · ";
const RESET_ICON = "";

interface TpsTrackerState {
  phase: "generating" | "done";
  tps: number | null;
  tokens: number;
  elapsedSeconds: number;
  estimated: boolean;
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

function renderFastMode(theme: Theme): string {
  return theme.fg("accent", "fast");
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

function renderTopLine(
  footerModel: FooterModel,
  theme: Theme,
  usage: UsageSnapshot | null,
): string {
  const parts = [
    theme.fg("muted", footerModel.model.name),
    renderThinking(theme, footerModel.model.thinkingLevel),
    ...(footerModel.model.fastMode ? [renderFastMode(theme)] : []),
    ...usageWindows(usage).map((window) => renderUsageWindow(theme, window)),
  ];

  return parts.join(separator(theme));
}

function renderContextWindow(footerModel: FooterModel, theme: Theme): string {
  const { percentage, used, total } = footerModel.context;
  const value = total > 0 ? `${used}/${total}` : "?";
  return theme.fg("dim", "[context: ") + theme.fg(contextColor(percentage), value) + theme.fg("dim", "]");
}

function renderTpsStatus(state: TpsTrackerState | null, theme: Theme): string {
  if (!state) return "";

  const tpsLabel = state.tps === null
    ? state.phase === "generating" ? "calculating" : "N/A"
    : `${state.tps} tok/s`;

  return (
    theme.fg("dim", "[tps: ") +
    theme.fg("accent", tpsLabel) +
    theme.fg("dim", "]")
  );
}

function pinRight(left: string, right: string, width: number, theme: Theme): string {
  if (right.length === 0) return truncateToWidth(left, width, theme.fg("dim", "…"));

  const rightWidth = visibleWidth(right);
  if (rightWidth >= width) {
    return truncateToWidth(right, width, theme.fg("dim", "…"));
  }

  const minGap = 1;
  const leftBudget = Math.max(0, width - rightWidth - minGap);
  const trimmedLeft = truncateToWidth(left, leftBudget, theme.fg("dim", "…"));
  const gap = Math.max(minGap, width - visibleWidth(trimmedLeft) - rightWidth);
  return trimmedLeft + " ".repeat(gap) + right;
}

function renderLocationLine(footerModel: FooterModel, theme: Theme): string {
  const parts: string[] = [];

  if (footerModel.location.cwd) {
    parts.push(theme.fg("accent", footerModel.location.cwd));
  }

  const branch = footerModel.location.branch;
  if (branch) {
    const color = branch.dirty ? "warning" : "success";
    let text = theme.fg(color, branch.name);
    if (branch.dirty) text += theme.fg("warning", "*");
    if (branch.ahead) text += theme.fg("success", ` ↑${branch.ahead}`);
    if (branch.behind) text += theme.fg("error", ` ↓${branch.behind}`);
    parts.push(text);
  }

  return parts.join(separator(theme));
}

export function renderFooterLines(
  footerModel: FooterModel,
  width: number,
  theme: Theme,
  usage: UsageSnapshot | null,
  tpsState: TpsTrackerState | null,
): string[] {
  return [
    pinRight(
      renderTopLine(footerModel, theme, usage),
      renderContextWindow(footerModel, theme),
      width,
      theme,
    ),
    pinRight(
      renderLocationLine(footerModel, theme),
      renderTpsStatus(tpsState, theme),
      width,
      theme,
    ),
  ].filter((line) => line.length > 0);
}
