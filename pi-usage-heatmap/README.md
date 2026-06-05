# pi-usage-heatmap

Pi extension that adds `/usage`, an interactive current-year heatmap of assistant output token usage.

## What it shows

`/usage` opens a non-overlay TUI view with a GitHub-style heatmap for the current year.

- Counts assistant output tokens only: `message.usage.output`
- Includes all Pi session files under the global sessions directory, including subagent sessions
- Groups usage by local calendar day
- Deduplicates copied fork/clone history using stable assistant-message metadata
- Uses the current theme accent color for the heatmap gradient

## Controls

- `r` refreshes the scan while the view is open
- `Esc` closes the view

## Layout

- Weeks are Monday-first
- Rows are weekdays, with labels for `Mon`, `Wed`, and `Fri`
- Month labels use three-letter names (`Jan`, `Feb`, etc.)
- Month boundaries are separated by a small gap when a weekday timeline crosses into a new month
- Each day renders as a two-character cell (`■■`)
- Terminals below the required width show a minimum-width message

## Install / enable

This package is intended to live in the global Pi extensions workspace:

```txt
~/.pi/agent/extensions/pi-usage-heatmap/
```

Enable it from `~/.pi/agent/settings.json`:

```json
{
  "extensions": [
    "+extensions/pi-usage-heatmap/index.ts"
  ]
}
```

If using the workspace in this repo, install dependencies from the workspace root:

```sh
pnpm install
```

Then reload Pi extensions with `/reload` and run:

```txt
/usage
```

## Dependency

- `date-fns`
