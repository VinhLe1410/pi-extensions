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
import { buildBorderLabels } from "./ui/border-labels";
import { RoundedInputEditor } from "./ui/editor";
import { renderExtensionStatusFooter } from "./ui/status-footer";

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

  let activeTui: TUI | undefined;
  let lastGitRefresh = 0;
  let cleanupUsageListener: (() => void) | undefined;

  function refreshGitIfStale(): void {
    const now = Date.now();
    if (now - lastGitRefresh < GIT_REFRESH_INTERVAL_MS) return;
    lastGitRefresh = now;
    git.refresh();
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
    git.refresh();
    lastGitRefresh = Date.now();
    if (!ctx.hasUI) return;

    startUsageForProvider(ctx.model?.provider);
    cleanupUsageListener?.();

    ctx.ui.setEditorComponent((tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => {
      cleanupUsageListener?.();
      activeTui = tui;
      cleanupUsageListener = usage.onChange(() => tui.requestRender());

      return new RoundedInputEditor(tui, theme, keybindings, () => {
        refreshGitIfStale();
        return buildBorderLabels(ctx, ctx.ui.theme, git.current(), usage);
      });
    });

    ctx.ui.setFooter((_tui: TUI, theme: Theme, footerData: ReadonlyFooterDataProvider) => ({
      invalidate() {},
      render(width: number): string[] {
        return renderExtensionStatusFooter(footerData, width, theme);
      },
    }));
  });

  pi.on("session_shutdown", () => {
    cleanupUsageListener?.();
    cleanupUsageListener = undefined;
    activeTui = undefined;
    usage.stop();
  });

  pi.on("turn_end", () => {
    if (git.refresh()) activeTui?.requestRender();
    lastGitRefresh = Date.now();
  });

  pi.on("model_select", (event) => {
    startUsageForProvider(event.model.provider);
    activeTui?.requestRender();
  });

  pi.on("thinking_level_select", () => {
    activeTui?.requestRender();
  });
}
