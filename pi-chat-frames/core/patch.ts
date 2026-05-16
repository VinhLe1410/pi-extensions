import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FrameKind, Renderable, ToolState } from "./types";
import { ORIGINAL_RENDER, PATCHED } from "./symbols";
import { renderFrame, type FrameOptions } from "../ui/frame";
import { dimColor, labelColor } from "../ui/theme";
import { stripAnsi } from "../ui/ansi";

interface ToolExecutionLike extends Component {
  toolName?: string;
  args?: unknown;
  isPartial?: boolean;
  result?: { isError?: boolean };
  callRendererComponent?: Component;
  resultRendererComponent?: Component;
  getRenderShell?: () => "default" | "self";
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

function getCallRenderedLines(tool: ToolExecutionLike, renderWidth: number): string[] {
  if (!tool.callRendererComponent) return [];
  return tool.callRendererComponent.render(getCallRenderWidth(tool, renderWidth));
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

function getCallHeaderLineCount(tool: ToolExecutionLike, renderWidth: number): number | undefined {
  return countHeaderEnd(getCallRenderedLines(tool, renderWidth));
}

function getCallSeparatorAfter(tool: ToolExecutionLike, renderWidth: number): number | undefined {
  const headerLineCount = getCallHeaderLineCount(tool, renderWidth);
  if (headerLineCount === undefined) return undefined;

  const shell = tool.getRenderShell?.() ?? "default";
  return shell === "default" ? headerLineCount + 1 : headerLineCount;
}

function getFallbackSeparatorAfter(renderedLines: string[]): number | undefined {
  const bodyStart = renderedLines.findIndex((line) => visibleWidth(line) > 0);
  if (bodyStart === -1) return undefined;
  return countHeaderEnd(renderedLines.slice(bodyStart));
}

function getSeparatorAfter(
  tool: ToolExecutionLike,
  renderWidth: number,
  renderedLines: string[],
): number | undefined {
  return getCallSeparatorAfter(tool, renderWidth) ?? getFallbackSeparatorAfter(renderedLines);
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
  const headerLine = getBashHeader(tool, renderWidth);
  const headerLineSpan = headerLine ? getCallHeaderLineCount(tool, renderWidth) : undefined;
  const separatorAfter = getSeparatorAfter(tool, renderWidth, renderedLines);
  const pendingLine = toolState === "pending" ? getPendingLine(tool.toolName) : undefined;
  const pendingLineMode = pendingLine ? (tool.result ? "prepend" : "replace") : undefined;

  return {
    ...(headerLine ? { headerLine } : {}),
    ...(headerLineSpan === undefined ? {} : { headerLineSpan }),
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
