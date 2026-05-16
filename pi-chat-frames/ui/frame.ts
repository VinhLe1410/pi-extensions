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

export function renderFrame(
  lines: string[],
  width: number,
  kind: FrameKind,
  toolState: ToolState = "pending",
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

  const pulledHint = kind === "tool" ? pullToolHintFromLines(cleanBody) : { lines: cleanBody };
  const displayBody = pulledHint.bottomRight ? trimTrailingBlankLines(pulledHint.lines) : pulledHint.lines;
  const bottomRight = pulledHint.bottomRight;

  const innerWidth = width - 2;
  const wrapped = displayBody.map(
    (line) => frameColor(kind, "│", toolState) + padLine(line, innerWidth) + frameColor(kind, "│", toolState),
  );

  return [
    ...leading,
    (sawStart ? OSC133_ZONE_START : "") + topBorder(kind, innerWidth, toolState),
    ...wrapped,
    (sawEnd ? OSC133_ZONE_END + OSC133_ZONE_FINAL : "") + bottomBorder(kind, innerWidth, toolState, bottomRight),
  ];
}
