import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FrameKind, ToolState } from "../core/types";
import type { FrameContent, ToolFrameOptions } from "./frame-model";
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
import { frameColor, labelColor } from "./theme";

export type FrameOptions = ToolFrameOptions;

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

function normalizeFrameContent(
  lines: string[],
  kind: FrameKind,
  toolState: ToolState,
  options: FrameOptions,
): FrameContent | undefined {
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
  const shouldPullHint = kind === "tool";
  const pulledHint = shouldPullHint ? pullToolHintFromLines(topTrim.lines) : { lines: topTrim.lines };
  const hintedTextBody = pulledHint.bottomRight ? trimTrailingBlankLines(pulledHint.lines) : pulledHint.lines;
  const textBody = kind === "tool" && toolState === "pending" ? trimTrailingBlankLines(hintedTextBody) : hintedTextBody;

  return {
    leadingBlankLines: leading,
    textBody,
    terminalImageRows: imageRows,
    oscStart,
    oscEnd,
    bodyStartAfter: adjustBodyStartAfter(options.bodyStartAfter, topTrim.removed),
    ...(options.splitToolOutput ? { splitToolOutput: options.splitToolOutput } : {}),
    ...(options.collapseToolOutput ? { collapseToolOutput: options.collapseToolOutput } : {}),
    ...(options.hideToolOutput ? { hideToolOutput: options.hideToolOutput } : {}),
    ...(options.trimToolOutputTrailingBlanks ? { trimToolOutputTrailingBlanks: options.trimToolOutputTrailingBlanks } : {}),
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

function hasVisibleText(lines: string[]): boolean {
  return lines.some((line) => stripAnsi(line).trim() !== "");
}

function trimBoundaryBlank(lines: string[]): string[] {
  if (stripAnsi(lines[0] ?? "").trim() !== "") return lines;
  return lines.slice(1);
}

function splitToolTextBody(content: FrameContent): { callRows: string[]; resultRows: string[] } {
  if (!content.splitToolOutput || content.bodyStartAfter === undefined || content.bodyStartAfter <= 0) {
    return { callRows: content.textBody, resultRows: [] };
  }

  const resultRows = trimBoundaryBlank(content.textBody.slice(content.bodyStartAfter));
  return {
    callRows: content.textBody.slice(0, content.bodyStartAfter),
    resultRows: content.trimToolOutputTrailingBlanks ? trimTrailingBlankLines(resultRows) : resultRows,
  };
}

function renderBodyRows(lines: string[], innerWidth: number, kind: FrameKind, toolState: ToolState): string[] {
  return lines.map(
    (line) => frameColor(kind, "│", toolState) + padLine(line, innerWidth) + frameColor(kind, "│", toolState),
  );
}

function outputSeparator(innerWidth: number, kind: FrameKind, toolState: ToolState): string {
  const titleText = " output ";
  const title = labelColor(kind, titleText);
  const titleWidth = visibleWidth(titleText);
  if (innerWidth <= titleWidth + 1) {
    return frameColor(kind, "├", toolState) + labelColor(kind, truncateToWidth(`─${titleText}`, innerWidth, "")) + frameColor(kind, "┤", toolState);
  }

  const fill = Math.max(0, innerWidth - titleWidth - 1);
  return (
    frameColor(kind, "├─", toolState) +
    title +
    frameColor(kind, `${"─".repeat(fill)}┤`, toolState)
  );
}

function renderFrameContent(
  content: FrameContent,
  innerWidth: number,
  kind: FrameKind,
  toolState: ToolState,
): string[] {
  const outputHidden = content.hideToolOutput || content.collapseToolOutput;
  const imageRows = outputHidden ? [] : content.terminalImageRows;
  const shouldRenderImagesInsideFrame = canRenderTerminalImageRowsInsideFrame(imageRows);
  const insideFrameImageRows = shouldRenderImagesInsideFrame
    ? renderInsideFrameImageRows(imageRows, innerWidth, kind, toolState)
    : [];
  const outsideFrameImageRows = shouldRenderImagesInsideFrame ? [] : indentTerminalImageRows(imageRows);
  const { callRows, resultRows } = kind === "tool" ? splitToolTextBody(content) : { callRows: content.textBody, resultRows: [] };
  const visibleResultRows = outputHidden ? [] : resultRows;
  const hasVisibleOutput = hasVisibleText(visibleResultRows) || imageRows.length > 0;
  const renderedTextRows = kind === "tool" && content.splitToolOutput
    ? [
      ...renderBodyRows(callRows, innerWidth, kind, toolState),
      ...(hasVisibleOutput ? [outputSeparator(innerWidth, kind, toolState)] : []),
      ...renderBodyRows(visibleResultRows, innerWidth, kind, toolState),
    ]
    : renderBodyRows(content.textBody, innerWidth, kind, toolState);

  if (renderedTextRows.length === 0) {
    return [
      ...content.leadingBlankLines,
      (content.oscStart ? OSC133_ZONE_START : "") + topBorder(kind, innerWidth, toolState),
      ...insideFrameImageRows,
      (content.oscEnd ? OSC133_ZONE_END + OSC133_ZONE_FINAL : "") + bottomBorder(kind, innerWidth, toolState),
      ...outsideFrameImageRows,
    ];
  }

  return [
    ...content.leadingBlankLines,
    (content.oscStart ? OSC133_ZONE_START : "") + topBorder(kind, innerWidth, toolState),
    ...renderedTextRows,
    ...insideFrameImageRows,
    (content.oscEnd ? OSC133_ZONE_END + OSC133_ZONE_FINAL : "") + bottomBorder(kind, innerWidth, toolState, content.bottomRightHint),
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

  const content = normalizeFrameContent(lines, kind, toolState, options);
  if (!content) return lines;

  return renderFrameContent(content, width - 2, kind, toolState);
}
