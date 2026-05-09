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

  const model = payload.model;
  if (typeof model === "string" && model.includes("codex")) return true;

  return (
    payload.stream === true &&
    typeof payload.instructions === "string" &&
    Array.isArray(payload.input) &&
    payload.tool_choice === "auto" &&
    "prompt_cache_key" in payload
  );
}

function isCodexModel(model: ExtensionContext["model"]): boolean {
  if (!model) return false;
  return model.provider === "openai-codex" || model.id.includes("codex");
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
  let currentModelIsCodex = false;

  function emitCurrentState(): void {
    emitState(pi, fastModeEnabled && currentModelIsCodex);
  }

  pi.registerCommand("fast-mode", {
    description: "Toggle priority service tier for OpenAI Codex models",
    handler: async (_args, ctx) => {
      currentModelIsCodex = isCodexModel(ctx.model);
      if (!currentModelIsCodex) {
        ctx.ui.notify("Fast mode only works with OpenAI Codex models", "warning");
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
      emitCurrentState();
      ctx.ui.notify(`Fast mode ${fastModeEnabled ? "enabled" : "disabled"}`, "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    try {
      fastModeEnabled = await loadFastModeEnabled();
    } catch (error) {
      ctx.ui.notify(`Failed to load fast mode setting: ${(error as Error).message}`, "warning");
    }

    currentModelIsCodex = isCodexModel(ctx.model);
    emitCurrentState();
  });

  pi.on("model_select", (event) => {
    currentModelIsCodex = isCodexModel(event.model);
    emitCurrentState();
  });

  pi.on("before_provider_request", (event) => {
    if (!fastModeEnabled) return;
    if (!isOpenAICodexResponsesPayload(event.payload)) return;

    return {
      ...event.payload,
      service_tier: SERVICE_TIER,
    };
  });
}
