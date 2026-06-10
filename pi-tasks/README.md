# pi-tasks

In-memory Pi task tracker for the current session.

## Features

- Task tools: `TaskCreate`, `TaskList`, `TaskGet`, and `TaskUpdate`.
- Task statuses: `pending`, `in_progress`, and `completed`.
- Dependency tracking with `blocks` and `blockedBy` relationships.
- Live task widget above the editor.
- System prompt guidance for using task tools on non-trivial multi-step work.
- Completed lists auto-clear after 5 turns.
- Interactive `/tasks` menu for viewing, creating, completing, deleting, and clearing tasks.

Tasks are not persisted. Starting a new Pi process starts with an empty task list.

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

## Dependency model

Dependencies are bidirectional:

- `addBlocks`: task IDs that cannot start until this task completes.
- `addBlockedBy`: task IDs that must complete before this task can start.

Deleting a task or clearing completed tasks also removes dependency edges that point to deleted tasks.

## Development

From the workspace root:

```bash
pnpm typecheck
```

## License

MIT
