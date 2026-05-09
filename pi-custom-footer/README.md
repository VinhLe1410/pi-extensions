# pi-custom-footer

A Pi extension that replaces the default footer with a compact three-row footer for model, context, usage, workspace, branch, and extension statuses.

## Project structure

```text
pi-custom-footer/
├── index.ts                # Extension entry point; registers the footer, usage widget, and Pi event handlers.
├── package.json            # Package metadata and Pi-related development dependencies.
├── bun.lock                # Bun dependency lockfile.
├── core/                   # Shared configuration, formatting, networking, and type definitions.
│   ├── config.ts           # Provider mapping, refresh interval, and footer visibility environment flags.
│   ├── format.ts           # Percentage, reset-time, and usage-window label formatting helpers.
│   ├── network.ts          # Fetch wrapper with timeout support.
│   └── types.ts            # Shared usage, git, and auth types.
├── fetchers/               # Provider-specific subscription/quota usage fetchers.
│   ├── index.ts            # Builds the provider fetcher registry.
│   ├── claude.ts           # Claude Max usage fetcher.
│   ├── codex.ts            # Codex usage fetcher.
│   ├── copilot.ts          # GitHub Copilot usage fetcher.
│   ├── gemini.ts           # Gemini CLI usage fetcher.
│   ├── kimi.ts             # Kimi Coding usage fetcher.
│   └── minimax.ts          # MiniMax and MiniMax CN usage fetcher.
├── footer/                 # Footer model/rendering code.
│   ├── footer-line.ts      # Renders the three-row footer layout.
│   └── footer-model.ts     # Builds footer display data from Pi session, git, cwd, and model state.
└── seams/                  # External integration seams.
    ├── auth.ts             # Resolves provider auth tokens from Pi auth, environment, keychain, or CLI auth files.
    ├── git.ts              # Reads and caches git branch/dirty/ahead/behind state.
    └── usage-state.ts      # Manages active provider usage fetching, caching, refresh timer, and listeners.
```

## What it does

- Shows the selected model, thinking level, inline subscription/quota usage, and right-pinned context-token usage on the first footer line.
- Shows the current working directory and git branch on the second footer line.
- Displays extension status messages on a third footer line when present.
- Auto-detects the active provider from the selected Pi model and fetches matching subscription/quota usage percentages.
- Supports Claude, Codex, GitHub Copilot, Gemini, MiniMax, MiniMax CN, and Kimi Coding usage sources.

## Configuration

- `PI_MINIMAL_FOOTER_SHOW_CWD`: set to `0`, `false`, `no`, or `off` to hide the current working directory.
- `PI_MINIMAL_FOOTER_SHOW_BRANCH`: set to `0`, `false`, `no`, or `off` to hide git branch information.
