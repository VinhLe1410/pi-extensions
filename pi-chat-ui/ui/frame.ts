import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FrameKind, ToolState } from "../core/types";
import type { FrameContent } from "./frame-model";
import {
  insertBeforeTrailingAnsi,
  OSC133_ZONE_END,
  OSC133_ZONE_FINAL,
  OSC133_ZONE_START,
  stripAnsi,
  stripOscMarkers,
} from "./ansi";
import { pullToolHintFromLines } from "./hints";
import {
  canRenderTerminalImageRowsInsideFrame,
  indentTerminalImageRows,
  isTerminalImageLine,
  splitTerminalImageRows,
} from "./terminal-images";
import { dimColor, frameColor, labelColor } from "./theme";

export interface FrameOptions {
  bodyStartAfter?: number;
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

function isBashBuiltInBorderLine(line: string): boolean {
  const text = stripAnsi(line).trim();
  return text.length > 0 && /^─+$/.test(text);
}

function stripBashBuiltInBorders(lines: string[]): string[] {
  const { leading, body } = splitLeadingBlank(lines);
  if (body.length < 2) return lines;

  const first = body[0];
  const last = body.at(-1);
  if (!first || !last) return lines;
  if (!isBashBuiltInBorderLine(first) || !isBashBuiltInBorderLine(last)) return lines;

  return [...leading, ...body.slice(1, -1)];
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

function adjustBodyStartAfter(
  bodyStartAfter: number | undefined,
  removedLeadingLines: number,
): number | undefined {
  if (bodyStartAfter === undefined) return undefined;
  return Math.max(1, bodyStartAfter - removedLeadingLines);
}

function applyPendingLine(content: FrameContent, innerWidth: number): FrameContent {
  const { pendingLine, pendingLineMode, bodyStartAfter } = content;
  if (!pendingLine || bodyStartAfter === undefined || bodyStartAfter <= 0) return content;

  const before = content.textBody.slice(0, bodyStartAfter);
  const after = content.textBody.slice(bodyStartAfter);
  const pending = padLine(pendingLine, innerWidth);
  const textBody = pendingLineMode === "replace"
    ? [...before, pending]
    : after.length > 0 && stripAnsi(after[0] ?? "").trim() === ""
      ? [...before, pending, ...after.slice(1)]
      : [...before, pending, ...after];

  return { ...content, textBody };
}

function applyCollapsedContentPlaceholder(
  content: FrameContent,
  innerWidth: number,
): FrameContent {
  const { bottomRightHint, bodyStartAfter } = content;
  if (!bottomRightHint || bodyStartAfter === undefined || bodyStartAfter <= 0) return content;

  const before = content.textBody.slice(0, bodyStartAfter);
  const after = content.textBody.slice(bodyStartAfter);
  if (after.some((line) => stripAnsi(line).trim() !== "")) return content;

  const paddingLine = " ".repeat(innerWidth);
  const placeholderText = dimColor(" content is collapsed by default...");
  const placeholder = padLine(placeholderText, innerWidth);

  return {
    ...content,
    textBody: [...before, paddingLine, placeholder],
  };
}

function normalizeFrameContent(lines: string[], kind: FrameKind, options: FrameOptions): FrameContent | undefined {
  const normalizedLines = kind === "bash" ? stripBashBuiltInBorders(lines) : lines;
  const { leading, body } = splitLeadingBlank(normalizedLines);
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
  const shouldPullHint = kind === "tool" && options.pendingLineMode !== "replace";
  const pulledHint = shouldPullHint ? pullToolHintFromLines(topTrim.lines) : { lines: topTrim.lines };
  const textBody = pulledHint.bottomRight ? trimTrailingBlankLines(pulledHint.lines) : pulledHint.lines;

  return {
    leadingBlankLines: leading,
    textBody,
    terminalImageRows: imageRows,
    oscStart,
    oscEnd,
    bodyStartAfter: adjustBodyStartAfter(options.bodyStartAfter, topTrim.removed),
    ...(options.pendingLine ? { pendingLine: options.pendingLine } : {}),
    ...(options.pendingLineMode ? { pendingLineMode: options.pendingLineMode } : {}),
    ...(pulledHint.bottomRight ? { bottomRightHint: pulledHint.bottomRight } : {}),
  };
}

function renderInsideFrameImageRows(
  imageRows: string[],
  innerWidth: number,
  kind: FrameKind,
  toolState: ToolState,
): string[] {
  return imageRows.map((line) => {
    if (isTerminalImageLine(line)) {
      return (
        frameColor(kind, "│", toolState) +
        line +
        `\x1b[${innerWidth + 2}G` +
        frameColor(kind, "│", toolState)
      );
    }

    return frameColor(kind, "│", toolState) + padLine(line, innerWidth) + frameColor(kind, "│", toolState);
  });
}

function renderFrameContent(
  content: FrameContent,
  innerWidth: number,
  kind: FrameKind,
  toolState: ToolState,
): string[] {
  const shouldRenderImagesInsideFrame = canRenderTerminalImageRowsInsideFrame(content.terminalImageRows);
  const insideFrameImageRows = shouldRenderImagesInsideFrame
    ? renderInsideFrameImageRows(content.terminalImageRows, innerWidth, kind, toolState)
    : [];
  const outsideFrameImageRows = shouldRenderImagesInsideFrame ? [] : indentTerminalImageRows(content.terminalImageRows);

  if (content.textBody.length === 0) {
    return [
      ...content.leadingBlankLines,
      (content.oscStart ? OSC133_ZONE_START : "") + topBorder(kind, innerWidth, toolState),
      ...insideFrameImageRows,
      (content.oscEnd ? OSC133_ZONE_END + OSC133_ZONE_FINAL : "") + bottomBorder(kind, innerWidth, toolState),
      ...outsideFrameImageRows,
    ];
  }

  const pendingContent = applyPendingLine(content, innerWidth);
  const placeholderContent = applyCollapsedContentPlaceholder(pendingContent, innerWidth);
  const wrapped = placeholderContent.textBody.map(
    (line) => frameColor(kind, "│", toolState) + padLine(line, innerWidth) + frameColor(kind, "│", toolState),
  );

  return [
    ...placeholderContent.leadingBlankLines,
    (placeholderContent.oscStart ? OSC133_ZONE_START : "") + topBorder(kind, innerWidth, toolState),
    ...wrapped,
    ...insideFrameImageRows,
    (placeholderContent.oscEnd ? OSC133_ZONE_END + OSC133_ZONE_FINAL : "") + bottomBorder(kind, innerWidth, toolState, placeholderContent.bottomRightHint),
    ...outsideFrameImageRows,
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
