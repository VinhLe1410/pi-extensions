import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FrameKind, ToolState } from "../core/types";
import {
  insertBeforeTrailingAnsi,
  OSC133_ZONE_END,
  OSC133_ZONE_FINAL,
  OSC133_ZONE_START,
  stripAnsi,
  stripOscMarkers,
} from "./ansi";
import { pullToolHintFromLines } from "./hints";
import { frameColor, labelColor } from "./theme";

export interface FrameOptions {
  separatorAfter?: number;
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

function blankLineLike(line: string | undefined, width: number): string {
  const background = line?.match(/\x1b\[(?:48;5;\d+|48;2;\d+;\d+;\d+)m/)?.[0] ?? "";
  return `${background}${" ".repeat(width)}${background ? "\x1b[49m" : ""}`;
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

  const topTrim = kind === "tool" ? trimLeadingBlankLines(cleanBody) : { lines: cleanBody, removed: 0 };
  const pulledHint = kind === "tool" ? pullToolHintFromLines(topTrim.lines) : { lines: topTrim.lines };

  const innerWidth = width - 2;
  const trimmedBody = pulledHint.bottomRight ? trimTrailingBlankLines(pulledHint.lines) : pulledHint.lines;
  const displayBody = pulledHint.bottomRight
    ? [...trimmedBody, blankLineLike(trimmedBody.at(-1), innerWidth)]
    : trimmedBody;
  const bottomRight = pulledHint.bottomRight;

  const wrapped = displayBody.map(
    (line) => frameColor(kind, "│", toolState) + padLine(line, innerWidth) + frameColor(kind, "│", toolState),
  );
  const separated = insertSeparator(
    wrapped,
    options.separatorAfter === undefined ? undefined : Math.max(1, options.separatorAfter - topTrim.removed),
    separatorLine(kind, innerWidth, toolState),
  );

  return [
    ...leading,
    (sawStart ? OSC133_ZONE_START : "") + topBorder(kind, innerWidth, toolState),
    ...separated,
    (sawEnd ? OSC133_ZONE_END + OSC133_ZONE_FINAL : "") + bottomBorder(kind, innerWidth, toolState, bottomRight),
  ];
}
