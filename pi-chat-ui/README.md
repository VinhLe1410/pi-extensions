# pi-chat-ui

`pi-chat-ui` is a Pi extension that wraps Pi chat-history blocks in colored terminal frames.

It preserves Pi's existing renderers by patching their `render(width)` methods, calling the original renderer at a reduced width, then post-processing the returned terminal lines into framed output.

## What it does

- Adds ASCII/Unicode borders around user messages, skill invocations, custom messages, user bash executions, compaction summaries, branch summaries, and tool executions.
- Uses different border colors for pending, successful, and failed tool executions.
- Leaves tool call headers and command output in Pi's original rendered shape inside the outer frame.
- Moves expand/collapse hints into the bottom-right border.
- Preserves pending tool placeholders such as `executing...`, `reading...`, and `editing...`.
- Keeps terminal image escape output outside the frame so image rendering is not broken.
- User bash executions keep Pi's built-in bash border; this extension adds an outer chat frame around that block.

## Runtime flow

1. `index.ts` receives the Pi extension API.
2. `core/patch.ts` patches selected Pi chat-history component render methods.
3. The original component renderer is called with `width - 2` to leave space for frame borders.
4. `core/render-cache.ts` reuses previously framed rows when the same component renders the same content at the same width.
5. Tool-specific metadata is read through `core/tool-adapter.ts` on cache misses.
6. `ui/frame.ts` normalizes raw rendered lines into `FrameContent`, applies semantic transformations, and draws borders.
7. `ui/theme.ts`, `ui/ansi.ts`, `ui/hints.ts`, and `ui/terminal-images.ts` provide narrow helper APIs for rendering details.

## File guide

### Root

- `index.ts`
  - Extension entry point.
  - Patches Pi chat-history component prototypes when the extension loads.
  - Stores the active Pi theme on `session_start`.
  - Restores original render methods on `session_shutdown`.

- `package.json`
  - Package metadata for the local Pi extension.

### `core/`

- `core/patch.ts`
  - Orchestrates render patching for each frame kind.
  - Calls the original renderer, checks the frame cache, asks the tool adapter for frame options on cache misses, then delegates to `renderFrame()`.
  - Should stay free of private Pi tool-component field reads.

- `core/render-cache.ts`
  - Owns bounded cached framed rows for repeated same-width renders.
  - Uses `WeakMap<Component, CacheEntry>` so entries can be garbage-collected with component instances.
  - Keys cached rows by width, frame kind, tool state, exact original rendered rows, and bash command/timeout when relevant.
  - Bypasses unsafe or oversized rows such as terminal image output and large rendered content.

- `core/patch-manager.ts`
  - Owns prototype patch/unpatch lifecycle mechanics.
  - Stores the original `render()` method using symbols.
  - Ensures a prototype is unpatched before being patched again.

- `core/tool-adapter.ts`
  - The only module that should inspect Pi's private `ToolExecutionComponent` shape.
  - Determines tool state, the internal pending-line boundary, and pending-line text.

- `core/state.ts`
  - Stores extension-level runtime state on `globalThis`.
  - Currently tracks the active Pi theme.

- `core/symbols.ts`
  - Defines global symbols used for patch state, original render methods, and global extension state.
  - Symbol keys are intentionally namespaced as `pi-chat-ui.*`.

- `core/types.ts`
  - Shared core types such as `FrameKind`, `ToolState`, extension state, and patched renderable components.

### `ui/`

- `ui/frame.ts`
  - Main frame renderer.
  - Keeps the public `renderFrame(lines, width, kind, toolState, options)` API.
  - Converts raw renderer output into semantic `FrameContent`, applies pending-line transformations, and draws borders.
  - Border drawing belongs here.

- `ui/frame-model.ts`
  - Defines the semantic intermediate model used by frame rendering.
  - Add fields only when they represent current renderer behavior.

- `ui/ansi.ts`
  - ANSI and OSC string helpers.
  - Owns OSC 133 marker stripping, SGR stripping, and trailing-ANSI insertion.
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
- Keep frame cache keying and size limits in `core/render-cache.ts`.
- Keep private Pi component introspection in `core/tool-adapter.ts`.
- Keep border drawing in `ui/frame.ts`.
- New non-tool components should normally behave like user frames; only `tool` should use tool-specific pending-line, hint, and terminal-image behavior.
- Keep ANSI/OSC manipulation in `ui/ansi.ts`.
- Keep terminal image handling in `ui/terminal-images.ts`.
- Keep hint extraction in `ui/hints.ts`.
- Keep direct active-theme reads in `ui/theme.ts` only.
- Avoid broad abstractions until there is repeated behavior that needs them.
- Do not add compatibility shims for old symbol names unless a concrete reload issue is observed.

## Validation

After code changes, run:

```sh
pnpm --filter pi-chat-ui exec tsc --noEmit --pretty false
```

For rendering-sensitive changes, also run:

```sh
pnpm test
```

For rendering-sensitive changes, also reload Pi and manually check:

- user message frame rendering
- skill invocation frame rendering
- custom message, user bash, compaction summary, and branch summary frame rendering
- tool call headers keep their original rendered shape
- pending tool placeholder text
- success and error tool border colors
- expand/collapse hint in the bottom-right border
- image read output rendered outside the frame
