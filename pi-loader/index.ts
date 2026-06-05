/**
 * pi-loader — Braille-dot working indicator for pi coding agent
 *
 * Compact braille-dot working indicator inspired by dotmatrix.zzzzshawn.cloud.
 * Replaces the default spinner with 2-character braille animation.
 * 54+ configurable patterns.
 *
 * Commands (with autocomplete):
 *   /loader preview  - Pick pattern, color, and speed
 *   /loader on       - Re-enable loader
 *   /loader off      - Restore default spinner
 *   /loader reset    - Reset to defaults
 */

import type { ExtensionAPI, ExtensionContext, Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { PATTERNS, PATTERN_KEYS } from "./patterns.ts";

const cycle = <T>(arr: readonly T[], idx: number, dir: -1 | 1): T =>
  arr[(idx + dir + arr.length) % arr.length]!;

const COLORS = ["accent", "muted", "dim", "text", "success", "warning", "error", "border", "borderAccent"] as const;
const PREVIEW_COLORS = [...COLORS, "16","39","48","117","123","183","193","202","213","214","228","244","255"] as string[];

function intervalMs(frameCount: number, defaultSpeed: number, speedMultiplier: number): number {
  return Math.max(80, Math.min(300, 1600 / frameCount)) / (defaultSpeed * speedMultiplier);
}

function colorize(text: string, color: string, theme: Theme): string {
  if ((COLORS as readonly string[]).includes(color)) return theme.fg(color as ThemeColor, text);
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
  }
  if (/^\d{1,3}$/.test(color)) {
    const n = parseInt(color, 10);
    if (n >= 0 && n <= 255) return `\x1b[38;5;${n}m${text}\x1b[0m`;
  }
  return text;
}

// ─── Preview component ────────────────────────────────────────────────

class LoaderPreviewComponent {
  private animInterval: ReturnType<typeof setInterval> | null = null;
  private frameIndex = 0;
  private frames: string[] = [];
  private theme: Theme;
  private tui: { requestRender: () => void };
  private done: () => void;
  private patternIndex: number;
  private patternKeys: string[];
  private color: string;
  private colorValues: string[];
  private speed: number;
  private onSelect: (pattern: string, color: string, speed: number) => void;

  constructor(
    tui: { requestRender: () => void },
    theme: Theme,
    done: () => void,
    startIndex: number,
    patternKeys: string[],
    color: string,
    colorValues: string[],
    startSpeed: number,
    onSelect: (pattern: string, color: string, speed: number) => void,
  ) {
    this.tui = tui;
    this.theme = theme;
    this.done = done;
    this.patternIndex = startIndex;
    this.patternKeys = patternKeys;
    this.color = color;
    this.colorValues = colorValues;
    this.speed = startSpeed;
    this.onSelect = onSelect;
    this.buildFrames();
    this.startAnimation();
  }

  private get patternKey(): string {
    return this.patternKeys[this.patternIndex]!;
  }

  private buildFrames(): void {
    const key = this.patternKey;
    const entry = PATTERNS[key];
    if (!entry) {
      console.error("[loader] unknown pattern:", key, "keys:", Object.keys(PATTERNS).slice(0,5));
      this.frames = ["⠿"];
      return;
    }
    this.frames = entry.frames.map((f) => colorize(f, this.color, this.theme));
    this.frameIndex = 0;
  }

  private startAnimation(): void {
    this.stopAnimation();
    const entry = PATTERNS[this.patternKey];
    if (!entry) return;
    const ms = intervalMs(this.frames.length, entry.defaultSpeed, this.speed);
    this.animInterval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.tui.requestRender();
    }, Math.max(16, ms));
  }

  private stopAnimation(): void {
    if (this.animInterval) { clearInterval(this.animInterval); this.animInterval = null; }
  }

  private close(): void {
    this.stopAnimation();
    this.done();
  }

  private switchPattern(dir: -1 | 1): void {
    this.patternIndex = (this.patternIndex + dir + this.patternKeys.length) % this.patternKeys.length;
    this.buildFrames();
    this.startAnimation();
    this.tui.requestRender();
  }

  private switchColor(dir: -1 | 1): void {
    this.color = cycle(this.colorValues, this.colorValues.indexOf(this.color), dir);
    this.buildFrames();
    this.tui.requestRender();
  }

  private switchSpeed(dir: -1 | 1): void {
    this.speed = Math.max(0.25, Math.min(10.0, this.speed + dir * 0.25));
    this.startAnimation();
    this.tui.requestRender();
  }

  render(width: number): string[] {
    const frame = this.frames[this.frameIndex] ?? this.frames[0] ?? "⠿";
    const entry = PATTERNS[this.patternKey];
    const total = this.patternKeys.length;
    const a = (s: string) => this.theme.fg("accent", s);
    const d = (s: string) => this.theme.fg("dim", s);
    const padded = (s: string) => {
      const text = truncateToWidth(s, Math.max(0, width));
      return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
    };

    const lines: string[] = [];
    const hr = a("".padEnd(width, "─"));
    lines.push(hr);
    lines.push(" ".repeat(width));
    lines.push(padded("  " + a("Loader Gallery")));
    lines.push(" ".repeat(width));
    lines.push(padded("    " + frame));
    lines.push(" ".repeat(width));
    lines.push(padded("  " + (entry?.name ?? this.patternKey)));
    lines.push(padded("  " + d(`${this.patternIndex + 1} / ${total}  ·  ${this.color}  ·  ${this.speed.toFixed(1)}x`)));
    lines.push(" ".repeat(width));
    lines.push(padded("  " + d("[Enter] select  [Esc] close")));
    lines.push(padded("  " + d("[←→] pattern  [↑↓] speed  [[]] color")));
    lines.push(" ".repeat(width));
    lines.push(hr);

    return lines;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape")) { this.close(); return; }
    if (matchesKey(data, "enter")) {
      this.onSelect(this.patternKey, this.color, this.speed);
      this.close();
      return;
    }
    if (matchesKey(data, "left")) { this.switchPattern(-1); return; }
    if (matchesKey(data, "right")) { this.switchPattern(1); return; }
    if (matchesKey(data, "up")) { this.switchSpeed(1); return; }
    if (matchesKey(data, "down")) { this.switchSpeed(-1); return; }
    if (matchesKey(data, "[") || matchesKey(data, "{")) { this.switchColor(-1); return; }
    if (matchesKey(data, "]") || matchesKey(data, "}")) { this.switchColor(1); return; }
  }

  invalidate(): void {
    this.buildFrames();
  }

  dispose(): void {
    this.stopAnimation();
  }
}

