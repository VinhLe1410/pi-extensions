import { stripVTControlCharacters } from "node:util";
import type { ExtensionStatusPlacement, PromptUiConfig } from "../core/config";
import { getExtensionStatusPlacement } from "../core/config";

export type ExtensionStatusSegment = {
  key: string;
  text: string;
  placement: ExtensionStatusPlacement;
};

export type ExtensionStatusSegmentsByPlacement = {
  left: ExtensionStatusSegment[];
  middle: ExtensionStatusSegment[];
  right: ExtensionStatusSegment[];
};

function compareKeys(a: ExtensionStatusSegment, b: ExtensionStatusSegment): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

export function sanitizeExtensionStatusText(value: string): string {
  return stripVTControlCharacters(value)
    .replace(/[\r\n\t\f\v]+/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function collectExtensionStatusSegments(
  statuses: ReadonlyMap<string, string>,
  config: PromptUiConfig,
): ExtensionStatusSegmentsByPlacement {
  const segments: ExtensionStatusSegmentsByPlacement = {
    left: [],
    middle: [],
    right: [],
  };

  for (const [key, value] of statuses.entries()) {
    const placement = getExtensionStatusPlacement(config, key);
    if (placement === "off") continue;

    const text = sanitizeExtensionStatusText(value);
    if (!text) continue;

    segments[placement].push({ key, text, placement });
  }

  segments.left.sort(compareKeys);
  segments.middle.sort(compareKeys);
  segments.right.sort(compareKeys);
  return segments;
}
