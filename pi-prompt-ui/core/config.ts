import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const USAGE_REFRESH_INTERVAL = 2 * 60_000; // 2 minutes
export const PROJECT_REFRESH_INTERVAL_MS = 30_000;

// Map pi provider names to our internal usage provider keys.
export const PROVIDER_MAP: Record<string, string> = {
  anthropic: "claude", // Claude Max subscription
  "openai-codex": "codex", // Codex subscription
  "github-copilot": "copilot", // Copilot subscription
  "google-gemini-cli": "gemini", // Gemini CLI subscription
  minimax: "minimax", // MiniMax Token Plan / Coding Plan
  "minimax-cn": "minimax-cn", // MiniMax China plan
  "kimi-coding": "kimi-coding", // Kimi plan
};

export type ExtensionStatusPlacement = "off" | "left" | "middle" | "right";

export type ExtensionStatusesConfig = {
  defaultPlacement: ExtensionStatusPlacement;
  placements: Record<string, ExtensionStatusPlacement>;
};

export type PromptUiConfig = {
  projectRefreshIntervalMs: number;
  extensionStatuses: ExtensionStatusesConfig;
};

type ConfigRecord = Record<string, unknown>;

const MIN_PROJECT_REFRESH_INTERVAL_MS = 5_000;

export const configPath = join(getAgentDir(), "prompt-ui.json");

export const defaultConfig: PromptUiConfig = {
  projectRefreshIntervalMs: PROJECT_REFRESH_INTERVAL_MS,
  extensionStatuses: {
    defaultPlacement: "right",
    placements: {},
  },
};

function isRecord(value: unknown): value is ConfigRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readConfigRecord(path = configPath): ConfigRecord {
  try {
    if (!existsSync(path)) return {};
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseProjectRefreshIntervalMs(value: unknown): number {
  if (value === 0) return 0;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultConfig.projectRefreshIntervalMs;
  }

  const interval = Math.round(value);
  return interval >= MIN_PROJECT_REFRESH_INTERVAL_MS
    ? interval
    : defaultConfig.projectRefreshIntervalMs;
}

export function isExtensionStatusPlacement(
  value: unknown,
): value is ExtensionStatusPlacement {
  return value === "off" || value === "left" || value === "middle" || value === "right";
}

function normalizeExtensionStatuses(record: Record<string, unknown>): ExtensionStatusesConfig {
  const defaultPlacement = isExtensionStatusPlacement(record.defaultPlacement)
    ? record.defaultPlacement
    : defaultConfig.extensionStatuses.defaultPlacement;
  const placements = isRecord(record.placements)
    ? Object.fromEntries(
        Object.entries(record.placements).filter(
          (entry): entry is [string, ExtensionStatusPlacement] =>
            isExtensionStatusPlacement(entry[1]),
        ),
      )
    : {};

  return {
    defaultPlacement,
    placements,
  };
}

export function mergeConfig(parsed: unknown): PromptUiConfig {
  const config = isRecord(parsed) ? parsed : {};
  const extensionStatuses = isRecord(config.extensionStatuses)
    ? normalizeExtensionStatuses(config.extensionStatuses as Record<string, unknown>)
    : defaultConfig.extensionStatuses;

  return {
    projectRefreshIntervalMs: parseProjectRefreshIntervalMs(config.projectRefreshIntervalMs),
    extensionStatuses: {
      defaultPlacement: extensionStatuses.defaultPlacement,
      placements: { ...extensionStatuses.placements },
    },
  };
}

export function loadConfig(): PromptUiConfig {
  try {
    if (!existsSync(configPath)) return mergeConfig({});
    return mergeConfig(JSON.parse(readFileSync(configPath, "utf8")));
  } catch {
    return mergeConfig({});
  }
}

export function getExtensionStatusPlacement(
  config: PromptUiConfig,
  key: string,
): ExtensionStatusPlacement {
  return config.extensionStatuses.placements[key] ?? config.extensionStatuses.defaultPlacement;
}

export function saveExtensionStatusPlacement(
  key: string,
  placement: ExtensionStatusPlacement,
  path = configPath,
): PromptUiConfig {
  const record = readConfigRecord(path);
  const existingExtensionStatuses = isRecord(record.extensionStatuses)
    ? { ...(record.extensionStatuses as Record<string, unknown>) }
    : {};
  const existingPlacements = isRecord(existingExtensionStatuses.placements)
    ? { ...(existingExtensionStatuses.placements as Record<string, unknown>) }
    : {};

  Object.defineProperty(existingPlacements, key, {
    value: placement,
    enumerable: true,
    configurable: true,
    writable: true,
  });

  record.extensionStatuses = {
    ...existingExtensionStatuses,
    placements: existingPlacements,
  };
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return mergeConfig(record);
}
