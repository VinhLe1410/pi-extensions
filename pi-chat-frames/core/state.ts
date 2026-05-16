import type { Theme } from "@earendil-works/pi-coding-agent";
import { GLOBAL_STATE } from "./symbols";
import type { ChatFramesState } from "./types";

const state = ((
  globalThis as typeof globalThis & { [GLOBAL_STATE]?: ChatFramesState }
)[GLOBAL_STATE] ??= {});

export function setActiveTheme(theme: Theme): void {
  state.activeTheme = theme;
}

export function getActiveTheme(): Theme | undefined {
  return state.activeTheme;
}
