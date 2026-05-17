import type { Theme } from "@earendil-works/pi-coding-agent";
import { GLOBAL_STATE } from "./symbols";
import type { ChatUiState } from "./types";

const state = ((
  globalThis as typeof globalThis & { [GLOBAL_STATE]?: ChatUiState }
)[GLOBAL_STATE] ??= {});

export function setActiveTheme(theme: Theme): void {
  state.activeTheme = theme;
}

export function getActiveTheme(): Theme | undefined {
  return state.activeTheme;
}
