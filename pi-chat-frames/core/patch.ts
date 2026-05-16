import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FrameKind, Renderable, ToolState } from "./types";
import { ORIGINAL_RENDER, PATCHED } from "./symbols";
import { renderFrame, type FrameOptions } from "../ui/frame";
import { dimColor, labelColor } from "../ui/theme";
import { insertBeforeTrailingAnsi, stripAnsi } from "../ui/ansi";

interface ToolExecutionLike extends Component {
  toolName?: string;
  args?: unknown;
  isPartial?: boolean;
  result?: { isError?: boolean };
  callRendererComponent?: Component;
  resultRendererComponent?: Component;
  getRenderShell?: () => "default" | "self";
}

interface ToolHeaderInfo {
  line: string;
  span: number;
}

function asToolExecution(component: Component): ToolExecutionLike {
  return component as ToolExecutionLike;
}

function getToolState(component: Component): ToolState {
  const tool = asToolExecution(component);
  if (tool.result?.isError) return "error";
  if (tool.result && !tool.isPartial) return "success";
  return "pending";
}

function getBashHeader(tool: ToolExecutionLike, renderWidth: number): string | undefined {
  if (tool.toolName !== "bash" || !tool.args || typeof tool.args !== "object") {
    return undefined;
  }

  const args = tool.args as { command?: unknown; timeout?: unknown };
  if (typeof args.command !== "string" || args.command.length === 0) {
    return undefined;
  }

  const commandLine = args.command.replace(/\s+/g, " ").trim();
  const timeoutSuffix = typeof args.timeout === "number" ? labelColor("tool", ` (timeout ${args.timeout}s)`) : "";
  return truncateToWidth(labelColor("tool", "$ ") + labelColor("tool", commandLine) + timeoutSuffix, renderWidth, "...");
}

function getCallRenderWidth(tool: ToolExecutionLike, renderWidth: number): number {
  const shell = tool.getRenderShell?.() ?? "default";
  return shell === "default" ? Math.max(1, renderWidth - 2) : renderWidth;
}

function isBlankLine(line: string): boolean {
  return stripAnsi(line).trim() === "";
}

function countLeadingBlankLines(lines: string[]): number {
  let count = 0;
  while (count < lines.length && isBlankLine(lines[count] ?? "")) {
    count++;
  }
  return count;
}

function countHeaderEnd(lines: string[]): number | undefined {
  const leadingBlankCount = countLeadingBlankLines(lines);
  let headerLineCount = 0;
  while (
    leadingBlankCount + headerLineCount < lines.length &&
    !isBlankLine(lines[leadingBlankCount + headerLineCount] ?? "")
  ) {
    headerLineCount++;
  }
  return headerLineCount > 0 ? leadingBlankCount + headerLineCount : undefined;
}

function truncateHeaderLine(line: string, renderWidth: number, forceEllipsis: boolean): string {
  const ellipsis = "...";
  if (!forceEllipsis) return truncateToWidth(line, renderWidth, ellipsis);

  const ellipsisWidth = visibleWidth(ellipsis);
  if (renderWidth <= ellipsisWidth) return truncateToWidth(ellipsis, renderWidth, "");

  const clipped = truncateToWidth(line, renderWidth - ellipsisWidth, "");
  return insertBeforeTrailingAnsi(clipped, ellipsis);
}

function collapseRenderedHeaderLines(
  lines: string[],
  callRenderWidth: number,
  headerEnd: number,
): string | undefined {
  const leadingBlankCount = countLeadingBlankLines(lines);
  const headerLines = lines.slice(leadingBlankCount, headerEnd);
  let collapsed = "";
  let previousLineWidth = 0;

  for (const line of headerLines) {
    const text = line.trim();
    if (!stripAnsi(text).trim()) continue;

    if (collapsed) collapsed += previousLineWidth < callRenderWidth ? " " : "";
    collapsed += text;
    previousLineWidth = visibleWidth(text);
  }

  return collapsed || undefined;
}

