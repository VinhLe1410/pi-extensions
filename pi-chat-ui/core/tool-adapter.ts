import type { Component } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { ToolState } from "./types";
import type { FrameOptions } from "../ui/frame";
import { stripAnsi } from "../ui/ansi";
import { dimColor } from "../ui/theme";

interface ToolExecutionLike extends Component {
  toolName?: string;
  isPartial?: boolean;
  result?: { isError?: boolean };
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

function getPendingLine(toolName: string | undefined): string {
  if (toolName === "read") return dimColor(" reading...");
  if (toolName === "write") return dimColor(" writing...");
  if (toolName === "edit") return dimColor(" editing...");
  if (toolName === "bash") return dimColor(" executing...");
  return dimColor(" running...");
}

export function getToolFrameOptions(
  component: Component,
  renderedLines: string[],
  toolState: ToolState,
): FrameOptions {
  const tool = asToolExecution(component);
  const bodyStartAfter = getBodyStartAfter(renderedLines);
  const pendingLine = toolState === "pending" ? getPendingLine(tool.toolName) : undefined;
  const pendingLineMode = pendingLine ? (tool.result ? "prepend" : "replace") : undefined;

  return {
    ...(bodyStartAfter === undefined ? {} : { bodyStartAfter }),
    ...(pendingLine ? { pendingLine, pendingLineMode } : {}),
  };
}
