import type { Component } from "@earendil-works/pi-tui";
import type { FrameKind, Renderable } from "./types";
import { patchRender as patchManagedRender } from "./patch-manager";
import { getToolFrameOptions, getToolState } from "./tool-adapter";
import { renderFrame } from "../ui/frame";

export function patchRender(prototype: Renderable, kind: FrameKind): void {
  patchManagedRender(prototype, function renderChatFrame(this: Component, original, width): string[] {
    if (width < 4) return original.call(this, width);

    const innerWidth = Math.max(1, width - 2);
    const rendered = original.call(this, innerWidth);
    const toolState = kind === "tool" ? getToolState(this) : "pending";
    const options = kind === "tool" ? getToolFrameOptions(this, innerWidth, rendered, toolState) : {};
    return renderFrame(rendered, width, kind, toolState, options);
  });
}
