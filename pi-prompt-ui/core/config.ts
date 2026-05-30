export const USAGE_REFRESH_INTERVAL = 2 * 60_000; // 2 minutes
export const GIT_REFRESH_INTERVAL_MS = 1000;

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
