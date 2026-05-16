import type { Component } from "@earendil-works/pi-tui";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import {
  keyText,
  ToolExecutionComponent,
  UserMessageComponent,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";
const PATCHED = Symbol.for("pi-boxed-messages.patched");
const ORIGINAL_RENDER = Symbol.for("pi-boxed-messages.originalRender");
const GLOBAL_STATE = Symbol.for("pi-boxed-messages.state");
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

type Renderable = Component & {
  [PATCHED]?: boolean;
  [ORIGINAL_RENDER]?: (width: number) => string[];
};

type BoxKind = "user" | "tool";
type ToolState = "pending" | "success" | "error";

interface BoxedMessagesState {
  activeTheme?: Theme;
}

const state = ((
  globalThis as typeof globalThis & { [GLOBAL_STATE]?: BoxedMessagesState }
)[GLOBAL_STATE] ??= {});

function stripOscMarkers(line: string): {
  line: string;
  start: boolean;
  end: boolean;
} {
  let next = line;
  const start = next.includes(OSC133_ZONE_START);
  const end =
    next.includes(OSC133_ZONE_END) || next.includes(OSC133_ZONE_FINAL);
  next = next
    .replaceAll(OSC133_ZONE_START, "")
    .replaceAll(OSC133_ZONE_END, "")
    .replaceAll(OSC133_ZONE_FINAL, "");
  return { line: next, start, end };
}

function toolBorderToken(toolState: ToolState): "borderMuted" | "success" | "error" {
  if (toolState === "success") return "success";
  if (toolState === "error") return "error";
  return "borderMuted";
}

function color(kind: BoxKind, text: string, toolState: ToolState = "pending"): string {
  if (!state.activeTheme) {
    const ansi = kind === "tool" && toolState === "success" ? "32" : kind === "tool" && toolState === "error" ? "31" : "90";
    return `\x1b[${ansi}m${text}\x1b[39m`;
  }
  return state.activeTheme.fg(kind === "user" ? "accent" : toolBorderToken(toolState), text);
}

function label(kind: BoxKind, text = kind === "user" ? " user " : " tool "): string {
  if (!state.activeTheme) return text;
  return state.activeTheme.fg(kind === "user" ? "accent" : "toolTitle", text);
}

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

function insertBeforeTrailingAnsi(line: string, text: string): string {
  if (!text) return line;
  const match = /(?:\x1b\[[0-9;]*m)+$/.exec(line);
  if (!match || match.index === undefined) return line + text;
  return line.slice(0, match.index) + text + line.slice(match.index);
}

function padLine(line: string, width: number): string {
  const clipped = truncateToWidth(line, width, "");
  const padding = " ".repeat(Math.max(0, width - visibleWidth(clipped)));
  return insertBeforeTrailingAnsi(clipped, padding);
}

function topBorder(kind: BoxKind, innerWidth: number, toolState: ToolState): string {
  const title = label(kind);
  const titleWidth = visibleWidth(title);
  if (innerWidth <= titleWidth + 1) {
    return color(kind, `╭${"─".repeat(innerWidth)}╮`, toolState);
  }

  const fill = Math.max(0, innerWidth - titleWidth - 1);
  return color(kind, "╭─", toolState) + title + color(kind, `${"─".repeat(fill)}╮`, toolState);
}

function bottomBorder(
  kind: BoxKind,
  innerWidth: number,
  toolState: ToolState,
  bottomRight?: string,
): string {
  if (!bottomRight) return color(kind, `╰${"─".repeat(innerWidth)}╯`, toolState);

  const labelText = ` ${bottomRight} `;
  const rightWidth = visibleWidth(labelText) + 1;
  if (rightWidth >= innerWidth) {
    return (
      color(kind, "╰", toolState) +
      label(kind, truncateToWidth(labelText, innerWidth, "")) +
      color(kind, "╯", toolState)
    );
  }

  const fill = Math.max(0, innerWidth - rightWidth);
  return (
    color(kind, `╰${"─".repeat(fill)}`, toolState) +
    label(kind, labelText) +
    color(kind, "─╯", toolState)
  );
}

function stripAnsi(line: string): string {
  return line.replace(ANSI_PATTERN, "");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trimTrailingBlankLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && stripAnsi(lines[end - 1] ?? "").trim() === "") {
    end--;
  }
  return lines.slice(0, end);
}

function pullToolHintFromLines(lines: string[]): {
  lines: string[];
  bottomRight?: string;
} {
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

function wrapInBox(
  lines: string[],
  width: number,
  kind: BoxKind,
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

  const pulledHint =
    kind === "tool" ? pullToolHintFromLines(cleanBody) : { lines: cleanBody };
  const displayBody = pulledHint.bottomRight
    ? trimTrailingBlankLines(pulledHint.lines)
    : pulledHint.lines;
  const bottomRight = pulledHint.bottomRight;

  const innerWidth = width - 2;
  const borderTop = topBorder(kind, innerWidth, toolState);
  const borderBottom = bottomBorder(kind, innerWidth, toolState, bottomRight);
  const wrapped = displayBody.map(
    (line) => color(kind, "│", toolState) + padLine(line, innerWidth) + color(kind, "│", toolState),
  );

  return [
    ...leading,
    (sawStart ? OSC133_ZONE_START : "") + borderTop,
    ...wrapped,
    (sawEnd ? OSC133_ZONE_END + OSC133_ZONE_FINAL : "") + borderBottom,
  ];
}

function getToolState(component: Component): ToolState {
  const tool = component as Component & {
    isPartial?: boolean;
    result?: { isError?: boolean };
  };
  if (tool.result?.isError) return "error";
  if (tool.result && !tool.isPartial) return "success";
  return "pending";
}

function patchRender(prototype: Renderable, kind: BoxKind): void {
  if (prototype[PATCHED]) return;

  const original = prototype.render;
  prototype[PATCHED] = true;
  prototype[ORIGINAL_RENDER] = original;

  prototype.render = function patchedRender(
    this: Component,
    width: number,
  ): string[] {
    const innerWidth = Math.max(1, width - 2);
    const rendered = original.call(this, innerWidth);
    return wrapInBox(rendered, width, kind, kind === "tool" ? getToolState(this) : "pending");
  };
}

export default function boxedMessages(pi: ExtensionAPI) {
  patchRender(UserMessageComponent.prototype as Renderable, "user");
  patchRender(ToolExecutionComponent.prototype as Renderable, "tool");

  pi.on("session_start", (_event, ctx) => {
    state.activeTheme = ctx.ui.theme;
  });
}