// ─── Extension ─────────────────────────────────────────────────────────

interface Config {
  pattern: string;
  color: string;
  speed: number;
}

const DEFAULTS: Config = {
  pattern: "default",
  color: "accent",
  speed: 1.0,
};

const CONFIG_PATH = join(homedir(), ".pi", "pi-loader.json");

function loadConfig(): Config {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {
    const err = e as { code?: string };
    if (err.code !== "ENOENT") console.error("[loader] loadConfig error:", e);
    return { ...DEFAULTS };
  }
}

function saveConfig(cfg: Config): void {
  try {
    const dir = dirname(CONFIG_PATH);
    mkdirSync(dir, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
  } catch (e) {
    console.error("[loader] saveConfig failed:", e);
  }
}

export default function (pi: ExtensionAPI) {
  let config: Config = loadConfig();
  let disabled = false;

  const apply = (ctx: ExtensionContext) => {
    if (disabled) { ctx.ui.setWorkingIndicator(); return; }
    const pattern = PATTERNS[config.pattern];
    if (!pattern || !pattern.frames.length) return;
    ctx.ui.setWorkingIndicator({
      frames: pattern.frames.map((f) => colorize(f, config.color, ctx.ui.theme)),
      intervalMs: intervalMs(pattern.frames.length, pattern.defaultSpeed, config.speed),
    });
  };

  pi.on("session_start", async (_event, ctx) => {
    config = loadConfig();
    apply(ctx);
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    apply(ctx);
  });

  pi.registerCommand("loader", {
    description: "Configure pi-loader",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const subs: AutocompleteItem[] = [
        { value: "preview", label: "preview — pick pattern/color/speed" },
        { value: "on",      label: "on — re-enable loader" },
        { value: "off",     label: "off — restore default spinner" },
        { value: "reset",   label: "reset — defaults" },
      ];
      if (!prefix) return subs;
      if (prefix.trim().includes(" ")) return null;
      const filtered = subs.filter((s) => s.value.startsWith(prefix));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const parts = trimmed ? trimmed.split(/\s+/) : [];
      const sub = parts[0]?.toLowerCase();
      const hasExtraArgs = parts.length > 1;
      const usage = "/loader [preview|on|off|reset]";

      if (hasExtraArgs) {
        ctx.ui.notify(usage, "info");
        return;
      }

      switch (sub) {
        case "off": {
          disabled = true;
          ctx.ui.setWorkingIndicator();
          ctx.ui.notify("Loader off", "info");
          return;
        }
        case "on": {
          disabled = false;
          apply(ctx);
          ctx.ui.notify("Loader on", "info");
          return;
        }
        case "preview": {
          if (ctx.mode !== "tui") {
            ctx.ui.notify("/loader preview requires interactive TUI mode", "error");
            return;
          }
          const startIdx = Math.max(0, PATTERN_KEYS.indexOf(config.pattern));
          const previewColors = [...PREVIEW_COLORS];
          if (!previewColors.includes(config.color)) previewColors.push(config.color);
          await ctx.ui.custom<void>(
            (tui, theme, _kb, done) => new LoaderPreviewComponent(
              tui, theme, () => done(undefined),
              startIdx,
              PATTERN_KEYS,
              config.color,
              previewColors,
              config.speed,
              (pattern, color, speed) => {
                config.pattern = pattern;
                config.color = color;
                config.speed = speed;
                saveConfig(config);
                apply(ctx);
                ctx.ui.notify(`Selected: ${PATTERNS[pattern]?.name ?? pattern} · ${color} · ${speed}x`, "info");
              },
            ),
            { overlay: true },
          );
          return;
        }
        case "reset": {
          config = { ...DEFAULTS };
          saveConfig(config);
          apply(ctx);
          ctx.ui.notify("Reset → Default, accent, 1x", "info");
          return;
        }
        default: {
          const p = PATTERNS[config.pattern];
          ctx.ui.notify(
            `${usage}\n${p?.name ?? config.pattern} · ${config.color} · ${config.speed}x`,
            "info",
          );
        }
      }
    },
  });
}
