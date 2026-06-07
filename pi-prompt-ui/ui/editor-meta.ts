import {
  buildSessionContext,
  type ExtensionContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import type { RateWindow, UsageSnapshot } from "../core/types";
import type { UsageState } from "../seams/usage-state";
import { percentColor, RESET_ICON } from "./theme";
import type { EditorMeta } from "./editor";

function usageWindows(snapshot: UsageSnapshot | null): RateWindow[] {
  if (!snapshot) return [];
  if (snapshot.provider.toLowerCase() === "copilot") {
    return snapshot.windows.filter(
      (window) => window.label.toLowerCase() === "premium",
    );
  }
  return snapshot.windows;
}

function renderQuotaWindow(theme: Theme, window: RateWindow): string {
  const rounded = Math.round(window.usedPercent);
  const pct = theme.fg(percentColor(rounded), `${rounded}%`);
  const reset = window.resetsIn
    ? theme.fg("dim", ` ${RESET_ICON} ${window.resetsIn}`)
    : "";

  return `${pct}${reset}`;
}

export function getThinkingLevel(ctx: ExtensionContext): string {
  if (!ctx.model?.reasoning) return "off";

  const entries = ctx.sessionManager.getEntries();
  const leafId = ctx.sessionManager.getLeafId();
  return buildSessionContext(entries, leafId).thinkingLevel || "off";
}

export function buildEditorMeta(
  ctx: ExtensionContext,
  theme: Theme,
  usageState: UsageState,
  thinkingLevel = getThinkingLevel(ctx),
): EditorMeta {
  const modelLabel = ctx.model?.name ?? ctx.model?.id ?? "no-model";

  return {
    modelLabel,
    thinkingLevel,
    quotaLabels: usageWindows(usageState.current()).map((window) =>
      renderQuotaWindow(theme, window),
    ),
  };
}
