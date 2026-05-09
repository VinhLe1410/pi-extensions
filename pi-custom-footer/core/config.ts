export const USAGE_REFRESH_INTERVAL = 5 * 60_000; // 5 minutes

export const SHOW_CWD_ENV_VAR = "PI_MINIMAL_FOOTER_SHOW_CWD";
export const SHOW_BRANCH_ENV_VAR = "PI_MINIMAL_FOOTER_SHOW_BRANCH";

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

export function parseBooleanEnv(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) return fallback;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;

  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}
