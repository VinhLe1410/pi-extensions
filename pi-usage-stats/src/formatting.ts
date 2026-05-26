import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export function formatCost(cost: number): string {
  if (cost === 0) return "-";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(2)}`;
  if (cost < 10) return `$${cost.toFixed(2)}`;
  if (cost < 100) return `$${cost.toFixed(1)}`;
  return `$${Math.round(cost)}`;
}

export function formatTokens(count: number): string {
  if (count === 0) return "-";
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

export function formatNumber(n: number): string {
  if (n === 0) return "-";
  return n.toLocaleString();
}

export function padLeft(s: string, len: number): string {
  const vis = visibleWidth(s);
  if (vis >= len) return s;
  return " ".repeat(len - vis) + s;
}

export function padRight(s: string, len: number): string {
  const vis = visibleWidth(s);
  if (vis >= len) return s;
  return s + " ".repeat(len - vis);
}

export function fitCell(
  s: string,
  len: number,
  align: "left" | "right" = "left",
): string {
  if (len <= 0) return "";
  const truncated = truncateToWidth(s, len);
  return align === "right" ? padLeft(truncated, len) : padRight(truncated, len);
}

export function clampLines(lines: string[], width: number): string[] {
  return lines.map((line) => truncateToWidth(line, Math.max(width, 0)));
}

export function centerLine(s: string, width: number): string {
  const safeWidth = Math.max(width, 0);
  const truncated = truncateToWidth(s, safeWidth);
  const padding = Math.floor(
    Math.max(0, safeWidth - visibleWidth(truncated)) / 2,
  );
  return " ".repeat(padding) + truncated;
}

export function centerBlock(
  lines: string[],
  width: number,
  preferredWidth?: number,
): string[] {
  const safeWidth = Math.max(width, 0);
  const measuredWidth = lines.reduce(
    (max, line) => Math.max(max, visibleWidth(line)),
    0,
  );
  const blockWidth = Math.min(safeWidth, preferredWidth ?? measuredWidth);
  const padding = Math.floor(Math.max(0, safeWidth - blockWidth) / 2);

  return lines.map(
    (line) => " ".repeat(padding) + truncateToWidth(line, blockWidth),
  );
}

export function pickFittingText(width: number, variants: string[]): string {
  for (const variant of variants) {
    if (visibleWidth(variant) <= width) return variant;
  }
  return variants[variants.length - 1] || "";
}

