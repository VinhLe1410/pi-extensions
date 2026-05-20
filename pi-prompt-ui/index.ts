import type {
  ExtensionAPI,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import {
  GIT_REFRESH_INTERVAL_MS,
  PROVIDER_MAP,
  USAGE_REFRESH_INTERVAL,
} from "./core/config";
import { createFetcherRegistry } from "./fetchers";
import { createAuthResolver } from "./seams/auth";
import { createGitState } from "./seams/git";
import { createUsageState } from "./seams/usage-state";
import { buildBorderLabels, getThinkingLevel } from "./ui/border-labels";
import { RoundedInputEditor } from "./ui/editor";
import { renderExtensionStatusFooter } from "./ui/status-footer";

interface CodexFastState {
  enabled?: boolean;
}

function detectProvider(modelProvider: string | undefined): string | null {
  return modelProvider ? PROVIDER_MAP[modelProvider] || null : null;
}

function isCodexFastState(value: unknown): value is CodexFastState {
  return typeof value === "object" && value !== null && "enabled" in value;
}

export default function (pi: ExtensionAPI) {
  const auth = createAuthResolver();
  const git = createGitState();
  const usage = createUsageState({
    registry: createFetcherRegistry(auth),
    intervalMs: USAGE_REFRESH_INTERVAL,
  });

  let activeTui: TUI | undefined;
  let gitRefreshTimer: ReturnType<typeof setInterval> | undefined;
  let gitRefreshInFlight = false;
  let cleanupUsageListener: (() => void) | undefined;
  let fastModeEnabled = false;

  function refreshGit(): void {
    if (gitRefreshInFlight) return;

    gitRefreshInFlight = true;
    git.refresh()
      .then((changed) => {
        if (changed) activeTui?.requestRender();
      })
      .finally(() => {
        gitRefreshInFlight = false;
      });
  }

  function startGitRefresh(): void {
    if (gitRefreshTimer) clearInterval(gitRefreshTimer);
    refreshGit();
    gitRefreshTimer = setInterval(refreshGit, GIT_REFRESH_INTERVAL_MS);
  }

  function stopGitRefresh(): void {
    if (gitRefreshTimer) {
      clearInterval(gitRefreshTimer);
      gitRefreshTimer = undefined;
    }
  }

  function startUsageForProvider(modelProvider: string | undefined): void {
    const provider = detectProvider(modelProvider);
    if (provider) {
      usage.start(provider);
    } else {
      usage.stop();
    }
  }

  pi.on("session_start", (_event, ctx) => {
    startGitRefresh();
    if (!ctx.hasUI) return;

    startUsageForProvider(ctx.model?.provider);
    cleanupUsageListener?.();

    ctx.ui.setEditorComponent((tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => {
      cleanupUsageListener?.();
      activeTui = tui;
      cleanupUsageListener = usage.onChange(() => tui.requestRender());

      return new RoundedInputEditor(tui, theme, keybindings, () => {
        const thinkingLevel = getThinkingLevel(ctx);
        return {
          labels: buildBorderLabels(ctx, ctx.ui.theme, git.current(), usage, fastModeEnabled, thinkingLevel),
        };
      }, ctx.ui.theme);
    });

    ctx.ui.setFooter((_tui: TUI, theme: Theme, footerData: ReadonlyFooterDataProvider) => ({
      invalidate() {},
      render(width: number): string[] {
        return renderExtensionStatusFooter(footerData, width, theme);
      },
    }));
  });

  pi.on("session_shutdown", () => {
    stopGitRefresh();
    cleanupUsageListener?.();
    cleanupUsageListener = undefined;
    activeTui = undefined;
    fastModeEnabled = false;
    usage.stop();
  });

  pi.events.on("codex-fast:state", (state: unknown) => {
    if (!isCodexFastState(state)) return;
    fastModeEnabled = state.enabled === true;
    activeTui?.requestRender();
  });

  pi.on("turn_end", () => {
    refreshGit();
  });

  pi.on("model_select", (event) => {
    startUsageForProvider(event.model.provider);
    activeTui?.requestRender();
  });

  pi.on("thinking_level_select", () => {
    activeTui?.requestRender();
  });
}