function getRenderedCallHeaderLine(
  lines: string[],
  renderWidth: number,
  callRenderWidth: number,
  headerEnd: number,
): string | undefined {
  const leadingBlankCount = countLeadingBlankLines(lines);
  const headerLine = lines[leadingBlankCount];
  if (headerLine === undefined) return undefined;

  const headerLineCount = headerEnd - leadingBlankCount;
  if (headerLineCount <= 1) return truncateHeaderLine(headerLine, renderWidth, false);

  const collapsedHeader = collapseRenderedHeaderLines(lines, callRenderWidth, headerEnd);
  return collapsedHeader === undefined ? undefined : truncateHeaderLine(collapsedHeader, renderWidth, true);
}

function getCallHeaderInfo(tool: ToolExecutionLike, renderWidth: number): ToolHeaderInfo | undefined {
  const callRenderWidth = getCallRenderWidth(tool, renderWidth);
  const renderedCallLines = tool.callRendererComponent?.render(callRenderWidth) ?? [];
  const headerEnd = countHeaderEnd(renderedCallLines);
  const bashHeader = getBashHeader(tool, renderWidth);

  if (bashHeader) return { line: bashHeader, span: headerEnd ?? 1 };
  if (headerEnd === undefined) return undefined;

  const headerLine = getRenderedCallHeaderLine(renderedCallLines, renderWidth, callRenderWidth, headerEnd);
  return headerLine === undefined ? undefined : { line: headerLine, span: headerEnd };
}

function getCallSeparatorAfter(tool: ToolExecutionLike, headerLineSpan: number): number {
  const shell = tool.getRenderShell?.() ?? "default";
  return shell === "default" ? headerLineSpan + 1 : headerLineSpan;
}

function getFallbackSeparatorAfter(renderedLines: string[]): number | undefined {
  const bodyStart = renderedLines.findIndex((line) => visibleWidth(line) > 0);
  if (bodyStart === -1) return undefined;
  return countHeaderEnd(renderedLines.slice(bodyStart));
}

function getPendingLine(toolName: string | undefined): string {
  if (toolName === "read") return dimColor(" reading...");
  if (toolName === "write") return dimColor(" writing...");
  if (toolName === "edit") return dimColor(" editing...");
  if (toolName === "bash") return dimColor(" executing...");
  return dimColor(" running...");
}

function getToolFrameOptions(
  component: Component,
  renderWidth: number,
  renderedLines: string[],
  toolState: ToolState,
): FrameOptions {
  const tool = asToolExecution(component);
  const headerInfo = getCallHeaderInfo(tool, renderWidth);
  const separatorAfter = headerInfo
    ? getCallSeparatorAfter(tool, headerInfo.span)
    : getFallbackSeparatorAfter(renderedLines);
  const pendingLine = toolState === "pending" ? getPendingLine(tool.toolName) : undefined;
  const pendingLineMode = pendingLine ? (tool.result ? "prepend" : "replace") : undefined;

  return {
    ...(headerInfo ? { headerLine: headerInfo.line } : {}),
    ...(headerInfo ? { headerLineSpan: headerInfo.span } : {}),
    ...(separatorAfter === undefined ? {} : { separatorAfter }),
    ...(pendingLine ? { pendingLine, pendingLineMode } : {}),
  };
}

export function unpatchRender(prototype: Renderable): void {
  const original = prototype[ORIGINAL_RENDER];
  if (!prototype[PATCHED] || !original) return;

  prototype.render = original;
  delete prototype[PATCHED];
  delete prototype[ORIGINAL_RENDER];
}

export function patchRender(prototype: Renderable, kind: FrameKind): void {
  if (prototype[PATCHED]) {
    unpatchRender(prototype);
  }

  const original = prototype.render;
  prototype[PATCHED] = true;
  prototype[ORIGINAL_RENDER] = original;

  prototype.render = function patchedRender(this: Component, width: number): string[] {
    if (width < 4) return original.call(this, width);

    const innerWidth = Math.max(1, width - 2);
    const rendered = original.call(this, innerWidth);
    const toolState = kind === "tool" ? getToolState(this) : "pending";
    const options = kind === "tool" ? getToolFrameOptions(this, innerWidth, rendered, toolState) : {};
    return renderFrame(rendered, width, kind, toolState, options);
  };
}
