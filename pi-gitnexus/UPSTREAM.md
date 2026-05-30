# pi-gitnexus upstream

Vendored from: <https://github.com/tintinweb/pi-gitnexus>

Pinned commit: `79c77223ae34ebfef44c13bf0c4bf0f2588c5741`

Upstream version: `0.6.3`

Local changes:

- Package is marked private and loaded as a local Pi package from this extensions monorepo.
- Runtime dependency on `cross-spawn` was removed; source imports use Node's built-in `node:child_process` `spawn` instead.
- Auto-augment is enabled by default via `~/.pi/pi-gitnexus.json`.
- The injected system-prompt hint reflects the current auto-augment setting.
- `/gitnexus analyze` runs `gitnexus analyze --index-only`, so it builds `.gitnexus/` without writing `AGENTS.md`, `CLAUDE.md`, or `.claude/skills/`.

License note:

- `pi-gitnexus` is MIT licensed.
- The separate `gitnexus` CLI is PolyForm Noncommercial; review that license before commercial use.
