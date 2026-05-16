import { stripAnsi } from "./ansi";

export interface TerminalImageSplit {
  textLines: string[];
  imageRows: string[];
}

function isTerminalImageLine(line: string): boolean {
  return line.includes("\x1b_G") || line.includes("\x1b]1337;File=");
}

function getTerminalImagePlaceholderRowCount(line: string): number {
  const match = /^\x1b\[(\d+)A/.exec(line);
  return match ? Number(match[1]) : 0;
}

export function splitTerminalImageRows(lines: string[]): TerminalImageSplit {
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

export function indentTerminalImageRows(lines: string[]): string[] {
  return lines.map((line) => (isTerminalImageLine(line) ? `\x1b[1C${line}` : line));
}
