# pi-codex-search

Pi extension that adds a `codex_search` tool backed by the user's configured ChatGPT Codex subscription.

This package is maintained in this pnpm workspace. It was originally imported from `Leechael/pi-codex-search` at commit `f42ac40`; the upstream MIT license is kept in `LICENSE`.

## Usage

Load the package as a Pi extension/package from this workspace. The package manifest exposes:

```json
{
  "pi": {
    "extensions": ["./index.ts"]
  }
}
```

Inside Pi, sign in if needed:

```text
/login openai-codex
```

Then the model can call the default tool:

```text
codex_search
```

## Configuration

Interactive settings:

```text
/codex-search-settings
/codex-search-settings status
/codex-search-settings reset
```

Config is resolved from highest to lowest precedence:

1. Environment variables.
2. Project file: `<cwd>/.pi/pi-codex-search.json`.
3. Home file: `~/.pi/pi-codex-search.json`.

Supported config fields:

```json
{
  "enabled": true,
  "toolName": "codex_search",
  "model": "gpt-5-codex",
  "baseUrl": "https://chatgpt.com/backend-api",
  "clientVersion": "1.0.0",
  "searchContextSize": "medium",
  "freshness": "live"
}
```

Environment variable equivalents:

| Field | Env var |
| --- | --- |
| `enabled` | `PI_CODEX_WEB_SEARCH_ENABLED` |
| `toolName` | `PI_CODEX_WEB_SEARCH_TOOL_NAME` |
| `model` | `PI_CODEX_WEB_SEARCH_MODEL` |
| `baseUrl` | `PI_CODEX_WEB_SEARCH_BASE_URL` |
| `clientVersion` | `PI_CODEX_WEB_SEARCH_CLIENT_VERSION` |
| `searchContextSize` | `PI_CODEX_WEB_SEARCH_CONTEXT_SIZE` |
| `freshness` | `PI_CODEX_WEB_SEARCH_FRESHNESS` |

## Development

From the workspace root:

```bash
pnpm typecheck
```

No unit tests are carried for this package.
