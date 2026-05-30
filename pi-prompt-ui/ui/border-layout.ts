import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export interface BorderItem {
  id: string;
  text: string;
  priority: number;
}

export interface BorderLine {
  left: BorderItem[];
  right: BorderItem[];
}

export interface BorderLabels {
  top: BorderLine;
  bottom: BorderLine;
}

interface IndexedBorderItem extends BorderItem {
  side: "left" | "right";
  index: number;
}

interface RenderBorderLineOptions {
  lineWidth: number;
  line: BorderLine;
  separator: string;
  borderColor: (text: string) => string;
}

function border(borderColor: (text: string) => string, width: number): string {
  return borderColor("─".repeat(Math.max(0, width)));
}

function indexedItems(line: BorderLine): IndexedBorderItem[] {
  return [...line.left, ...line.right].map((item, index) => ({
    ...item,
    side: index < line.left.length ? "left" : "right",
    index,
  }));
}

function renderGroup(items: BorderItem[], separator: string): string {
  return items.map((item) => item.text).join(separator);
}

function splitItems(items: IndexedBorderItem[]): BorderLine {
  return {
    left: items.filter((item) => item.side === "left"),
    right: items.filter((item) => item.side === "right"),
  };
}

function tryRenderLine(
  lineWidth: number,
  items: IndexedBorderItem[],
  separator: string,
  borderColor: (text: string) => string,
): string | null {
  const line = splitItems(items);
  const leftGroup = renderGroup(line.left, separator);
  const rightGroup = renderGroup(line.right, separator);
  const leftText = leftGroup ? ` ${leftGroup} ` : "";
  const rightText = rightGroup ? ` ${rightGroup} ` : "";
  const leftPrefix = leftText ? "──" : "";
  const rightSuffix = rightText ? "──" : "";
  const reserved =
    visibleWidth(leftPrefix) +
    visibleWidth(leftText) +
    visibleWidth(rightText) +
    visibleWidth(rightSuffix);
  const minimumGap = leftText && rightText ? 1 : 0;

  if (reserved + minimumGap > lineWidth) return null;

  const gap = lineWidth - reserved;
  return (
    borderColor(leftPrefix) +
    leftText +
    borderColor("─".repeat(gap)) +
    rightText +
    borderColor(rightSuffix)
  );
}

function removeLowestPriority(items: IndexedBorderItem[]): IndexedBorderItem[] {
  if (items.length <= 1) return items;

  let removeIndex = 0;
  for (let index = 1; index < items.length; index++) {
    const item = items[index];
    const current = items[removeIndex];
    if (
      item.priority < current.priority ||
      (item.priority === current.priority && item.index > current.index)
    ) {
      removeIndex = index;
    }
  }

  return items.filter((_, index) => index !== removeIndex);
}

function renderTruncatedItem(
  lineWidth: number,
  item: IndexedBorderItem,
  borderColor: (text: string) => string,
): string {
  if (lineWidth <= 2) return border(borderColor, lineWidth);

  const labelWidth = lineWidth - 2;
  const label = truncateToWidth(` ${item.text} `, labelWidth, "", true);
  return item.side === "right"
    ? label + border(borderColor, 2)
    : border(borderColor, 2) + label;
}

export function renderBorderLine({
  lineWidth,
  line,
  separator,
  borderColor,
}: RenderBorderLineOptions): string {
  if (lineWidth < 1) return "";

  let remaining = indexedItems(line);
  if (remaining.length === 0) return border(borderColor, lineWidth);

  while (remaining.length > 1) {
    const rendered = tryRenderLine(lineWidth, remaining, separator, borderColor);
    if (rendered) return rendered;
    remaining = removeLowestPriority(remaining);
  }

  const rendered = tryRenderLine(lineWidth, remaining, separator, borderColor);
  return rendered ?? renderTruncatedItem(lineWidth, remaining[0], borderColor);
}
