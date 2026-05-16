import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import type { FrameKind } from "./types";

const DEBUG_WIDGET_ID = "pi-chat-frames-debug";
const MAX_SAMPLES = 100;
const REFRESH_INTERVAL_MS = 250;
const FRAME_KINDS: FrameKind[] = ["user", "tool", "skill", "custom", "bash", "compaction", "branch"];
const CACHE_BYPASS_REASONS = [
  "narrow-width",
  "empty-render",
  "pending-tool",
  "source-too-large",
  "terminal-image",
  "tool-args",
  "output-too-large",
] as const;

export type CacheBypassReason = (typeof CACHE_BYPASS_REASONS)[number];

interface RenderSample {
  kind: FrameKind;
  wholeDurationMs: number;
  originalDurationMs: number;
  frameOverheadMs: number;
  renderedRowCount: number;
  sameWidthRepeat: boolean;
}

interface ComponentRenderInfo {
  widths: Set<number>;
}

interface DebugState {
  totalRenders: number;
  rendersByKind: Record<FrameKind, number>;
  sameWidthRepeatRenders: number;
  sameWidthRepeatRendersByKind: Record<FrameKind, number>;
  cacheHits: number;
  cacheLookups: number;
  cacheHitsByKind: Record<FrameKind, number>;
  cacheBypasses: number;
  cacheBypassReasons: Record<CacheBypassReason, number>;
  observedComponents: number;
  observedComponentWidths: number;
  componentRenderInfo: WeakMap<Component, ComponentRenderInfo>;
  samples: RenderSample[];
  nextSampleIndex: number;
  lastRefreshMs: number;
  ctx?: ExtensionContext;
}

const state: DebugState = {
  totalRenders: 0,
  rendersByKind: {
    user: 0,
    tool: 0,
    skill: 0,
    custom: 0,
    bash: 0,
    compaction: 0,
    branch: 0,
  },
  sameWidthRepeatRenders: 0,
  sameWidthRepeatRendersByKind: {
    user: 0,
    tool: 0,
    skill: 0,
    custom: 0,
    bash: 0,
    compaction: 0,
    branch: 0,
  },
  cacheHits: 0,
  cacheLookups: 0,
  cacheHitsByKind: {
    user: 0,
    tool: 0,
    skill: 0,
    custom: 0,
    bash: 0,
    compaction: 0,
    branch: 0,
  },
  cacheBypasses: 0,
  cacheBypassReasons: {
    "narrow-width": 0,
    "empty-render": 0,
    "pending-tool": 0,
    "source-too-large": 0,
    "terminal-image": 0,
    "tool-args": 0,
    "output-too-large": 0,
  },
  observedComponents: 0,
  observedComponentWidths: 0,
  componentRenderInfo: new WeakMap(),
  samples: [],
  nextSampleIndex: 0,
  lastRefreshMs: 0,
};

export function isDebugEnabled(): boolean {
  return process.env.PI_CHAT_FRAMES_DEBUG === "1";
}

function nowMs(): number {
  return performance.now();
}

