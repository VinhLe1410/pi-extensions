import type { Component } from "@earendil-works/pi-tui";
import { ORIGINAL_RENDER, PATCHED } from "./symbols";
import type { Renderable } from "./types";

export type RenderPatch = (this: Component, original: (width: number) => string[], width: number) => string[];

export function unpatchRender(prototype: Renderable): void {
  const original = prototype[ORIGINAL_RENDER];
  if (!prototype[PATCHED] || !original) return;

  prototype.render = original;
  delete prototype[PATCHED];
  delete prototype[ORIGINAL_RENDER];
}

export function patchRender(prototype: Renderable, patch: RenderPatch): void {
  if (prototype[PATCHED]) {
    unpatchRender(prototype);
  }

  const original = prototype.render;
  prototype[PATCHED] = true;
  prototype[ORIGINAL_RENDER] = original;

  prototype.render = function patchedRender(this: Component, width: number): string[] {
    return patch.call(this, original, width);
  };
}
