/**
 * Minimal Footer Extension
 *
 * Custom footer with model, effort, location, and inline subscription usage.
 * Auto-detects provider from current model and shows relevant usage percentages.
 *
 * Supports: Claude Max, Codex, Copilot, Gemini
 */

import {
  type ExtensionAPI,
  type ReadonlyFooterDataProvider,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { TUI } from "@earendil-works/pi-tui";
import {
  parseBooleanEnv,
  PROVIDER_MAP,
  SHOW_BRANCH_ENV_VAR,
  SHOW_CWD_ENV_VAR,
  USAGE_REFRESH_INTERVAL,
} from "./core/config";
import { createAuthResolver } from "./seams/auth";
import { buildFooterModel } from "./footer/footer-model";
import { createGitState } from "./seams/git";
import { createFetcherRegistry } from "./fetchers";
import { createUsageState } from "./seams/usage-state";
import { renderFooterLines } from "./footer/footer-line";

// ============ Provider Detection ============

const CODEX_FAST_STATE_EVENT = "codex-fast:state";

interface CodexFastState {
  enabled: boolean;
}

function isCodexFastState(value: unknown): value is CodexFastState {
  return (
    typeof value === "object" &&
    value !== null &&
    "enabled" in value &&
    typeof (value as { enabled: unknown }).enabled === "boolean"
  );
}

function detectProvider(modelProvider: string): string | null {
  return PROVIDER_MAP[modelProvider] || null;
}

// ============ Extension ============

export default function (pi: ExtensionAPI) {
  const showCwd = parseBooleanEnv(process.env[SHOW_CWD_ENV_VAR], true);
  const showBranch = parseBooleanEnv(process.env[SHOW_BRANCH_ENV_VAR], true);
  const auth = createAuthResolver();
  const git = createGitState();
  const fetcherRegistry = createFetcherRegistry(auth);
  const usage = createUsageState({
    registry: fetcherRegistry,
    intervalMs: USAGE_REFRESH_INTERVAL,
  });
  let codexFastMode = false;
  let activeTui: TUI | undefined;

  pi.events.on(CODEX_FAST_STATE_EVENT, (state) => {
    if (!isCodexFastState(state)) return;
    codexFastMode = state.enabled;
    activeTui?.requestRender();
  });

  function refreshGitFooter(): void {
    git.refresh();
  }

  function startUsageForModelProvider(modelProvider: string | undefined): void {
    if (!modelProvider) {
      usage.stop();
      return;
    }
    const provider = detectProvider(modelProvider);
    if (!provider) {
      usage.stop();
      return;
    }
    usage.start(provider);
  }

  pi.on("session_start", async (_event, ctx) => {
    git.refresh();
    if (!ctx.hasUI) return;

    // ── Footer ──
    ctx.ui.setFooter(
      (tui: TUI, theme: Theme, footerData: ReadonlyFooterDataProvider) => {
        const unsubBranch = footerData.onBranchChange(() => {
          refreshGitFooter();
          tui.requestRender();
        });
        const unsubUsage = usage.onChange(() => tui.requestRender());

        startUsageForModelProvider(ctx.model?.provider);

        activeTui = tui;

        return {
          dispose: () => {
            if (activeTui === tui) activeTui = undefined;
            unsubBranch();
            unsubUsage();
            usage.stop();
          },
          invalidate() {},
          render(width: number): string[] {
            const gitCache = git.current();
            const footerModel = buildFooterModel(ctx, gitCache, {
              showCwd,
              showBranch,
              fastMode: codexFastMode,
              cwd: process.cwd(),
              homeDir: process.env.HOME || process.env.USERPROFILE,
            });

            const lines: string[] = renderFooterLines(
              footerModel,
              width,
              theme,
              usage.current(),
            );

            // Extension statuses (full width, second line)
            const extensionStatuses = footerData.getExtensionStatuses();
            if (extensionStatuses.size > 0) {
              const statusLine = Array.from(extensionStatuses.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([, text]) =>
                  text
                    .replace(/[\r\n\t]/g, " ")
                    .replace(/ +/g, " ")
                    .trim(),
                )
                .join(" ");
              lines.push(
                truncateToWidth(statusLine, width, theme.fg("dim", "...")),
              );
            }

            return lines;
          },
        };
      },
    );
  });

  pi.on("turn_end", async () => {
    refreshGitFooter();
  });

  pi.on("model_select", (event, _ctx) => {
    startUsageForModelProvider(event.model?.provider);
  });
}
