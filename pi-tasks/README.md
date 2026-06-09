# pi-tasks

Pi extension for structured task tracking and coordination inside this extensions workspace.

## Features

- Task tools: `TaskCreate`, `TaskList`, `TaskGet`, `TaskUpdate`, `TaskOutput`, `TaskStop`, and `TaskExecute`.
- Persistent task widget above the editor.
- Session, project, or in-memory task storage.
- Dependency tracking with `blocks` and `blockedBy` relationships.
- Optional subagent execution through the local `pi-subagents` extension.
- Configurable task display, auto-clear, and auto-cascade behavior through `/tasks`.

## Usage

Load this package as a Pi extension from the workspace. The manifest exposes:

```json
{
  "pi": {
    "extensions": ["./index.ts"]
  }
}
```

Interactive command:

```text
/tasks
```

Task data is stored according to the `/tasks` settings menu. By default, session-scoped tasks are written under `.pi/tasks/` for the current working directory.

## Configuration

Settings are saved to `.pi/tasks-config.json` in the current working directory.

Environment variables:

| Variable | Value | Behavior |
| --- | --- | --- |
| `PI_TASKS` | `off` | Use in-memory storage only. |
| `PI_TASKS` | `name` | Use a named shared task list under the Pi tasks directory. |
| `PI_TASKS` | path | Use an explicit absolute or relative task file path. |
| `PI_TASKS_DEBUG` | `1` | Print task RPC and spawn debug output to stderr. |

## Development

From the workspace root:

```bash
pnpm typecheck
```

## License

MIT
