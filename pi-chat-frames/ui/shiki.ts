import type { Highlighter } from "shiki";
import { createHighlighter } from "shiki";

let highlighter: Highlighter | undefined;
let highlighterPromise: Promise<Highlighter> | undefined;
const cache = new Map<string, string>();

function hexToRgb(hex: string): { r: number; g: number; b: number } | undefined {
  const value = hex.replace(/^#/, "");
  if (value.length !== 6 && value.length !== 8) return undefined;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return undefined;
  return { r, g, b };
}

function fg(hex: string | undefined, text: string): string {
  if (!hex) return text;
  const rgb = hexToRgb(hex);
  if (!rgb) return text;
  return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m${text}\x1b[39m`;
}

export function warmBashHighlighter(): void {
  if (highlighter || highlighterPromise) return;

  highlighterPromise = createHighlighter({
    themes: ["dark-plus"],
    langs: ["bash"],
  }).then((created) => {
    highlighter = created;
    return created;
  });
}

export function highlightBash(command: string): string | undefined {
  const cached = cache.get(command);
  if (cached !== undefined) return cached;

  warmBashHighlighter();
  if (!highlighter) return undefined;

  const result = highlighter.codeToTokens(command, {
    lang: "bash",
    theme: "dark-plus",
  });

  const highlighted = result.tokens
    .map((line) => line.map((token) => fg(token.color, token.content)).join(""))
    .join("\n");

  cache.set(command, highlighted);
  return highlighted;
}
