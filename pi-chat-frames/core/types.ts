import type { Component } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { PATCHED, ORIGINAL_RENDER } from "./symbols";

export type FrameKind = "user" | "tool" | "skill" | "custom" | "bash" | "compaction" | "branch";
export type ToolState = "pending" | "success" | "error";

export interface ChatFramesState {
  activeTheme?: Theme;
}

export type Renderable = Component & {
  [PATCHED]?: boolean;
  [ORIGINAL_RENDER]?: (width: number) => string[];
};
