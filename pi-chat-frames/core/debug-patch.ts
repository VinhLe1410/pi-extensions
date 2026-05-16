import type { Component } from "@earendil-works/pi-tui";
import { recordFrameCacheAccess, recordFrameCacheBypass, recordFrameRender } from "./debug";
import { patchRender as patchManagedRender } from "./patch-manager";
import { getFrameCacheRows, setFrameCacheRows } from "./render-cache";
import { getToolFrameOptions, getToolState } from "./tool-adapter";
import type { FrameKind, Renderable } from "./types";
import { renderFrame } from "../ui/frame";

function renderFramedRowsWithDebug(
  component: Component,
  width: number,
  innerWidth: number,
  rendered: string[],
  kind: FrameKind,
): string[] {
  const toolState = kind === "tool" ? getToolState(component) : "pending";
  const cacheRequest = { component, width, kind, toolState, rendered };
  const cached = getFrameCacheRows(cacheRequest);
  if (cached.status === "hit") {
    recordFrameCacheAccess(kind, true);
    return cached.rows;
  }
  if (cached.status === "miss") {
    recordFrameCacheAccess(kind, false);
  } else {
    recordFrameCacheBypass(cached.reason);
  }

  const options = kind === "tool" ? getToolFrameOptions(component, innerWidth, rendered, toolState) : {};
  const output = renderFrame(rendered, width, kind, toolState, options);
  const stored = setFrameCacheRows(cacheRequest, output);
  if (stored.status === "bypass") recordFrameCacheBypass(stored.reason);
  return output;
}

export function patchRenderWithDebug(prototype: Renderable, kind: FrameKind): void {
  patchManagedRender(prototype, function renderChatFrameWithDebug(this: Component, original, width): string[] {
    const wholeStart = performance.now();
    let originalDurationMs = 0;
    let frameOverheadMs = 0;
    let output: string[];

    if (width < 4) {
      const originalStart = performance.now();
      output = original.call(this, width);
      originalDurationMs = performance.now() - originalStart;
    } else {
      const innerWidth = Math.max(1, width - 2);
      const originalStart = performance.now();
      const rendered = original.call(this, innerWidth);
      originalDurationMs = performance.now() - originalStart;

      const frameStart = performance.now();
      output = renderFramedRowsWithDebug(this, width, innerWidth, rendered, kind);
      frameOverheadMs = performance.now() - frameStart;
    }

    recordFrameRender(this, width, kind, performance.now() - wholeStart, originalDurationMs, frameOverheadMs, output.length);
    return output;
  });
}
