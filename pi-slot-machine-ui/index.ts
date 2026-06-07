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
import { registerSlotMachineUiSettingsCommand } from "./ui/settings-command";
import { renderStatusFooter } from "./ui/status-footer";
import { pickWorkingMessage } from "./whimsical/messages";

const BORDER_CHASE_INTERVAL_MS = 50;
const BORDER_CHASE_CYCLE_MS = 850;
const BORDER_CHASE_FRAME_COUNT = Math.max(1, Math.round(BORDER_CHASE_CYCLE_MS / BORDER_CHASE_INTERVAL_MS));

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
  let borderChaseTimer: ReturnType<typeof setInterval> | undefined;
  let borderChaseActive = false;
  let borderChaseFrameIndex = 0;
  let workingMessage: string | undefined;

  function requestUiRender(): void {
    if (activeTui) {
      activeTui.requestRender();
      return;
    }
    requestFooterRender?.();
  }

  function stopBorderChase(render = true): void {
    const wasRunning = borderChaseActive || borderChaseTimer !== undefined;
    if (borderChaseTimer) {
      clearInterval(borderChaseTimer);
      borderChaseTimer = undefined;
    }
    borderChaseActive = false;
    borderChaseFrameIndex = 0;
    if (render && wasRunning) requestUiRender();
  }

  function startBorderChase(): void {
    if (!hasPromptUi) return;

    stopBorderChase(false);
    borderChaseActive = true;
    borderChaseFrameIndex = 0;
    borderChaseTimer = setInterval(() => {
      borderChaseFrameIndex = (borderChaseFrameIndex + 1) % BORDER_CHASE_FRAME_COUNT;
      requestUiRender();
    }, BORDER_CHASE_INTERVAL_MS);
    borderChaseTimer.unref?.();
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

  registerSlotMachineUiSettingsCommand(pi, {
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
    ctx.ui.setWorkingMessage();
    ctx.ui.setWorkingIndicator();
    ctx.ui.setWorkingVisible(false);
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
            chaseFrameIndex: borderChaseActive ? borderChaseFrameIndex : undefined,
            chaseFrameCount: BORDER_CHASE_FRAME_COUNT,
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
          );
        },
      };
    });
  });

  pi.on("session_shutdown", (_event, ctx) => {
    stopBorderChase(false);
    stopProjectRefresh();
    cleanupUsageListener?.();
    cleanupUsageListener = undefined;
    requestFooterRender = undefined;
    getActiveExtensionStatuses = () => new Map();
    activeTui = undefined;
    hasPromptUi = false;
    workingMessage = undefined;
    usage.stop();

    if (!ctx.hasUI) return;
    ctx.ui.setWorkingMessage();
    ctx.ui.setWorkingIndicator();
    ctx.ui.setWorkingVisible(true);
  });

  pi.on("turn_start", () => {
    workingMessage = pickWorkingMessage();
    requestUiRender();
  });

  pi.on("agent_start", () => {
    startBorderChase();
  });

  pi.on("agent_end", () => {
    stopBorderChase();
  });

  pi.on("turn_end", () => {
    workingMessage = undefined;
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
