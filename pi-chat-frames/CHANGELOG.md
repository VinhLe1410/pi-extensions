# Changelog

## 17/05/2026

### Optimized

- Added a bounded frame render cache to reduce lag in long chat sessions with repeated same-width rerenders.
- Cache entries are stored per live component with `WeakMap`, so cached rows can be garbage-collected with the component.
- Cache keys include terminal width, frame kind, tool state, exact original rendered rows, and bash command/timeout when relevant.
- Bypasses caching for unsafe or oversized cases, including terminal image rows and oversized source/output rows.
- Reduced observed typing-session frame overhead from about `0.53ms` to about `0.01ms` per recent render in the representative debug session.
- Reduced observed tool frame overhead from about `0.59ms` to about `0.01ms` after narrowing the tool cache key.

### Added

- Added debug metrics for same-width repeat renders, cache hits, and cache bypass reasons behind `PI_CHAT_FRAMES_DEBUG=1`.
- Added focused cache safety tests for cache hits, width/content misses, pending-tool bypasses, terminal image bypasses, oversized output bypasses, and bash command key normalization.

### Notes

- No package version was bumped because `extensions/pi-chat-frames/package.json` does not define a `version` field.
- A separate visual polish issue remains possible: active bash tool preparation/streaming can briefly flicker background ANSI before normal output settles. This is not treated as cache staleness because completed output remains correct and pending tools are cache-bypassed.
