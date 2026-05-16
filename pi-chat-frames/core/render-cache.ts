import type { Component } from "@earendil-works/pi-tui";
import type { FrameKind, ToolState } from "./types";
import { recordFrameCacheAccess, recordFrameCacheBypass, type CacheBypassReason } from "./debug";

const MAX_SOURCE_ROWS = 200;
const MAX_OUTPUT_ROWS = 250;
const MAX_SOURCE_CHARS = 20_000;
const MAX_OUTPUT_CHARS = 25_000;
const MAX_BASH_COMMAND_KEY_CHARS = 2_000;

interface ToolCacheLike extends Component {
  toolName?: unknown;
  args?: unknown;
  getRenderShell?: () => "default" | "self";
}

interface FrameCacheRequest {
  component: Component;
  width: number;
  kind: FrameKind;
  toolState: ToolState;
  rendered: string[];
}

interface CacheEntry {
  key: string;
  rows: string[];
}

let cache = new WeakMap<Component, CacheEntry>();

function hasTerminalImageRows(lines: string[]): boolean {
  return lines.some((line) => line.includes("\x1b_G") || line.includes("\x1b]1337;File="));
}

function totalChars(lines: string[]): number {
  return lines.reduce((sum, line) => sum + line.length, 0);
}

function sourceRowsKey(lines: string[]): { key: string } | { bypass: CacheBypassReason } {
  if (lines.length > MAX_SOURCE_ROWS || totalChars(lines) > MAX_SOURCE_CHARS) return { bypass: "source-too-large" };
  if (hasTerminalImageRows(lines)) return { bypass: "terminal-image" };

  return { key: lines.map((line) => `${line.length}:${line}`).join("\n") };
}

function bashArgsKey(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return "";

  const bashArgs = args as { command?: unknown; timeout?: unknown };
  const command = typeof bashArgs.command === "string" ? bashArgs.command.replace(/\s+/g, " ").trim() : "";
  if (command.length > MAX_BASH_COMMAND_KEY_CHARS) return undefined;

  const timeout = typeof bashArgs.timeout === "number" ? String(bashArgs.timeout) : "";
  return `${command}\n${timeout}`;
}

function toolStateKey(component: Component, toolState: ToolState): { key: string } | { bypass: CacheBypassReason } {
  if (toolState === "pending") return { bypass: "pending-tool" };

  const tool = component as ToolCacheLike;
  const toolName = typeof tool.toolName === "string" ? tool.toolName : "";
  const shell = tool.getRenderShell?.() ?? "default";
  const args = toolName === "bash" ? bashArgsKey(tool.args) : "";
  if (args === undefined) return { bypass: "tool-args" };

  return { key: `${toolName}\n${shell}\n${args}` };
}

function frameCacheKey(request: FrameCacheRequest): { key: string } | { bypass: CacheBypassReason } {
  if (request.width < 4) return { bypass: "narrow-width" };
  if (request.rendered.length === 0) return { bypass: "empty-render" };

  const stateKey = request.kind === "tool" ? toolStateKey(request.component, request.toolState) : { key: "" };
  if ("bypass" in stateKey) return stateKey;

  const renderedKey = sourceRowsKey(request.rendered);
  if ("bypass" in renderedKey) return renderedKey;

  return { key: `${request.width}\n${request.kind}\n${request.toolState}\n${stateKey.key}\n${renderedKey.key}` };
}

function isOutputCacheable(rows: string[]): boolean {
  return rows.length <= MAX_OUTPUT_ROWS && totalChars(rows) <= MAX_OUTPUT_CHARS && !hasTerminalImageRows(rows);
}

export function getCachedFrameRows(request: FrameCacheRequest): string[] | undefined {
  const result = frameCacheKey(request);
  if ("bypass" in result) {
    recordFrameCacheBypass(result.bypass);
    return undefined;
  }

  const entry = cache.get(request.component);
  const hit = entry?.key === result.key;
  recordFrameCacheAccess(request.kind, hit);
  return hit ? entry.rows : undefined;
}

export function setCachedFrameRows(request: FrameCacheRequest, rows: string[]): void {
  const result = frameCacheKey(request);
  if ("bypass" in result) return;
  if (!isOutputCacheable(rows)) {
    recordFrameCacheBypass("output-too-large");
    return;
  }

  cache.set(request.component, { key: result.key, rows });
}

export function clearFrameRenderCache(): void {
  cache = new WeakMap();
}
