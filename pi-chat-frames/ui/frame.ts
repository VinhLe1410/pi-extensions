import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FrameKind, ToolState } from "../core/types";
import {
  insertBeforeTrailingAnsi,
  OSC133_ZONE_END,
  OSC133_ZONE_FINAL,
  OSC133_ZONE_START,
  stripAnsi,
  stripBackgroundAnsi,
  stripOscMarkers,
} from "./ansi";
import { pullToolHintFromLines } from "./hints";
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

function isTerminalImageLine(line: string): boolean {
  return line.includes("\x1b_G") || line.includes("\x1b]1337;File=");
}

function getTerminalImagePlaceholderRowCount(line: string): number {
  const match = /^\x1b\[(\d+)A/.exec(line);
  return match ? Number(match[1]) : 0;
}

function splitTerminalImageRows(lines: string[]): { textLines: string[]; imageRows: string[] } {
  const textLines: string[] = [];
  const imageRows: string[] = [];

  for (const line of lines) {
    if (!isTerminalImageLine(line)) {
      textLines.push(line);
      continue;
    }

    const imageLeadingRows: string[] = [];
    const placeholderRows = getTerminalImagePlaceholderRowCount(line);
    for (let index = 0; index < placeholderRows; index++) {
      const previousLine = textLines.at(-1);
      if (previousLine === undefined || stripAnsi(previousLine).trim() !== "") break;
      imageLeadingRows.unshift(textLines.pop() ?? "");
    }

    if (textLines.at(-1) === "") {
      imageLeadingRows.unshift(textLines.pop() ?? "");
    }

    imageRows.push(...imageLeadingRows, line);
  }

  return { textLines, imageRows };
}

function indentTerminalImageRows(lines: string[]): string[] {
  return lines.map((line) => (isTerminalImageLine(line) ? `\x1b[1C${line}` : line));
}

function backgroundFrom(line: string | undefined): string {
  return line?.match(/\x1b\[(?:48;5;\d+|48;2;\d+;\d+;\d+)m/)?.[0] ?? "";
}

function blankLineLike(line: string | undefined, width: number): string {
  const background = backgroundFrom(line);
  return `${background}${" ".repeat(width)}${background ? "\x1b[49m" : ""}`;
}

function lineLike(line: string | undefined, width: number, text: string): string {
  const background = backgroundFrom(line);
  const content = truncateToWidth(text, width, "");
  const padding = " ".repeat(Math.max(0, width - visibleWidth(content)));
  return `${background}${content}${padding}${background ? "\x1b[49m" : ""}`;
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

function applyPendingLine(
  lines: string[],
  separatorAfter: number | undefined,
  innerWidth: number,
  pendingLine: string | undefined,
  mode: FrameOptions["pendingLineMode"],
): string[] {
  if (!pendingLine || separatorAfter === undefined || separatorAfter <= 0) return lines;

  const before = lines.slice(0, separatorAfter);
  const after = lines.slice(separatorAfter);
  const pending = lineLike(after[0] ?? before.at(-1), innerWidth, pendingLine);
  if (mode === "replace") return [...before, pending];

  if (after.length > 0 && stripAnsi(after[0] ?? "").trim() === "") {
    return [...before, pending, ...after.slice(1)];
  }
  return [...before, pending, ...after];
}

export function renderFrame(
  lines: string[],
  width: number,
  kind: FrameKind,
  toolState: ToolState = "pending",
  options: FrameOptions = {},
): string[] {
  if (width < 4 || lines.length === 0) return lines;

  const { leading, body } = splitLeadingBlank(lines);
  if (body.length === 0) return lines;

  let sawStart = false;
  let sawEnd = false;
  const cleanBody = body.map((line) => {
    const stripped = stripOscMarkers(line);
    sawStart ||= stripped.start;
    sawEnd ||= stripped.end;
    return stripped.line;
  });

  const innerWidth = width - 2;
  const { textLines, imageRows } = kind === "tool"
    ? splitTerminalImageRows(cleanBody)
    : { textLines: cleanBody, imageRows: [] };
  const framedImageRows = indentTerminalImageRows(imageRows);
  const topTrim = kind === "tool" ? trimLeadingBlankLines(textLines) : { lines: textLines, removed: 0 };
  if (topTrim.lines.length === 0) {
    return [
      ...leading,
      (sawStart ? OSC133_ZONE_START : "") + topBorder(kind, innerWidth, toolState),
      (sawEnd ? OSC133_ZONE_END + OSC133_ZONE_FINAL : "") + bottomBorder(kind, innerWidth, toolState),
      ...framedImageRows,
    ];
  }

  const headerLineSpan = Math.max(1, options.headerLineSpan ?? 1);
  const headerBody = options.headerLine && topTrim.lines.length > 0
    ? [options.headerLine, ...topTrim.lines.slice(headerLineSpan)]
    : topTrim.lines;
  const shouldPullHint = kind === "tool" && options.pendingLineMode !== "replace";
  const pulledHint = shouldPullHint ? pullToolHintFromLines(headerBody) : { lines: headerBody };

  const trimmedBody = pulledHint.bottomRight ? trimTrailingBlankLines(pulledHint.lines) : pulledHint.lines;
  const bottomRight = pulledHint.bottomRight;
  const originalSeparatorAfter = options.separatorAfter === undefined ? undefined : Math.max(1, options.separatorAfter - topTrim.removed);
  const separatorAfter =
    options.headerLine && originalSeparatorAfter !== undefined
      ? Math.max(1, originalSeparatorAfter - headerLineSpan + 1)
      : originalSeparatorAfter;
  const pendingBody = applyPendingLine(
    trimmedBody,
    separatorAfter,
    innerWidth,
    options.pendingLine,
    options.pendingLineMode,
  );
  const displayBody = pulledHint.bottomRight
    ? [...pendingBody, blankLineLike(pendingBody.at(-1), innerWidth)]
    : pendingBody;
  const styledBody = kind === "tool" ? stripCommandSectionBackground(displayBody, separatorAfter ?? 1) : displayBody;

  const wrapped = styledBody.map(
    (line) => frameColor(kind, "│", toolState) + padLine(line, innerWidth) + frameColor(kind, "│", toolState),
  );
  const separated = insertSeparator(
    wrapped,
    separatorAfter,
    separatorLine(kind, innerWidth, toolState),
  );

  return [
    ...leading,
    (sawStart ? OSC133_ZONE_START : "") + topBorder(kind, innerWidth, toolState),
    ...separated,
    (sawEnd ? OSC133_ZONE_END + OSC133_ZONE_FINAL : "") + bottomBorder(kind, innerWidth, toolState, bottomRight),
    ...framedImageRows,
  ];
}