function formatMs(value: number): string {
  return `${value.toFixed(2)}ms`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function average(samples: RenderSample[], getValue: (sample: RenderSample) => number): number {
  return samples.length === 0 ? 0 : samples.reduce((sum, sample) => sum + getValue(sample), 0) / samples.length;
}

function recentSamples(): RenderSample[] {
  return state.samples.length < MAX_SAMPLES
    ? state.samples
    : [...state.samples.slice(state.nextSampleIndex), ...state.samples.slice(0, state.nextSampleIndex)];
}

function formatDebugWidgetLines(): string[] {
  const samples = recentSamples();
  const averageWhole = average(samples, (sample) => sample.wholeDurationMs);
  const averageOriginal = average(samples, (sample) => sample.originalDurationMs);
  const averageOverhead = average(samples, (sample) => sample.frameOverheadMs);
  const slowest = samples.reduce<RenderSample | undefined>(
    (current, sample) => current === undefined || sample.wholeDurationMs > current.wholeDurationMs ? sample : current,
    undefined,
  );
  const renderCountsByKind = FRAME_KINDS.map((kind) => `${kind}:${state.rendersByKind[kind]}`).join(" ");
  const overheadByKind = FRAME_KINDS
    .map((kind) => {
      const kindSamples = samples.filter((sample) => sample.kind === kind);
      return `${kind}:${formatMs(average(kindSamples, (sample) => sample.frameOverheadMs))}`;
    })
    .join(" ");
  const sameWidthRepeatCountsByKind = FRAME_KINDS.map((kind) => `${kind}:${state.sameWidthRepeatRendersByKind[kind]}`).join(
    " ",
  );
  const sameWidthRepeatRate =
    state.totalRenders === 0 ? 0 : (state.sameWidthRepeatRenders / state.totalRenders) * 100;
  const recentSameWidthRepeatRate =
    samples.length === 0 ? 0 : (samples.filter((sample) => sample.sameWidthRepeat).length / samples.length) * 100;
  const averageRepeatRows = average(
    samples.filter((sample) => sample.sameWidthRepeat),
    (sample) => sample.renderedRowCount,
  );
  const cacheHitRate = state.cacheLookups === 0 ? 0 : (state.cacheHits / state.cacheLookups) * 100;
  const cacheHitsByKind = FRAME_KINDS.map((kind) => `${kind}:${state.cacheHitsByKind[kind]}`).join(" ");
  const cacheBypassReasons = CACHE_BYPASS_REASONS.map((reason) => `${reason}:${state.cacheBypassReasons[reason]}`).join(
    " ",
  );

  return [
    `pi-chat-frames debug: ${isDebugEnabled() ? "on" : "off"}`,
    `renders: ${state.totalRenders} (${renderCountsByKind})`,
    `recent avg: whole ${formatMs(averageWhole)} original ${formatMs(averageOriginal)} overhead ${formatMs(averageOverhead)}`,
    `recent overhead by kind: ${overheadByKind}`,
    `same-width repeats: ${state.sameWidthRepeatRenders} (${formatPercent(sameWidthRepeatRate)}, recent ${formatPercent(recentSameWidthRepeatRate)})`,
    `repeat by kind: ${sameWidthRepeatCountsByKind}`,
    `observed components: ${state.observedComponents} component-widths:${state.observedComponentWidths} repeat avg rows:${averageRepeatRows.toFixed(1)}`,
    `cache hits: ${state.cacheHits}/${state.cacheLookups} (${formatPercent(cacheHitRate)}) by kind ${cacheHitsByKind}`,
    `cache bypasses: ${state.cacheBypasses} (${cacheBypassReasons})`,
    `slowest whole: ${slowest ? `${slowest.kind} ${formatMs(slowest.wholeDurationMs)} rows:${slowest.renderedRowCount}` : "n/a"}`,
  ];
}

function resetDebugState(): void {
  state.totalRenders = 0;
  state.sameWidthRepeatRenders = 0;
  state.cacheHits = 0;
  state.cacheLookups = 0;
  state.cacheBypasses = 0;
  for (const reason of CACHE_BYPASS_REASONS) {
    state.cacheBypassReasons[reason] = 0;
  }
  state.observedComponents = 0;
  state.observedComponentWidths = 0;
  state.componentRenderInfo = new WeakMap();
  for (const kind of FRAME_KINDS) {
    state.rendersByKind[kind] = 0;
    state.sameWidthRepeatRendersByKind[kind] = 0;
    state.cacheHitsByKind[kind] = 0;
  }
  state.samples = [];
  state.nextSampleIndex = 0;
  state.lastRefreshMs = 0;
}

function refreshDebugWidget(force = false): void {
  if (!isDebugEnabled() || !state.ctx) return;

  const currentMs = nowMs();
  if (!force && currentMs - state.lastRefreshMs < REFRESH_INTERVAL_MS) return;

  state.lastRefreshMs = currentMs;
  state.ctx.ui.setWidget(DEBUG_WIDGET_ID, formatDebugWidgetLines());
}

export function recordFrameRender(
  component: Component,
  width: number,
  kind: FrameKind,
  wholeDurationMs: number,
  originalDurationMs: number,
  frameOverheadMs: number,
  renderedRowCount: number,
): void {
  if (!isDebugEnabled()) return;

  let renderInfo = state.componentRenderInfo.get(component);
  if (!renderInfo) {
    renderInfo = { widths: new Set() };
    state.componentRenderInfo.set(component, renderInfo);
    state.observedComponents++;
  }

  const sameWidthRepeat = renderInfo.widths.has(width);
  if (!sameWidthRepeat) {
    renderInfo.widths.add(width);
    state.observedComponentWidths++;
  }

  const sample: RenderSample = {
    kind,
    wholeDurationMs,
    originalDurationMs,
    frameOverheadMs,
    renderedRowCount,
    sameWidthRepeat,
  };

  state.totalRenders++;
  state.rendersByKind[kind]++;
  if (sameWidthRepeat) {
    state.sameWidthRepeatRenders++;
    state.sameWidthRepeatRendersByKind[kind]++;
  }

  if (state.samples.length < MAX_SAMPLES) {
    state.samples.push(sample);
  } else {
    state.samples[state.nextSampleIndex] = sample;
    state.nextSampleIndex = (state.nextSampleIndex + 1) % MAX_SAMPLES;
  }

  refreshDebugWidget();
}

export function recordFrameCacheAccess(kind: FrameKind, hit: boolean): void {
  if (!isDebugEnabled()) return;

  state.cacheLookups++;
  if (hit) {
    state.cacheHits++;
    state.cacheHitsByKind[kind]++;
  }
}

export function recordFrameCacheBypass(reason: CacheBypassReason): void {
  if (!isDebugEnabled()) return;

  state.cacheBypasses++;
  state.cacheBypassReasons[reason]++;
}

export function registerDebugWidget(ctx: ExtensionContext): void {
  if (!isDebugEnabled()) return;

  resetDebugState();
  state.ctx = ctx;
  refreshDebugWidget(true);
}

export function clearDebugWidget(): void {
  if (state.ctx) {
    state.ctx.ui.setWidget(DEBUG_WIDGET_ID, undefined);
  }
  state.ctx = undefined;
}
