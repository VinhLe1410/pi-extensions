import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const SERVICE_TIER = "priority";
const STATE_EVENT = "codex-fast:state";
const SETTINGS_KEY = "codexFastMode";

interface CodexFastState {
  enabled: boolean;
  serviceTier: typeof SERVICE_TIER;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOpenAICodexResponsesPayload(
  payload: unknown,
): payload is Record<string, unknown> {
  if (!isRecord(payload)) return false;

  return (
    payload.stream === true &&
    typeof payload.instructions === "string" &&
    Array.isArray(payload.input) &&
    payload.tool_choice === "auto" &&
    "prompt_cache_key" in payload
  );
}

function isOpenAICodexModel(model: ExtensionContext["model"]): boolean {
  return model?.provider === "openai-codex";
}

function emitState(pi: ExtensionAPI, enabled: boolean): void {
  pi.events.emit(STATE_EVENT, {
    enabled,
    serviceTier: SERVICE_TIER,
  } satisfies CodexFastState);
}

function settingsPath(): string {
  return join(homedir(), ".pi", "agent", "settings.json");
}

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(settingsPath(), "utf8");
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

function readFastModeEnabled(settings: Record<string, unknown>): boolean {
  const fastModeSettings = settings[SETTINGS_KEY];
  return isRecord(fastModeSettings) && fastModeSettings.enabled === true;
}

async function loadFastModeEnabled(): Promise<boolean> {
  return readFastModeEnabled(await readSettings());
}

async function saveFastModeEnabled(enabled: boolean): Promise<void> {
  const path = settingsPath();
  const settings = await readSettings();
  const current = settings[SETTINGS_KEY];

  settings[SETTINGS_KEY] = {
    ...(isRecord(current) ? current : {}),
    enabled,
  };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

export default function (pi: ExtensionAPI) {
  let fastModeEnabled = false;
  let currentModelIsOpenAICodex = false;
  let settingsWatcher: FSWatcher | undefined;
  let settingsRefreshTimer: NodeJS.Timeout | undefined;

  function emitCurrentState(): void {
    emitState(pi, fastModeEnabled && currentModelIsOpenAICodex);
  }

  async function syncFastModeEnabled(
    ctx?: ExtensionContext,
    severity: "warning" | "error" = "warning",
  ): Promise<boolean> {
    try {
      fastModeEnabled = await loadFastModeEnabled();
      return true;
    } catch (error) {
      fastModeEnabled = false;
      if (ctx?.hasUI) {
        ctx.ui.notify(
          `Failed to load fast mode setting: ${(error as Error).message}`,
          severity,
        );
      }
      return false;
    }
  }

  function scheduleSettingsRefresh(): void {
    if (settingsRefreshTimer) clearTimeout(settingsRefreshTimer);
    settingsRefreshTimer = setTimeout(() => {
      settingsRefreshTimer = undefined;
      void syncFastModeEnabled().then(() => emitCurrentState());
    }, 50);
  }

  function startSettingsWatcher(): void {
    if (settingsWatcher) return;
    try {
      settingsWatcher = watch(settingsPath(), { persistent: false }, () => {
        scheduleSettingsRefresh();
      });
    } catch {
      settingsWatcher = undefined;
    }
  }

  function stopSettingsWatcher(): void {
    settingsWatcher?.close();
    settingsWatcher = undefined;
    if (settingsRefreshTimer) clearTimeout(settingsRefreshTimer);
    settingsRefreshTimer = undefined;
  }

  pi.registerCommand("fast-mode", {
    description: "Toggle priority service tier for OpenAI Codex models",
    handler: async (_args, ctx) => {
      const synced = await syncFastModeEnabled(ctx, "error");
      currentModelIsOpenAICodex = isOpenAICodexModel(ctx.model);
      if (!currentModelIsOpenAICodex) {
        ctx.ui.notify("Fast mode only works with OpenAI Codex models", "warning");
        emitCurrentState();
        return;
      }
      if (!synced) {
        emitCurrentState();
        return;
      }

      const nextFastModeEnabled = !fastModeEnabled;
      try {
        await saveFastModeEnabled(nextFastModeEnabled);
      } catch (error) {
        ctx.ui.notify(`Failed to save fast mode setting: ${(error as Error).message}`, "error");
        return;
      }

      fastModeEnabled = nextFastModeEnabled;
      startSettingsWatcher();
      emitCurrentState();
      ctx.ui.notify(`Fast mode ${fastModeEnabled ? "enabled" : "disabled"}`, "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    await syncFastModeEnabled(ctx);
    currentModelIsOpenAICodex = isOpenAICodexModel(ctx.model);
    startSettingsWatcher();
    emitCurrentState();
  });

  pi.on("session_shutdown", () => {
    stopSettingsWatcher();
  });

  pi.on("model_select", async (event, ctx) => {
    await syncFastModeEnabled(ctx);
    currentModelIsOpenAICodex = isOpenAICodexModel(event.model);
    emitCurrentState();
  });

  pi.on("before_provider_request", async (event, ctx) => {
    currentModelIsOpenAICodex = isOpenAICodexModel(ctx.model);
    if (!currentModelIsOpenAICodex) {
      emitCurrentState();
      return;
    }

    await syncFastModeEnabled(ctx);
    emitCurrentState();
    if (!fastModeEnabled) return;
    if (!isOpenAICodexResponsesPayload(event.payload)) return;

    return {
      ...event.payload,
      service_tier: SERVICE_TIER,
    };
  });
}
