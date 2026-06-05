import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export function formatTokens(tokens: number): string {
  const abs = Math.abs(tokens);
  if (abs < 1_000) return String(tokens);
  if (abs < 1_000_000)
    return `${(tokens / 1_000).toFixed(abs < 10_000 ? 1 : 0)}k`;
  if (abs < 1_000_000_000)
    return `${(tokens / 1_000_000).toFixed(abs < 10_000_000 ? 1 : 0)}M`;
  return `${(tokens / 1_000_000_000).toFixed(1)}B`;
}

export function fit(line: string, width: number): string {
  return truncateToWidth(line, width, "");
}

export function centerLine(line: string, width: number): string {
  const lineWidth = visibleWidth(line);
  if (lineWidth >= width) return fit(line, width);
  return `${" ".repeat(Math.floor((width - lineWidth) / 2))}${line}`;
}
