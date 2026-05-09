/**
 * TPS Tracker Extension
 *
 * Tracks tokens per second during model generation and reports
 * final TPS statistics at the end of each agent run.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const TPS_STATE_EVENT = "tps-tracker:state";

interface TpsTrackerState {
  phase: "generating" | "done";
  tps: number | null;
  tokens: number;
  elapsedSeconds: number;
  estimated: boolean;
}

function emitTpsState(pi: ExtensionAPI, state: TpsTrackerState): void {
  pi.events.emit(TPS_STATE_EVENT, state);
}

export default function (pi: ExtensionAPI) {
  /** Timestamp when the current assistant message event started. Used as a fallback. */
  let messageStart: number | null = null;
  /** Timestamp of the first streamed output delta for the current assistant message. */
  let streamStart: number | null = null;
  /** Estimated streamed output tokens for live display before providers report final usage. */
  let estimatedStreamedTokens = 0;
  /** Cumulative official output tokens across all assistant messages in this agent run. */
  let totalOutputTokens = 0;
  /** Cumulative time (ms) spent actually streaming output deltas (excludes tool execution and first-token latency). */
  let totalStreamMs = 0;

  pi.on("agent_start", async () => {
    totalOutputTokens = 0;
    totalStreamMs = 0;
    messageStart = null;
    streamStart = null;
    estimatedStreamedTokens = 0;
    emitTpsState(pi, {
      phase: "generating",
      tps: null,
      tokens: 0,
      elapsedSeconds: 0,
      estimated: true,
    });
  });

  pi.on("message_start", async (event) => {
    if (event.message.role !== "assistant") return;
    messageStart = Date.now();
    streamStart = null;
    estimatedStreamedTokens = 0;
  });

  pi.on("message_update", async (event) => {
    if (event.message.role !== "assistant") return;

    const streamEvent = event.assistantMessageEvent;
    const isOutputDelta =
      streamEvent.type === "text_delta" ||
      streamEvent.type === "thinking_delta" ||
      streamEvent.type === "toolcall_delta";

    if (!isOutputDelta) return;

    const now = Date.now();
    streamStart ??= now;
    estimatedStreamedTokens += Math.max(0, streamEvent.delta.length / 4);

    const elapsed = (now - streamStart) / 1000;
    const officialTokens = event.message.usage.output;
    const currentTokens = officialTokens > 0 ? officialTokens : estimatedStreamedTokens;

    if (elapsed > 0 && currentTokens > 0) {
      const tps = Math.round(currentTokens / elapsed);
      emitTpsState(pi, {
        phase: "generating",
        tps,
        tokens: Math.round(currentTokens),
        elapsedSeconds: elapsed,
        estimated: officialTokens <= 0,
      });
    }
  });

  pi.on("message_end", async (event) => {
    if (event.message.role !== "assistant") return;

    const messageTokens = event.message.usage.output;
    const timingStart = streamStart ?? messageStart;
    if (!timingStart || messageTokens <= 0) {
      messageStart = null;
      streamStart = null;
      estimatedStreamedTokens = 0;
      return;
    }

    totalOutputTokens += messageTokens;
    totalStreamMs += Math.max(0, Date.now() - timingStart);

    messageStart = null;
    streamStart = null;
    estimatedStreamedTokens = 0;
  });

  pi.on("agent_end", async () => {
    const elapsed = totalStreamMs / 1000;
    const tps = totalOutputTokens > 0 && elapsed > 0 ? Math.round(totalOutputTokens / elapsed) : 0;

    emitTpsState(pi, {
      phase: "done",
      tps: tps > 0 ? tps : null,
      tokens: totalOutputTokens,
      elapsedSeconds: elapsed,
      estimated: false,
    });
  });
}
