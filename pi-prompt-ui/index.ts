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
import { readRuntimeInfo, type RuntimeInfo } from "./seams/runtime";
import { createUsageState } from "./seams/usage-state";
import { PolishedInputEditor } from "./ui/editor";
import { buildEditorMeta, getThinkingLevel } from "./ui/editor-meta";
import { registerPromptUiSettingsCommand } from "./ui/settings-command";
import { renderStatusFooter } from "./ui/status-footer";

function detectProvider(modelProvider: string | undefined): string | null {
  return modelProvider ? PROVIDER_MAP[modelProvider] || null : null;
}

function sameRuntime(a: RuntimeInfo | undefined, b: RuntimeInfo | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.name === b.name &&
    a.symbol === b.symbol &&
    a.style === b.style &&
    a.version === b.version
  );
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
  let runtime: RuntimeInfo | undefined;
  let requestFooterRender: (() => void) | undefined;
  let getActiveExtensionStatuses: () => ReadonlyMap<string, string> = () => new Map();
  let cleanupUsageListener: (() => void) | undefined;

  function scheduleProjectRefresh(cwd = activeCwd): void {
    if (!cwd) return;
    if (projectRefreshInFlight) {
      projectRefreshPending = true;
      return;
    }

    projectRefreshInFlight = true;
    Promise.all([git.refresh(cwd), readRuntimeInfo(cwd)])
      .then(([gitChanged, nextRuntime]) => {
        const runtimeChanged = !sameRuntime(runtime, nextRuntime);
        runtime = nextRuntime;
        if (gitChanged || runtimeChanged) activeTui?.requestRender();
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
    runtime = undefined;
  }

  function startUsageForProvider(modelProvider: string | undefined): void {
    const provider = detectProvider(modelProvider);
    if (provider) {
      usage.start(provider);
    } else {
      usage.stop();
    }
  }

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
    if (!ctx.hasUI) return;

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
            meta: buildEditorMeta(ctx, ctx.ui.theme, usage, thinkingLevel),
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
            git.current(),
            runtime,
            currentConfig,
            width,
            theme,
          );
        },
      };
    });
  });

  pi.on("session_shutdown", () => {
    stopProjectRefresh();
    cleanupUsageListener?.();
    cleanupUsageListener = undefined;
    requestFooterRender = undefined;
    getActiveExtensionStatuses = () => new Map();
    activeTui = undefined;
    usage.stop();
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
