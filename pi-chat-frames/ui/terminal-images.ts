import { stripAnsi } from "./ansi";

export interface TerminalImageSplit {
  textLines: string[];
  imageRows: string[];
}

export function isTerminalImageLine(line: string): boolean {
  return line.includes("\x1b_G") || line.includes("\x1b]1337;File=");
}

function isKittyTerminalImageLine(line: string): boolean {
  return line.includes("\x1b_G");
}

function isITermTerminalImageLine(line: string): boolean {
  return line.includes("\x1b]1337;File=");
}

function getITermImageLeadingPlaceholderRowCount(line: string): number {
  const match = /^\x1b\[(\d+)A/.exec(line);
  return match ? Number(match[1]) : 0;
}

function getKittyImageRowCount(line: string): number {
  const match = /\x1b_G([^;]*);/.exec(line);
  if (!match) return 0;

  for (const param of (match[1] ?? "").split(",")) {
    const rowMatch = /^r=(\d+)$/.exec(param);
    if (rowMatch) return Number(rowMatch[1]);
  }

  return 0;
}

function isBlankLine(line: string | undefined): boolean {
  return line !== undefined && stripAnsi(line).trim() === "";
}

export function splitTerminalImageRows(lines: string[]): TerminalImageSplit {
  const textLines: string[] = [];
  const imageRows: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (!isTerminalImageLine(line)) {
      textLines.push(line);
      continue;
    }

    const imageLeadingRows: string[] = [];
    const leadingPlaceholderRows = getITermImageLeadingPlaceholderRowCount(line);
    for (let placeholderIndex = 0; placeholderIndex < leadingPlaceholderRows; placeholderIndex++) {
      const previousLine = textLines.at(-1);
      if (!isBlankLine(previousLine)) break;
      imageLeadingRows.unshift(textLines.pop() ?? "");
    }

    if (textLines.at(-1) === "") {
      imageLeadingRows.unshift(textLines.pop() ?? "");
    }

    const imageTrailingRows: string[] = [];
    const trailingPlaceholderRows = Math.max(0, getKittyImageRowCount(line) - 1);
    for (let placeholderIndex = 0; placeholderIndex < trailingPlaceholderRows; placeholderIndex++) {
      const nextLine = lines[index + 1];
      if (!isBlankLine(nextLine)) break;
      imageTrailingRows.push(nextLine ?? "");
      index++;
    }

    imageRows.push(...imageLeadingRows, line, ...imageTrailingRows);
  }

  return { textLines, imageRows };
}

export function canRenderTerminalImageRowsInsideFrame(lines: string[]): boolean {
  return lines.some(isKittyTerminalImageLine) && !lines.some(isITermTerminalImageLine);
}

export function indentTerminalImageRows(lines: string[]): string[] {
  return lines.map((line) => (isTerminalImageLine(line) ? `\x1b[1C${line}` : line));
}
