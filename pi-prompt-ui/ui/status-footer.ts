import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { PromptUiConfig } from "../core/config";
import type { GitStatusSummary } from "../seams/git";
import type { RuntimeInfo } from "../seams/runtime";
import { collectExtensionStatusSegments } from "./extension-status";
import { contextColor } from "./theme";

const FOOTER_SEPARATOR = " | ";

const terminalColorCodes = new Map([
  ["black", 30],
  ["red", 31],
  ["green", 32],
  ["yellow", 33],
  ["blue", 34],
  ["purple", 35],
  ["cyan", 36],
  ["white", 37],
  ["bright-black", 90],
  ["bright-red", 91],
  ["bright-green", 92],
  ["bright-yellow", 93],
  ["bright-blue", 94],
  ["bright-purple", 95],
  ["bright-cyan", 96],
  ["bright-white", 97],
]);

const terminalStyleModifiers = new Map([
  ["bold", 1],
  ["dim", 2],
  ["dimmed", 2],
  ["italic", 3],
  ["underline", 4],
]);

function formatCount(value: number): string {
  if (value < 1000) return `${value}`;
  if (value < 10_000) return `${(value / 1000).toFixed(1)}k`;
  return `${Math.round(value / 1000)}k`;
}

function formatCwdLabel(cwd: string): string {
  const normalized = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{6})$/.test(value);
}

function terminalColorToAnsi(color: string, isBackground = false): string | undefined {
  const normalized = color.toLowerCase();
  const colorCode = terminalColorCodes.get(normalized);
  if (colorCode !== undefined) return `${isBackground ? colorCode + 10 : colorCode}`;

  if (/^(?:[0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/.test(normalized)) {
    return `${isBackground ? 48 : 38};5;${normalized}`;
  }

  if (isHexColor(normalized)) {
    const r = Number.parseInt(normalized.slice(1, 3), 16);
    const g = Number.parseInt(normalized.slice(3, 5), 16);
    const b = Number.parseInt(normalized.slice(5, 7), 16);
    return `${isBackground ? 48 : 38};2;${r};${g};${b}`;
  }

  return undefined;
}

function renderTerminalStyle(style: string, text: string): string {
  const codes: string[] = [];
  for (const token of style.trim().split(/\s+/)) {
    if (!token) continue;

    const normalized = token.toLowerCase();
    const modifier = terminalStyleModifiers.get(normalized);
    if (modifier !== undefined) {
      codes.push(`${modifier}`);
      continue;
    }

    const isForeground = normalized.startsWith("fg:");
    const isBackground = normalized.startsWith("bg:");
    const colorName = isForeground || isBackground ? normalized.slice(3) : normalized;
    const color = terminalColorToAnsi(colorName, isBackground);
    if (color) codes.push(color);
  }

  return codes.length ? `\x1b[${codes.join(";")}m${text}\x1b[0m` : text;
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

function renderGitStatus(git: GitStatusSummary, theme: Theme): string {
  const status = [
    git.conflicted > 0 ? "=" : "",
    git.stashed ? "$" : "",
    git.deleted > 0 ? "✘" : "",
    git.renamed > 0 ? "»" : "",
    git.modified > 0 ? "!" : "",
    git.typechanged > 0 ? "T" : "",
    git.staged > 0 ? "+" : "",
    git.untracked > 0 ? "?" : "",
  ].join("");
  const aheadBehind =
    git.ahead > 0 && git.behind > 0
      ? "⇕"
      : git.ahead > 0
        ? "↑"
        : git.behind > 0
          ? "↓"
          : "";

  return status || aheadBehind ? theme.fg("warning", `[${status}${aheadBehind}]`) : "";
}

function renderBranch(git: GitStatusSummary, theme: Theme): string {
  if (!git.branch) return "";

  return ["on", theme.fg("success", ` ${git.branch}`), renderGitStatus(git, theme)]
    .filter(Boolean)
    .join(" ");
}

function renderRuntime(runtime: RuntimeInfo | undefined, theme: Theme): string {
  if (!runtime) return "";

  const label = runtime.version ? `${runtime.symbol} ${runtime.version}` : runtime.symbol;
  return `${theme.fg("dim", "via")} ${renderTerminalStyle(runtime.style, label)}`;
}

function renderContext(ctx: ExtensionContext, theme: Theme): string {
  const usage = ctx.getContextUsage();
  const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow;
  if (!usage || !contextWindow || contextWindow <= 0) return theme.fg("dim", "ctx --");

  const percent = usage.percent ?? ((usage.tokens ?? 0) / contextWindow) * 100;
  const clamped = Math.max(0, Math.min(999, Math.round(percent)));
  return [
    theme.fg("dim", "ctx "),
    theme.fg(contextColor(clamped), `${clamped}%`),
    theme.fg("dim", `/${formatCount(contextWindow)}`),
  ].join("");
}

function getUsageTotals(ctx: ExtensionContext): { input: number; output: number; cost: number } {
  let input = 0;
  let output = 0;
  let cost = 0;

  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    const message = entry.message as AssistantMessage;
    input += message.usage?.input ?? 0;
    output += message.usage?.output ?? 0;
    cost += message.usage?.cost?.total ?? 0;
  }

  return { input, output, cost };
}

function renderTokens(totals: { input: number; output: number }, theme: Theme): string {
  return theme.fg("dim", `↑${formatCount(totals.input)} ↓${formatCount(totals.output)}`);
}

function renderCost(cost: number, theme: Theme): string {
  return theme.fg("success", `$${cost.toFixed(3)}`);
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
  git: GitStatusSummary,
  runtime: RuntimeInfo | undefined,
  config: PromptUiConfig,
  width: number,
  theme: Theme,
  loadingBarFrame?: string,
): string[] {
  if (width <= 0) return [""];

  const separator = theme.fg("dim", FOOTER_SEPARATOR);
  const totals = getUsageTotals(ctx);
  const left = [
    renderLoadingBar(loadingBarFrame, config.loadingBar.trackChar, theme),
    renderCwd(ctx, theme),
    renderBranch(git, theme),
    renderRuntime(runtime, theme),
  ]
    .filter(Boolean)
    .join(" ");
  const right = [renderContext(ctx, theme), renderTokens(totals, theme), renderCost(totals.cost, theme)].join(
    separator,
  );
  const extensionStatuses = collectExtensionStatusSegments(
    footerData.getExtensionStatuses(),
    config,
  );
  const renderExtensionStatus = (text: string) => renderStatusChip(text, theme);
  const innerWidth = Math.max(1, width - 2);
  const content = composeFooter(
    left,
    right,
    extensionStatuses.left.map((segment) => renderExtensionStatus(segment.text)),
    extensionStatuses.middle.map((segment) => renderExtensionStatus(segment.text)),
    extensionStatuses.right.map((segment) => renderExtensionStatus(segment.text)),
    separator,
    innerWidth,
  );
  const framed = width > 2 ? ` ${content} ` : content;
  return [truncateToWidth(framed, width, "")];
}
