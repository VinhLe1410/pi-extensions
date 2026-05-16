import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import { getActiveTheme } from "../core/state";
import type { FrameKind, ToolState } from "../core/types";

function toolBorderToken(toolState: ToolState): "borderMuted" | "success" | "error" {
  if (toolState === "success") return "success";
  if (toolState === "error") return "error";
  return "borderMuted";
}

function fallbackAnsi(kind: FrameKind, toolState: ToolState): string {
  if (kind === "tool" && toolState === "success") return "32";
  if (kind === "tool" && toolState === "error") return "31";
  if (kind === "bash") return "36";
  return "90";
}

function frameColorToken(kind: FrameKind, toolState: ToolState): ThemeColor {
  if (kind === "user") return "accent";
  if (kind === "tool") return toolBorderToken(toolState);
  if (kind === "bash") return "bashMode";
  return "customMessageLabel";
}

function frameLabel(kind: FrameKind): string {
  if (kind === "user") return " user ";
  if (kind === "tool") return " tool ";
  if (kind === "skill") return " skill ";
  if (kind === "custom") return " custom ";
  if (kind === "bash") return " bash ";
  if (kind === "compaction") return " compaction ";
  return " branch ";
}

function labelColorToken(kind: FrameKind): ThemeColor {
  if (kind === "user") return "accent";
  if (kind === "tool") return "toolTitle";
  if (kind === "bash") return "bashMode";
  return "customMessageLabel";
}

export function frameColor(kind: FrameKind, text: string, toolState: ToolState = "pending"): string {
  const theme = getActiveTheme();
  if (!theme) return `\x1b[${fallbackAnsi(kind, toolState)}m${text}\x1b[39m`;

  return theme.fg(frameColorToken(kind, toolState), text);
}

export function labelColor(kind: FrameKind, text = frameLabel(kind)): string {
  const theme = getActiveTheme();
  if (!theme) return text;
  return theme.fg(labelColorToken(kind), text);
}

export function dimColor(text: string): string {
  const theme = getActiveTheme();
  if (!theme) return `\x1b[2m${text}\x1b[22m`;
  return theme.fg("dim", text);
}
