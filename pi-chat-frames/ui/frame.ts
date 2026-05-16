import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FrameKind, ToolState } from "../core/types";
import type { FrameContent } from "./frame-model";
import {
  blankLineWithBackgroundLike,
  insertBeforeTrailingAnsi,
  lineWithBackgroundLike,
  OSC133_ZONE_END,
  OSC133_ZONE_FINAL,
  OSC133_ZONE_START,
  stripAnsi,
  stripBackgroundAnsi,
  stripOscMarkers,
} from "./ansi";
import { pullToolHintFromLines } from "./hints";
import { indentTerminalImageRows, splitTerminalImageRows } from "./terminal-images";
import { frameColor, labelColor } from "./theme";

export interface FrameOptions {
  separatorAfter?: number;
  headerLine?: string;
  headerLineSpan?: number;
  pendingLine?: string;
  pendingLineMode?: "replace" | "prepend";
}

function splitLeadingBlank(lines: string[]): {
  leading: string[];
  body: string[];
} {
  const leading: string[] = [];
  let index = 0;
  while (index < lines.length && visibleWidth(lines[index] ?? "") === 0) {
    leading.push(lines[index] ?? "");
    index++;
  }
  return { leading, body: lines.slice(index) };
}

function padLine(line: string, width: number): string {
  const clipped = truncateToWidth(line, width, "");
  const padding = " ".repeat(Math.max(0, width - visibleWidth(clipped)));
  return insertBeforeTrailingAnsi(clipped, padding);
}

function trimLeadingBlankLines(lines: string[]): { lines: string[]; removed: number } {
  let start = 0;
  while (start < lines.length && stripAnsi(lines[start] ?? "").trim() === "") {
    start++;
  }
  return { lines: lines.slice(start), removed: start };
}

function trimTrailingBlankLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && stripAnsi(lines[end - 1] ?? "").trim() === "") {
    end--;
  }
  return lines.slice(0, end);
}

function topBorder(kind: FrameKind, innerWidth: number, toolState: ToolState): string {
  const title = labelColor(kind);
  const titleWidth = visibleWidth(title);
  if (innerWidth <= titleWidth + 1) {
    return frameColor(kind, `╭${"─".repeat(innerWidth)}╮`, toolState);
  }

  const fill = Math.max(0, innerWidth - titleWidth - 1);
  return (
    frameColor(kind, "╭─", toolState) +
    title +
    frameColor(kind, `${"─".repeat(fill)}╮`, toolState)
  );
}

function separatorLine(kind: FrameKind, innerWidth: number, toolState: ToolState): string {
  return frameColor(kind, `├${"─".repeat(innerWidth)}┤`, toolState);
}

function bottomBorder(
  kind: FrameKind,
  innerWidth: number,
  toolState: ToolState,
  bottomRight?: string,
): string {
  if (!bottomRight) return frameColor(kind, `╰${"─".repeat(innerWidth)}╯`, toolState);

  const labelText = ` ${bottomRight} `;
  const rightWidth = visibleWidth(labelText) + 1;
  if (rightWidth >= innerWidth) {
    return (
      frameColor(kind, "╰", toolState) +
      labelColor(kind, truncateToWidth(labelText, innerWidth, "")) +
      frameColor(kind, "╯", toolState)
    );
  }

  const fill = Math.max(0, innerWidth - rightWidth);
  return (
    frameColor(kind, `╰${"─".repeat(fill)}`, toolState) +
    labelColor(kind, labelText) +
    frameColor(kind, "─╯", toolState)
  );
}

function stripCommandSectionBackground(lines: string[], commandLineCount: number | undefined): string[] {
  if (commandLineCount === undefined || commandLineCount <= 0) return lines;
  return lines.map((line, index) => (index < commandLineCount ? stripBackgroundAnsi(line) : line));
}

function insertSeparator(
  lines: string[],
  separatorAfter: number | undefined,
  separator: string,
): string[] {
  if (separatorAfter === undefined || separatorAfter <= 0 || separatorAfter >= lines.length) {
    return lines;
  }
  return [...lines.slice(0, separatorAfter), separator, ...lines.slice(separatorAfter)];
}

function adjustSeparatorAfter(
  separatorAfter: number | undefined,
  removedLeadingLines: number,
  headerLine: string | undefined,
  headerLineSpan: number,
): number | undefined {
  if (separatorAfter === undefined) return undefined;

  const afterTrim = Math.max(1, separatorAfter - removedLeadingLines);
  return headerLine ? Math.max(1, afterTrim - headerLineSpan + 1) : afterTrim;
}

function applyHeaderReplacement(lines: string[], options: FrameOptions): string[] {
  if (!options.headerLine || lines.length === 0) return lines;

  const headerLineSpan = Math.max(1, options.headerLineSpan ?? 1);
  return [options.headerLine, ...lines.slice(headerLineSpan)];
}

