import type { Insight, PeriodInsights, PeriodRawData, RawMessage } from "./types";
import { formatThresholdTokens } from "./formatting";

const PARALLEL_WINDOW_MS = 2 * 60_000; // exact ±N milliseconds around each message
const PARALLEL_SESSION_THRESHOLD = 4;
const LARGE_CONTEXT_THRESHOLD = 150_000;
const LARGE_CACHE_MISS_THRESHOLD = 100_000;
export const LONG_SESSION_MS = 8 * 60 * 60 * 1000;
const TOP_SESSION_COUNT = 5;
const MIN_MESSAGES_FOR_PARALLEL_INSIGHT = 10;
const MIN_PERCENT_TO_SHOW = 1;

/**
 * Insights are weighted by recorded API cost. Periods with zero total cost produce
 * an empty `insights` list — the UI renders a distinct empty-state for that case.
 * Long-running-session classification is passed in from a global pass so that a
 * session's real lifetime is used rather than the slice visible inside this period.
 */
export function computeInsights(
  raw: PeriodRawData,
  longSessionIds: Set<string>,
): PeriodInsights {
  if (raw.messages.length === 0) {
    return { insights: [] };
  }

  const total = raw.messages.reduce((sum, m) => sum + m.cost, 0);
  if (total <= 0) {
    return { insights: [] };
  }

  const candidates: Insight[] = [];

  // 1. Parallel sessions — ≥ N unique sessions active within an exact ±W ms window.
  const parallelWeight = computeParallelCostWeight(raw.messages);
  if (parallelWeight !== null) {
    candidates.push({
      percent: (parallelWeight / total) * 100,
      headline: `of your cost was while ${PARALLEL_SESSION_THRESHOLD}+ sessions ran in parallel`,
      advice:
        "All sessions share one rate limit. If you don't need them all at once, queueing uses capacity more evenly.",
    });
  }

  // 2. Large context — input + cacheRead + cacheWrite > threshold.
  const largeContextWeight = raw.messages
    .filter(
      (m) => m.input + m.cacheRead + m.cacheWrite > LARGE_CONTEXT_THRESHOLD,
    )
    .reduce((sum, m) => sum + m.cost, 0);
  candidates.push({
    percent: (largeContextWeight / total) * 100,
    headline: `of your cost was at >${formatThresholdTokens(LARGE_CONTEXT_THRESHOLD)} context`,
    advice:
      "Longer sessions are more expensive even when cached. /compact mid-task, /clear when switching to new tasks.",
  });

  // 3. Large uncached prompt — fresh (non-cached) input > threshold, per the v0.2.0 formula.
  const uncachedWeight = raw.messages
    .filter((m) => m.input + m.cacheWrite > LARGE_CACHE_MISS_THRESHOLD)
    .reduce((sum, m) => sum + m.cost, 0);
  candidates.push({
    percent: (uncachedWeight / total) * 100,
    headline: `of your cost came from >${formatThresholdTokens(LARGE_CACHE_MISS_THRESHOLD)}-token uncached prompts`,
    advice:
      "Uncached input is expensive, and often happens when sending a message to a session that has gone idle. /compact before stepping away keeps the cold-start small.",
  });

  // 4. Long-running sessions — classification comes from the global pass so we use
  //    true session lifetime, not just the span visible inside this period slice.
  const longWeight = raw.messages
    .filter((m) => longSessionIds.has(m.sessionId))
    .reduce((sum, m) => sum + m.cost, 0);
  if (longWeight > 0) {
    candidates.push({
      percent: (longWeight / total) * 100,
      headline: `of your cost came from sessions active for ${LONG_SESSION_MS / 3_600_000}+ hours`,
      advice:
        "These are often background/loop sessions. Continuous usage can add up quickly so make sure it is intentional.",
    });
  }

  // 5. Top-N session concentration.
  if (raw.sessionCosts.size > TOP_SESSION_COUNT) {
    const sortedSessions = Array.from(raw.sessionCosts.values()).sort(
      (a, b) => b - a,
    );
    const topN = Math.min(TOP_SESSION_COUNT, sortedSessions.length);
    const topWeight = sortedSessions
      .slice(0, topN)
      .reduce((sum, c) => sum + c, 0);
    candidates.push({
      percent: (topWeight / total) * 100,
      headline: `of your cost came from your top ${topN} session${topN === 1 ? "" : "s"}`,
      advice:
        "A small number of sessions drives most of your spend. The table view can help pinpoint which ones.",
    });
  }

  const insights = candidates
    .filter((i) => i.percent >= MIN_PERCENT_TO_SHOW)
    .sort((a, b) => b.percent - a.percent);
  return { insights };
}

/**
 * Two-pointer sweep of messages sorted by timestamp. For each message, count the
 * number of distinct session IDs whose messages fall within an exact ± window.
 * Returns the total cost attributable to moments when ≥ threshold sessions were
 * active, or null if the period has too few sessions/messages to call it.
 *
 * Messages with missing/invalid timestamps (parsed as 0) are filtered out first —
 * otherwise they would collapse into a single synthetic instant and inflate the
 * parallel count on older or incomplete logs.
 */
export function computeParallelCostWeight(messages: RawMessage[]): number | null {
  const timed = messages.filter((m) => m.timestamp > 0);
  if (timed.length < MIN_MESSAGES_FOR_PARALLEL_INSIGHT) return null;
  const distinctSessions = new Set(timed.map((m) => m.sessionId));
  if (distinctSessions.size < PARALLEL_SESSION_THRESHOLD) return null;

  const sorted = timed.slice().sort((a, b) => a.timestamp - b.timestamp);
  const sidCount = new Map<string, number>();
  let uniqueCount = 0;
  let left = 0;
  let right = 0;
  let parallelCost = 0;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]!;
    const high = current.timestamp + PARALLEL_WINDOW_MS;
    const low = current.timestamp - PARALLEL_WINDOW_MS;

    while (right < sorted.length && sorted[right]!.timestamp <= high) {
      const sid = sorted[right]!.sessionId;
      const next = (sidCount.get(sid) ?? 0) + 1;
      sidCount.set(sid, next);
      if (next === 1) uniqueCount++;
      right++;
    }
    while (left < right && sorted[left]!.timestamp < low) {
      const sid = sorted[left]!.sessionId;
      const next = (sidCount.get(sid) ?? 0) - 1;
      if (next === 0) {
        sidCount.delete(sid);
        uniqueCount--;
      } else {
        sidCount.set(sid, next);
      }
      left++;
    }

    if (uniqueCount >= PARALLEL_SESSION_THRESHOLD) parallelCost += current.cost;
  }

  return parallelCost;
}
