import type {
  ExtensionAPI,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import {
  PROVIDER_MAP,
  USAGE_REFRESH_INTERVAL,
  loadConfig,
  saveExtensionStatusPlacement,
  type ExtensionStatusPlacement,
  type PromptUiConfig,
} from "./core/config";
import { createFetcherRegistry } from "./fetchers";
import { createAuthResolver } from "./seams/auth";
import { createGitState } from "./seams/git";
import { createUsageState } from "./seams/usage-state";
import { PolishedInputEditor } from "./ui/editor";
import { buildEditorMeta, getThinkingLevel } from "./ui/editor-meta";
import { createLoadingBarFrames } from "./ui/loading-bar";
import { registerPromptUiSettingsCommand } from "./ui/settings-command";
import { renderStatusFooter } from "./ui/status-footer";

const WHIMSICAL_WORKING_MESSAGE_EVENT = "pi-whimsical:working-message";

function detectProvider(modelProvider: string | undefined): string | null {
  return modelProvider ? PROVIDER_MAP[modelProvider] || null : null;
}

export default function (pi: ExtensionAPI) {
  const auth = createAuthResolver();
  const git = createGitState();
  const usage = createUsageState({
    registry: createFetcherRegistry(auth),
    intervalMs: USAGE_REFRESH_INTERVAL,
  });

  let currentConfig: PromptUiConfig = loadConfig();
  let activeTui: TUI | undefined;
  let activeCwd: string | undefined;
  let projectRefreshTimer: ReturnType<typeof setInterval> | undefined;
  let projectRefreshInFlight = false;
  let projectRefreshPending = false;
  let requestFooterRender: (() => void) | undefined;
  let getActiveExtensionStatuses: () => ReadonlyMap<string, string> = () => new Map();
  let cleanupUsageListener: (() => void) | undefined;
  let hasPromptUi = false;
  let loadingTimer: ReturnType<typeof setInterval> | undefined;
  let loadingActive = false;
  let loadingFrameIndex = 0;
  let loadingFrames = createLoadingBarFrames(currentConfig.loadingBar);
  let workingMessage: string | undefined;

  function requestUiRender(): void {
    if (activeTui) {
      activeTui.requestRender();
      return;
    }
    requestFooterRender?.();
  }

  function refreshLoadingFrames(): void {
    loadingFrames = createLoadingBarFrames(currentConfig.loadingBar);
    loadingFrameIndex = loadingFrames.length > 0 ? loadingFrameIndex % loadingFrames.length : 0;
  }

  function currentLoadingFrame(): string | undefined {
    if (!loadingActive || loadingFrames.length === 0) return undefined;
    return loadingFrames[loadingFrameIndex] ?? loadingFrames[0];
  }

  function stopLoadingBar(render = true): void {
    const wasRunning = loadingActive || loadingTimer !== undefined;
    if (loadingTimer) {
      clearInterval(loadingTimer);
      loadingTimer = undefined;
    }
    loadingActive = false;
    loadingFrameIndex = 0;
    if (render && wasRunning) requestUiRender();
  }

  function startLoadingBar(): void {
    if (!hasPromptUi) return;

    stopLoadingBar(false);
    refreshLoadingFrames();
    if (loadingFrames.length === 0) return;

    loadingActive = true;
    loadingFrameIndex = 0;
    loadingTimer = setInterval(() => {
      if (loadingFrames.length === 0) return;
      loadingFrameIndex = (loadingFrameIndex + 1) % loadingFrames.length;
      requestUiRender();
    }, currentConfig.loadingBar.intervalMs);
    loadingTimer.unref?.();
    requestUiRender();
  }

  function scheduleProjectRefresh(cwd = activeCwd): void {
    if (!cwd) return;
    if (projectRefreshInFlight) {
      projectRefreshPending = true;
      return;
    }

    projectRefreshInFlight = true;
    git
      .refresh(cwd)
      .then((gitChanged) => {
        if (gitChanged) activeTui?.requestRender();
      })
      .finally(() => {
        projectRefreshInFlight = false;
        if (projectRefreshPending) {
          projectRefreshPending = false;
          scheduleProjectRefresh(cwd);
        }
      });
  }

  function startProjectRefresh(cwd: string): void {
    activeCwd = cwd;
    if (projectRefreshTimer) clearInterval(projectRefreshTimer);
    scheduleProjectRefresh(cwd);
    if (currentConfig.projectRefreshIntervalMs <= 0) return;
    projectRefreshTimer = setInterval(
      () => scheduleProjectRefresh(cwd),
      currentConfig.projectRefreshIntervalMs,
    );
    projectRefreshTimer.unref?.();
  }

  function stopProjectRefresh(): void {
    if (projectRefreshTimer) {
      clearInterval(projectRefreshTimer);
      projectRefreshTimer = undefined;
    }
    projectRefreshInFlight = false;
    projectRefreshPending = false;
    activeCwd = undefined;
  }

  function startUsageForProvider(modelProvider: string | undefined): void {
    const provider = detectProvider(modelProvider);
    if (provider) {
      usage.start(provider);
    } else {
      usage.stop();
    }
  }

  pi.events.on(WHIMSICAL_WORKING_MESSAGE_EVENT, (message) => {
    workingMessage = typeof message === "string" && message.length > 0 ? message : undefined;
    requestUiRender();
  });

  registerPromptUiSettingsCommand(pi, {
    getConfig: () => currentConfig,
    getActiveExtensionStatuses: () => getActiveExtensionStatuses(),
    setExtensionStatusPlacement(key: string, placement: ExtensionStatusPlacement) {
      currentConfig = saveExtensionStatusPlacement(key, placement);
    },
    requestRender() {
      requestFooterRender?.();
      activeTui?.requestRender();
    },
  });

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) {
      hasPromptUi = false;
      return;
    }

    hasPromptUi = ctx.mode === "tui";
    startProjectRefresh(ctx.cwd);
    startUsageForProvider(ctx.model?.provider);
    cleanupUsageListener?.();

    ctx.ui.setEditorComponent((tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => {
      cleanupUsageListener?.();
      activeTui = tui;
      cleanupUsageListener = usage.onChange(() => tui.requestRender());

      return new PolishedInputEditor(
        tui,
        theme,
        keybindings,
        () => {
          const thinkingLevel = getThinkingLevel(ctx);
          return {
            meta: buildEditorMeta(ctx, git.current(), thinkingLevel),
            loadingFrameIndex: loadingActive && loadingFrames.length > 0 ? loadingFrameIndex : undefined,
            loadingFrameCount: loadingFrames.length,
            workingMessage,
          };
        },
        ctx.ui.theme,
      );
    });

    ctx.ui.setFooter((tui: TUI, theme: Theme, footerData: ReadonlyFooterDataProvider) => {
      requestFooterRender = () => tui.requestRender();
      getActiveExtensionStatuses = () => footerData.getExtensionStatuses();

      return {
        dispose() {
          requestFooterRender = undefined;
          getActiveExtensionStatuses = () => new Map();
        },
        invalidate() {},
        render(width: number): string[] {
          return renderStatusFooter(
            ctx,
            footerData,
            currentConfig,
            usage.current(),
            width,
            theme,
            currentLoadingFrame(),
          );
        },
      };
    });
  });

  pi.on("session_shutdown", () => {
    stopLoadingBar(false);
    stopProjectRefresh();
    cleanupUsageListener?.();
    cleanupUsageListener = undefined;
    requestFooterRender = undefined;
    getActiveExtensionStatuses = () => new Map();
    activeTui = undefined;
    hasPromptUi = false;
    workingMessage = undefined;
    usage.stop();
  });

  pi.on("agent_start", () => {
    startLoadingBar();
  });

  pi.on("agent_end", () => {
    stopLoadingBar();
  });

  pi.on("turn_end", () => {
    scheduleProjectRefresh();
    activeTui?.requestRender();
  });

  pi.on("model_select", (event) => {
    startUsageForProvider(event.model.provider);
    activeTui?.requestRender();
  });

  pi.on("thinking_level_select", () => {
    activeTui?.requestRender();
  });
}
