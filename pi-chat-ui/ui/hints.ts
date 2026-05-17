import { keyText } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { insertBeforeTrailingAnsi, stripAnsi } from "./ansi";

export interface ToolHintResult {
  lines: string[];
  bottomRight?: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function pullToolHintFromLines(lines: string[]): ToolHintResult {
  const expandKey = keyText("app.tools.expand");
  if (!expandKey) return { lines };

  const hintPattern = new RegExp(`${escapeRegExp(expandKey)} to (expand|collapse)`, "i");

  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index] ?? "";
    const plain = stripAnsi(line);
    const match = hintPattern.exec(plain);
    if (!match || match.index === undefined) continue;

    let trimAt = match.index;
    let suffix = "";
    const before = plain.slice(0, trimAt);
    const after = plain.slice(trimAt + match[0].length);

    if (before.endsWith(", ") && after.startsWith(")")) {
      trimAt -= 2;
      suffix = ")";
    } else if (before.endsWith(" (") && after.startsWith(")")) {
      trimAt -= 2;
    } else if (before.endsWith("(") && after.startsWith(")")) {
      trimAt -= 1;
    } else if (before.endsWith(" ") && after.trim() === "") {
      trimAt -= 1;
    }

    const nextLines = [...lines];
    nextLines[index] = insertBeforeTrailingAnsi(
      truncateToWidth(line, Math.max(0, trimAt), ""),
      suffix,
    );

    return {
      lines: nextLines,
      bottomRight: `${expandKey} to ${match[1]?.toLowerCase() ?? "expand"}`,
    };
  }

  return { lines };
}