function applyPendingLine(content: FrameContent, innerWidth: number): FrameContent {
  const { pendingLine, pendingLineMode, separatorAfter } = content;
  if (!pendingLine || separatorAfter === undefined || separatorAfter <= 0) return content;

  const before = content.textBody.slice(0, separatorAfter);
  const after = content.textBody.slice(separatorAfter);
  const pending = lineWithBackgroundLike(after[0] ?? before.at(-1), innerWidth, pendingLine);
  const textBody = pendingLineMode === "replace"
    ? [...before, pending]
    : after.length > 0 && stripAnsi(after[0] ?? "").trim() === ""
      ? [...before, pending, ...after.slice(1)]
      : [...before, pending, ...after];

  return { ...content, textBody };
}

function normalizeFrameContent(lines: string[], kind: FrameKind, options: FrameOptions): FrameContent | undefined {
  const { leading, body } = splitLeadingBlank(lines);
  if (body.length === 0) return undefined;

  let oscStart = false;
  let oscEnd = false;
  const cleanBody = body.map((line) => {
    const stripped = stripOscMarkers(line);
    oscStart ||= stripped.start;
    oscEnd ||= stripped.end;
    return stripped.line;
  });

  const { textLines, imageRows } = kind === "tool"
    ? splitTerminalImageRows(cleanBody)
    : { textLines: cleanBody, imageRows: [] };
  const topTrim = kind === "tool" ? trimLeadingBlankLines(textLines) : { lines: textLines, removed: 0 };
  const headerLineSpan = Math.max(1, options.headerLineSpan ?? 1);
  const headerBody = applyHeaderReplacement(topTrim.lines, options);
  const shouldPullHint = kind === "tool" && options.pendingLineMode !== "replace";
  const pulledHint = shouldPullHint ? pullToolHintFromLines(headerBody) : { lines: headerBody };
  const textBody = pulledHint.bottomRight ? trimTrailingBlankLines(pulledHint.lines) : pulledHint.lines;

  return {
    leadingBlankLines: leading,
    textBody,
    terminalImageRows: imageRows,
    oscStart,
    oscEnd,
    separatorAfter: adjustSeparatorAfter(
      options.separatorAfter,
      topTrim.removed,
      options.headerLine,
      headerLineSpan,
    ),
    ...(options.pendingLine ? { pendingLine: options.pendingLine } : {}),
    ...(options.pendingLineMode ? { pendingLineMode: options.pendingLineMode } : {}),
    ...(pulledHint.bottomRight ? { bottomRightHint: pulledHint.bottomRight } : {}),
  };
}

function renderFrameContent(
  content: FrameContent,
  innerWidth: number,
  kind: FrameKind,
  toolState: ToolState,
): string[] {
  const framedImageRows = indentTerminalImageRows(content.terminalImageRows);
  if (content.textBody.length === 0) {
    return [
      ...content.leadingBlankLines,
      (content.oscStart ? OSC133_ZONE_START : "") + topBorder(kind, innerWidth, toolState),
      (content.oscEnd ? OSC133_ZONE_END + OSC133_ZONE_FINAL : "") + bottomBorder(kind, innerWidth, toolState),
      ...framedImageRows,
    ];
  }

  const pendingContent = applyPendingLine(content, innerWidth);
  const displayBody = pendingContent.bottomRightHint
    ? [...pendingContent.textBody, blankLineWithBackgroundLike(pendingContent.textBody.at(-1), innerWidth)]
    : pendingContent.textBody;
  const styledBody = kind === "tool"
    ? stripCommandSectionBackground(displayBody, pendingContent.separatorAfter ?? 1)
    : displayBody;
  const wrapped = styledBody.map(
    (line) => frameColor(kind, "│", toolState) + padLine(line, innerWidth) + frameColor(kind, "│", toolState),
  );
  const separated = insertSeparator(
    wrapped,
    pendingContent.separatorAfter,
    separatorLine(kind, innerWidth, toolState),
  );

  return [
    ...pendingContent.leadingBlankLines,
    (pendingContent.oscStart ? OSC133_ZONE_START : "") + topBorder(kind, innerWidth, toolState),
    ...separated,
    (pendingContent.oscEnd ? OSC133_ZONE_END + OSC133_ZONE_FINAL : "") + bottomBorder(kind, innerWidth, toolState, pendingContent.bottomRightHint),
    ...framedImageRows,
  ];
}

export function renderFrame(
  lines: string[],
  width: number,
  kind: FrameKind,
  toolState: ToolState = "pending",
  options: FrameOptions = {},
): string[] {
  if (width < 4 || lines.length === 0) return lines;

  const content = normalizeFrameContent(lines, kind, options);
  if (!content) return lines;

  return renderFrameContent(content, width - 2, kind, toolState);
}
