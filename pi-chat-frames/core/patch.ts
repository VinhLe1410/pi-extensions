import type { Component } from "@earendil-works/pi-tui";
import type { FrameKind, Renderable, ToolState } from "./types";
import { ORIGINAL_RENDER, PATCHED } from "./symbols";
import { renderFrame } from "../ui/frame";

function getToolState(component: Component): ToolState {
  const tool = component as Component & {
    isPartial?: boolean;
    result?: { isError?: boolean };
  };
  if (tool.result?.isError) return "error";
  if (tool.result && !tool.isPartial) return "success";
  return "pending";
}

export function patchRender(prototype: Renderable, kind: FrameKind): void {
  if (prototype[PATCHED]) return;

  const original = prototype.render;
  prototype[PATCHED] = true;
  prototype[ORIGINAL_RENDER] = original;

  prototype.render = function patchedRender(this: Component, width: number): string[] {
    const innerWidth = Math.max(1, width - 2);
    const rendered = original.call(this, innerWidth);
    const toolState = kind === "tool" ? getToolState(this) : "pending";
    return renderFrame(rendered, width, kind, toolState);
  };
}
