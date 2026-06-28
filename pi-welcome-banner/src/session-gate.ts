import type { SessionEntry, SessionStartEvent } from "@earendil-works/pi-coding-agent";

export function shouldRenderForSession(reason: SessionStartEvent["reason"], entries: readonly SessionEntry[]): boolean {
  if (reason !== "startup" && reason !== "new") return false;
  return !entries.some(isConversationEntry);
}

export function isConversationEntry(entry: SessionEntry): boolean {
  return (
    entry.type === "message" ||
    entry.type === "custom_message" ||
    entry.type === "compaction" ||
    entry.type === "branch_summary"
  );
}
