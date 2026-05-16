import type { Component } from "@earendil-works/pi-tui";
import type { FrameKind, Renderable } from "./types";
import { isDebugEnabled, recordFrameRender } from "./debug";
import { getCachedFrameRows, setCachedFrameRows } from "./render-cache";
import { patchRender as patchManagedRender } from "./patch-manager";
import { getToolFrameOptions, getToolState } from "./tool-adapter";
import { renderFrame } from "../ui/frame";

function renderFramedRows(
  component: Component,
  width: number,
  innerWidth: number,
  rendered: string[],
  kind: FrameKind,
): string[] {
  const toolState = kind === "tool" ? getToolState(component) : "pending";
  const cacheRequest = { component, width, kind, toolState, rendered };
  const cached = getCachedFrameRows(cacheRequest);
  if (cached) return cached;

  const options = kind === "tool" ? getToolFrameOptions(component, innerWidth, rendered, toolState) : {};
  const output = renderFrame(rendered, width, kind, toolState, options);
  setCachedFrameRows(cacheRequest, output);
  return output;
}

export function patchRender(prototype: Renderable, kind: FrameKind): void {
  patchManagedRender(prototype, function renderChatFrame(this: Component, original, width): string[] {
    if (!isDebugEnabled()) {
      if (width < 4) return original.call(this, width);

      const innerWidth = Math.max(1, width - 2);
      const rendered = original.call(this, innerWidth);
      return renderFramedRows(this, width, innerWidth, rendered, kind);
    }

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
      output = renderFramedRows(this, width, innerWidth, rendered, kind);
      frameOverheadMs = performance.now() - frameStart;
    }

    recordFrameRender(this, width, kind, performance.now() - wholeStart, originalDurationMs, frameOverheadMs, output.length);
    return output;
  });
}
