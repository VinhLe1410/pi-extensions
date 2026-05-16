# pi-chat-frames

`pi-chat-frames` is a Pi extension that wraps user messages, skill invocations, and tool executions in colored terminal frames.

It preserves Pi's existing renderers by patching their `render(width)` methods, calling the original renderer at a reduced width, then post-processing the returned terminal lines into framed output.

## What it does

- Adds ASCII/Unicode borders around user messages, skill invocations, and tool executions.
- Uses different border colors for pending, successful, and failed tool executions.
- Collapses tool call headers, especially bash commands, into one physical terminal line.
- Inserts a command/output separator for tool calls.
- Moves expand/collapse hints into the bottom-right border.
- Preserves pending tool placeholders such as `executing...`, `reading...`, and `editing...`.
- Keeps terminal image escape output outside the frame so image rendering is not broken.

## Runtime flow

1. `index.ts` receives the Pi extension API.
2. `core/patch.ts` patches Pi's `UserMessageComponent`, `SkillInvocationMessageComponent`, and `ToolExecutionComponent` render methods.
3. The original component renderer is called with `width - 2` to leave space for frame borders.
4. Tool-specific metadata is read through `core/tool-adapter.ts`.
5. `ui/frame.ts` normalizes raw rendered lines into `FrameContent`, applies semantic transformations, and draws borders.
6. `ui/theme.ts`, `ui/ansi.ts`, `ui/hints.ts`, and `ui/terminal-images.ts` provide narrow helper APIs for rendering details.

## File guide

### Root

- `index.ts`
  - Extension entry point.
  - Patches Pi user-message, skill-invocation, and tool-execution component prototypes when the extension loads.
  - Stores the active Pi theme on `session_start`.
  - Restores original render methods on `session_shutdown`.

- `package.json`
  - Package metadata for the local Pi extension.

### `core/`

- `core/patch.ts`
  - Orchestrates render patching for each frame kind: `user`, `skill`, or `tool`.
  - Calls the original renderer, asks the tool adapter for frame options when needed, then delegates to `renderFrame()`.
  - Should stay free of private Pi tool-component field reads.

- `core/patch-manager.ts`
  - Owns prototype patch/unpatch lifecycle mechanics.
  - Stores the original `render()` method using symbols.
  - Ensures a prototype is unpatched before being patched again.

- `core/tool-adapter.ts`
  - The only module that should inspect Pi's private `ToolExecutionComponent` shape.
  - Determines tool state, header replacement, separator placement, and pending-line text.
  - Keeps bash-specific header formatting here instead of in frame rendering.

- `core/state.ts`
  - Stores extension-level runtime state on `globalThis`.
  - Currently tracks the active Pi theme.

- `core/symbols.ts`
  - Defines global symbols used for patch state, original render methods, and global extension state.
  - Symbol keys are intentionally namespaced as `pi-chat-frames.*`.

- `core/types.ts`
  - Shared core types such as `FrameKind`, `ToolState`, extension state, and patched renderable components.

### `ui/`

- `ui/frame.ts`
  - Main frame renderer.
  - Keeps the public `renderFrame(lines, width, kind, toolState, options)` API.
  - Converts raw renderer output into semantic `FrameContent`, applies header/pending/separator transformations, and draws borders.
  - Border drawing belongs here.

- `ui/frame-model.ts`
  - Defines the semantic intermediate model used by frame rendering.
  - Add fields only when they represent current renderer behavior.

- `ui/ansi.ts`
  - ANSI and OSC string helpers.
  - Owns OSC 133 marker stripping, SGR stripping, background stripping, trailing-ANSI insertion, and background-preserving line construction.
  - Do not turn this into a general ANSI parser unless behavior requires it.

- `ui/hints.ts`
  - Extracts Pi expand/collapse hints from tool output.
  - Keeps `keyText("app.tools.expand")` and related regex logic isolated from frame rendering.

- `ui/terminal-images.ts`
  - Detects terminal image escape lines for Kitty and iTerm protocols.
  - Splits image rows from text rows and keeps placeholder rows with the image.
  - Indents terminal image rows before they are appended outside the frame.

- `ui/theme.ts`
  - The color API for frame rendering.
  - Wraps Pi theme access behind `frameColor()`, `labelColor()`, and `dimColor()`.
  - Provides fallback ANSI colors when no active theme is available.

## Maintenance rules

- Preserve rendering behavior unless a change is explicitly intentional.
- Keep prototype patching mechanics in `core/patch-manager.ts`.
- Keep private Pi component introspection in `core/tool-adapter.ts`.
- Keep border drawing in `ui/frame.ts`.
- Keep ANSI/OSC manipulation in `ui/ansi.ts`.
- Keep terminal image handling in `ui/terminal-images.ts`.
- Keep hint extraction in `ui/hints.ts`.
- Keep direct active-theme reads in `ui/theme.ts` only.
- Avoid broad abstractions until there is repeated behavior that needs them.
- Do not add compatibility shims for old symbol names unless a concrete reload issue is observed.

## Validation

After code changes, run:

```sh
pnpm --filter pi-chat-frames exec tsc --noEmit --pretty false
```

For rendering-sensitive changes, also reload Pi and manually check:

- user message frame rendering
- skill invocation frame rendering
- bash command header on one physical terminal line
- command/output separator placement
- pending tool placeholder text
- success and error tool border colors
- expand/collapse hint in the bottom-right border
- image read output rendered outside the frame
