import type {
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { PromptUiConfig } from "../core/config";
import type { RateWindow, UsageSnapshot } from "../core/types";
import { collectExtensionStatusSegments } from "./extension-status";
import { percentColor, RESET_ICON } from "./theme";

const FOOTER_SEPARATOR = " | ";

function formatCwdLabel(cwd: string): string {
  const normalized = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

function renderLoadingBar(frame: string | undefined, trackChar: string, theme: Theme): string {
  if (!frame) return "";

  const dot = Array.from(trackChar)[0] ?? "·";
  return Array.from(frame)
    .map((char) => theme.fg(char === dot ? "dim" : "accent", char))
    .join("");
}

function renderCwd(ctx: ExtensionContext, theme: Theme): string {
  return theme.fg("accent", `󰝰 ${formatCwdLabel(ctx.cwd)}`);
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

function formatQuotaWindowLabel(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (normalized === "week" || normalized === "weekly" || normalized === "7d") return "7D";
  if (normalized === "5h") return "5H";
  if (normalized === "premium") return "PREM";
  return label.trim().toUpperCase();
}

function renderQuotaBadge(window: RateWindow, theme: Theme): string {
  const rounded = Math.max(0, Math.min(999, Math.round(window.usedPercent)));
  const label = theme.bg(
    "toolPendingBg",
    theme.bold(theme.fg("muted", ` ${formatQuotaWindowLabel(window.label)} `)),
  );
  const percent = theme.inverse(theme.bold(theme.fg(percentColor(rounded), ` ${rounded}% `)));
  const reset = window.resetsIn
    ? theme.bg("toolPendingBg", theme.fg("text", ` ${RESET_ICON} ${window.resetsIn} `))
    : "";

  return `${label}${percent}${reset}`;
}

function renderQuotaBadges(snapshot: UsageSnapshot | null, theme: Theme): string {
  return usageWindows(snapshot)
    .map((window) => renderQuotaBadge(window, theme))
    .join(theme.fg("borderMuted", " "));
}

function renderStatusChip(text: string, theme: Theme): string {
  return [theme.fg("success", ""), " ", theme.fg("dim", text)].join("");
}

function joinStatusTexts(statusTexts: string[], separator: string): string {
  return statusTexts.filter(Boolean).join(separator);
}

function fitStatusTexts(statusTexts: string[], maxWidth: number, separator: string): string {
  if (maxWidth <= 0) return "";

  const fitted: string[] = [];
  for (const text of statusTexts) {
    const candidate = joinStatusTexts([...fitted, text], separator);
    if (visibleWidth(candidate) <= maxWidth) {
      fitted.push(text);
      continue;
    }

    if (fitted.length === 0) {
      return maxWidth > 1 ? truncateToWidth(text, maxWidth, "…") : "";
    }
    break;
  }

  return joinStatusTexts(fitted, separator);
}

function appendStatusArea(base: string, statusText: string, separator: string): string {
  if (!base) return statusText;
  if (!statusText) return base;
  return `${base}${separator}${statusText}`;
}

function prependStatusArea(base: string, statusText: string, separator: string): string {
  if (!base) return statusText;
  if (!statusText) return base;
  return `${statusText}${separator}${base}`;
}

function composeBuiltInFooterContent(left: string, right: string, width: number): string {
  const leftWidth = visibleWidth(left);
  const rightWidth = visibleWidth(right);
  return leftWidth >= width
    ? truncateToWidth(left, width, "")
    : leftWidth + 1 + rightWidth <= width
      ? `${left}${" ".repeat(width - leftWidth - rightWidth)}${right}`
      : truncateToWidth(left, width, "");
}

function composeFooter(
  builtInLeft: string,
  builtInRight: string,
  extensionLeft: string[],
  extensionMiddle: string[],
  extensionRight: string[],
  separator: string,
  width: number,
): string {
  const builtInLeftWidth = visibleWidth(builtInLeft);
  const builtInRightWidth = visibleWidth(builtInRight);
  const minimumGap = builtInLeft && builtInRight ? 1 : 0;

  if (builtInLeftWidth + minimumGap + builtInRightWidth > width) {
    return composeBuiltInFooterContent(builtInLeft, builtInRight, width);
  }

  const available = Math.max(0, width - builtInLeftWidth - builtInRightWidth - minimumGap);
  let remaining = available;
  const leftConnectorWidth = builtInLeft && extensionLeft.length > 0 ? visibleWidth(separator) : 0;
  const rightConnectorWidth =
    builtInRight && extensionRight.length > 0 ? visibleWidth(separator) : 0;
  let leftStatus = "";
  let rightStatus = "";

  if (extensionLeft.length > 0 && extensionRight.length > 0) {
    const leftBudget = Math.max(0, Math.floor(available / 2) - leftConnectorWidth);
    leftStatus = fitStatusTexts(extensionLeft, leftBudget, separator);
    remaining -= leftStatus ? leftConnectorWidth + visibleWidth(leftStatus) : 0;

    const rightBudget = Math.max(0, remaining - rightConnectorWidth);
    rightStatus = fitStatusTexts(extensionRight, rightBudget, separator);
    remaining -= rightStatus ? rightConnectorWidth + visibleWidth(rightStatus) : 0;

    const expandedLeftBudget = Math.max(0, remaining + visibleWidth(leftStatus));
    const expandedLeftStatus = fitStatusTexts(extensionLeft, expandedLeftBudget, separator);
    if (visibleWidth(expandedLeftStatus) > visibleWidth(leftStatus)) {
      remaining += leftStatus ? leftConnectorWidth + visibleWidth(leftStatus) : 0;
      leftStatus = expandedLeftStatus;
      remaining -= leftStatus ? leftConnectorWidth + visibleWidth(leftStatus) : 0;
    }
  } else if (extensionLeft.length > 0) {
    leftStatus = fitStatusTexts(
      extensionLeft,
      Math.max(0, available - leftConnectorWidth),
      separator,
    );
    remaining -= leftStatus ? leftConnectorWidth + visibleWidth(leftStatus) : 0;
  } else if (extensionRight.length > 0) {
    rightStatus = fitStatusTexts(
      extensionRight,
      Math.max(0, available - rightConnectorWidth),
      separator,
    );
    remaining -= rightStatus ? rightConnectorWidth + visibleWidth(rightStatus) : 0;
  }

  const left = appendStatusArea(builtInLeft, leftStatus, separator);
  const right = prependStatusArea(builtInRight, rightStatus, separator);
  const gapWidth = Math.max(0, width - visibleWidth(left) - visibleWidth(right));
  const middle = fitStatusTexts(extensionMiddle, gapWidth, separator);
  const middleWidth = visibleWidth(middle);

  if (!middle || middleWidth <= 0) {
    return `${left}${" ".repeat(gapWidth)}${right}`;
  }

  const leftPadding = Math.floor((gapWidth - middleWidth) / 2);
  const rightPadding = gapWidth - middleWidth - leftPadding;
  return `${left}${" ".repeat(leftPadding)}${middle}${" ".repeat(rightPadding)}${right}`;
}

export function renderStatusFooter(
  ctx: ExtensionContext,
  footerData: ReadonlyFooterDataProvider,
  config: PromptUiConfig,
  usageSnapshot: UsageSnapshot | null,
  width: number,
  theme: Theme,
  loadingBarFrame?: string,
): string[] {
  if (width <= 0) return [""];

  const separator = theme.fg("dim", FOOTER_SEPARATOR);
  const left = [
    renderLoadingBar(loadingBarFrame, config.loadingBar.trackChar, theme),
    renderCwd(ctx, theme),
  ]
    .filter(Boolean)
    .join(" ");
  const right = renderQuotaBadges(usageSnapshot, theme);
  const extensionStatuses = collectExtensionStatusSegments(
    footerData.getExtensionStatuses(),
    config,
  );
  const renderExtensionStatus = (text: string) => renderStatusChip(text, theme);
  const innerWidth = width;
  const content = composeFooter(
    left,
    right,
    extensionStatuses.left.map((segment) => renderExtensionStatus(segment.text)),
    extensionStatuses.middle.map((segment) => renderExtensionStatus(segment.text)),
    extensionStatuses.right.map((segment) => renderExtensionStatus(segment.text)),
    separator,
    innerWidth,
  );
  return [truncateToWidth(content, width, "")];
}
