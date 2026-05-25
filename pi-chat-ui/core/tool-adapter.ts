import type { Component } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { ToolState } from "./types";
import type { ToolFrameOptions } from "../ui/frame-model";
import { stripAnsi } from "../ui/ansi";

interface ToolResultContentBlock {
  type?: string;
}

interface ToolExecutionLike extends Component {
  toolName?: string;
  isPartial?: boolean;
  expanded?: boolean;
  callRendererComponent?: Component;
  resultRendererComponent?: Component;
  result?: { isError?: boolean; content?: ToolResultContentBlock[] };
}

function asToolExecution(component: Component): ToolExecutionLike {
  return component as ToolExecutionLike;
}

export function getToolState(component: Component): ToolState {
  const tool = asToolExecution(component);
  if (tool.result?.isError) return "error";
  if (tool.result && !tool.isPartial) return "success";
  return "pending";
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

function getBodyStartAfter(renderedLines: string[]): number | undefined {
  const bodyStart = renderedLines.findIndex((line) => visibleWidth(line) > 0);
  if (bodyStart === -1) return undefined;
  return countHeaderEnd(renderedLines.slice(bodyStart));
}

function hasWritePreviewOutput(
  tool: ToolExecutionLike,
  renderedLines: string[],
  bodyStartAfter: number | undefined,
): boolean {
  if (tool.toolName !== "write" || !tool.callRendererComponent || bodyStartAfter === undefined) return false;
  return renderedLines.slice(bodyStartAfter).some((line) => stripAnsi(line).trim() !== "");
}

function shouldSplitToolOutput(
  tool: ToolExecutionLike,
  renderedLines: string[],
  bodyStartAfter: number | undefined,
): boolean {
  return Boolean(tool.callRendererComponent && tool.resultRendererComponent) || hasWritePreviewOutput(tool, renderedLines, bodyStartAfter);
}

function shouldCollapseToolOutput(tool: ToolExecutionLike, toolState: ToolState): boolean {
  return (tool.toolName === "read" || tool.toolName === "bash") && toolState !== "error" && !tool.expanded;
}

function hasReadImageOutput(tool: ToolExecutionLike, renderedLines: string[]): boolean {
  if (tool.toolName !== "read") return false;
  if (tool.result?.content?.some((block) => block.type === "image")) return true;
  return renderedLines.some((line) => line.includes("\x1b_G") || line.includes("\x1b]1337;File="));
}

export function getToolFrameOptions(
  component: Component,
  renderedLines: string[],
  toolState: ToolState,
): ToolFrameOptions {
  const tool = asToolExecution(component);
  const bodyStartAfter = getBodyStartAfter(renderedLines);
  const splitToolOutput = shouldSplitToolOutput(tool, renderedLines, bodyStartAfter);
  const collapseToolOutput = shouldCollapseToolOutput(tool, toolState);
  const hideToolOutput = hasReadImageOutput(tool, renderedLines);
  const fallbackCollapsedHint = collapseToolOutput && !hideToolOutput;
  const trimToolOutputTrailingBlanks = tool.toolName === "edit";
  const expanded = Boolean(tool.expanded);

  return {
    ...(bodyStartAfter === undefined ? {} : { bodyStartAfter }),
    ...(splitToolOutput ? { splitToolOutput } : {}),
    ...(collapseToolOutput ? { collapseToolOutput } : {}),
    ...(hideToolOutput ? { hideToolOutput } : {}),
    ...(fallbackCollapsedHint ? { fallbackCollapsedHint } : {}),
    ...(trimToolOutputTrailingBlanks ? { trimToolOutputTrailingBlanks } : {}),
    ...(expanded ? { expanded } : {}),
  };
}
