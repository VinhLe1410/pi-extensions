import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { TAB_ORDER } from "./constants";
import { computeInsights, LONG_SESSION_MS } from "./insights";
import type {
  BaseStats,
  GlobalSessionSpan,
  ModelStats,
  ParsedSessionFile,
  PeriodRawData,
  ProviderStats,
  SessionMessage,
  TabName,
  TimeFilteredStats,
  TokenStats,
  UsageData,
} from "./types";

function getSessionsDir(): string {
  // Replicate Pi's logic: respect PI_CODING_AGENT_DIR env var
  const agentDir =
    process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
  return join(agentDir, "sessions");
}

async function collectSessionFilesRecursively(
  dir: string,
  files: string[],
  signal?: AbortSignal,
): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (signal?.aborted) return;
      const entryPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await collectSessionFilesRecursively(entryPath, files, signal);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(entryPath);
      }
    }
  } catch {
    // Skip directories we can't read
  }
}

async function getAllSessionFiles(signal?: AbortSignal): Promise<string[]> {
  const files: string[] = [];
  await collectSessionFilesRecursively(getSessionsDir(), files, signal);
  files.sort();
  return files;
}

async function parseSessionFile(
  filePath: string,
  seenHashes: Set<string>,
  signal?: AbortSignal,
): Promise<ParsedSessionFile | null> {
  try {
    const content = await readFile(filePath, "utf8");
    if (signal?.aborted) return null;
    const lines = content.trim().split("\n");
    const messages: SessionMessage[] = [];
    let sessionId = "";

    for (let i = 0; i < lines.length; i++) {
      if (signal?.aborted) return null;
      if (i % 500 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      const line = lines[i]!;
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);

        if (entry.type === "session") {
          sessionId = entry.id;
        } else if (
          entry.type === "message" &&
          entry.message?.role === "assistant"
        ) {
          const msg = entry.message;
          if (msg.usage && msg.provider && msg.model) {
            const input = msg.usage.input || 0;
            const output = msg.usage.output || 0;
            const cacheRead = msg.usage.cacheRead || 0;
            const cacheWrite = msg.usage.cacheWrite || 0;
            const fallbackTs = entry.timestamp
              ? new Date(entry.timestamp).getTime()
              : 0;
            const timestamp =
              msg.timestamp || (Number.isNaN(fallbackTs) ? 0 : fallbackTs);

            // Deduplicate copied history across branched session files.
            // Keep the existing ccusage-style hash so current totals remain comparable.
            const totalTokens = input + output + cacheRead + cacheWrite;
            const hash = `${timestamp}:${totalTokens}`;
            if (seenHashes.has(hash)) continue;
            seenHashes.add(hash);

            messages.push({
              provider: msg.provider,
              model: msg.model,
              cost: msg.usage.cost?.total || 0,
              input,
              output,
              cacheRead,
              cacheWrite,
              timestamp,
            });
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    return sessionId ? { sessionId, messages } : null;
  } catch {
    return null;
  }
}

function accumulateStats(
  target: BaseStats,
  cost: number,
  tokens: TokenStats,
): void {
  target.messages++;
  target.cost += cost;
  target.tokens.total += tokens.total;
  target.tokens.input += tokens.input;
  target.tokens.output += tokens.output;
  target.tokens.cacheRead += tokens.cacheRead;
  target.tokens.cacheWrite += tokens.cacheWrite;
}

function emptyTokens(): TokenStats {
  return { total: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

function emptyModelStats(): ModelStats {
  return { sessions: new Set(), messages: 0, cost: 0, tokens: emptyTokens() };
}

function emptyProviderStats(): ProviderStats {
  return {
    sessions: new Set(),
    messages: 0,
    cost: 0,
    tokens: emptyTokens(),
    models: new Map(),
  };
}

function emptyTimeFilteredStats(): TimeFilteredStats {
  return {
    providers: new Map(),
    totals: { sessions: 0, messages: 0, cost: 0, tokens: emptyTokens() },
    insights: { insights: [] },
  };
}

function emptyPeriodRawData(): PeriodRawData {
  return { messages: [], sessionCosts: new Map() };
}

function emptyUsageData(): UsageData {
  return {
    today: emptyTimeFilteredStats(),
    thisWeek: emptyTimeFilteredStats(),
    lastWeek: emptyTimeFilteredStats(),
    allTime: emptyTimeFilteredStats(),
  };
}

function getPeriodsForTimestamp(
  timestamp: number,
  todayMs: number,
  weekStartMs: number,
  lastWeekStartMs: number,
): TabName[] {
  const periods: TabName[] = ["allTime"];
  if (timestamp >= todayMs) periods.push("today");
  if (timestamp >= weekStartMs) {
    periods.push("thisWeek");
  } else if (timestamp >= lastWeekStartMs) {
    periods.push("lastWeek");
  }
  return periods;
}

function addMessagesToUsageData(
  data: UsageData,
  sessionId: string,
  messages: SessionMessage[],
  todayMs: number,
  weekStartMs: number,
  lastWeekStartMs: number,
  rawByPeriod: Record<TabName, PeriodRawData>,
  globalSessionSpans: Map<string, GlobalSessionSpan>,
  periodSessionIds: Record<TabName, Set<string>>,
): void {
  for (const msg of messages) {
    // Track real per-session lifetime across every message we see, regardless of
    // which period the message falls into. Used later for the "8h+ session" insight.
    if (msg.timestamp > 0) {
      const span = globalSessionSpans.get(sessionId);
      if (!span) {
        globalSessionSpans.set(sessionId, {
          startMs: msg.timestamp,
          endMs: msg.timestamp,
        });
      } else {
        if (msg.timestamp < span.startMs) span.startMs = msg.timestamp;
        if (msg.timestamp > span.endMs) span.endMs = msg.timestamp;
      }
    }

    const periods = getPeriodsForTimestamp(
      msg.timestamp,
      todayMs,
      weekStartMs,
      lastWeekStartMs,
    );
    const tokens = {
      // Count fresh tokens processed this turn.
      // Include cacheWrite because those prompt tokens were newly written and billed.
      // Exclude cacheRead because repeated cache hits would otherwise dominate totals.
      total: msg.input + msg.output + msg.cacheWrite,
      input: msg.input,
      output: msg.output,
      cacheRead: msg.cacheRead,
      cacheWrite: msg.cacheWrite,
    };

    for (const period of periods) {
      const stats = data[period];
      periodSessionIds[period].add(sessionId);

      let providerStats = stats.providers.get(msg.provider);
      if (!providerStats) {
        providerStats = emptyProviderStats();
        stats.providers.set(msg.provider, providerStats);
      }

      let modelStats = providerStats.models.get(msg.model);
      if (!modelStats) {
        modelStats = emptyModelStats();
        providerStats.models.set(msg.model, modelStats);
      }

      modelStats.sessions.add(sessionId);
      accumulateStats(modelStats, msg.cost, tokens);

      providerStats.sessions.add(sessionId);
      accumulateStats(providerStats, msg.cost, tokens);

      accumulateStats(stats.totals, msg.cost, tokens);

      const raw = rawByPeriod[period];
      raw.messages.push({
        sessionId,
        timestamp: msg.timestamp,
        cost: msg.cost,
        input: msg.input,
        cacheRead: msg.cacheRead,
        cacheWrite: msg.cacheWrite,
      });
      raw.sessionCosts.set(
        sessionId,
        (raw.sessionCosts.get(sessionId) ?? 0) + msg.cost,
      );
    }
  }
}

export async function collectUsageData(
  signal?: AbortSignal,
): Promise<UsageData | null> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  // Start of current week (Monday 00:00)
  const startOfWeek = new Date();
  const dayOfWeek = startOfWeek.getDay(); // 0 = Sunday, 1 = Monday, ...
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(startOfWeek.getDate() - daysSinceMonday);
  startOfWeek.setHours(0, 0, 0, 0);
  const weekStartMs = startOfWeek.getTime();

  // Start of last week (previous Monday 00:00)
  const startOfLastWeek = new Date(startOfWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
  const lastWeekStartMs = startOfLastWeek.getTime();

  const data = emptyUsageData();
  const rawByPeriod: Record<TabName, PeriodRawData> = {
    today: emptyPeriodRawData(),
    thisWeek: emptyPeriodRawData(),
    lastWeek: emptyPeriodRawData(),
    allTime: emptyPeriodRawData(),
  };
  const periodSessionIds: Record<TabName, Set<string>> = {
    today: new Set(),
    thisWeek: new Set(),
    lastWeek: new Set(),
    allTime: new Set(),
  };
  const globalSessionSpans = new Map<string, GlobalSessionSpan>();

  const sessionFiles = await getAllSessionFiles(signal);
  if (signal?.aborted) return null;
  const seenHashes = new Set<string>();

  for (const filePath of sessionFiles) {
    if (signal?.aborted) return null;
    const parsed = await parseSessionFile(filePath, seenHashes, signal);
    if (signal?.aborted) return null;
    if (!parsed) continue;

    addMessagesToUsageData(
      data,
      parsed.sessionId,
      parsed.messages,
      todayMs,
      weekStartMs,
      lastWeekStartMs,
      rawByPeriod,
      globalSessionSpans,
      periodSessionIds,
    );

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  for (const period of TAB_ORDER) {
    data[period].totals.sessions = periodSessionIds[period].size;
  }

  // Classify sessions that are globally long-running once, then reuse across periods.
  const longSessionIds = new Set<string>();
  for (const [id, span] of globalSessionSpans) {
    if (span.endMs - span.startMs >= LONG_SESSION_MS) longSessionIds.add(id);
  }

  for (const period of TAB_ORDER) {
    data[period].insights = computeInsights(
      rawByPeriod[period],
      longSessionIds,
    );
  }

  return data;
}
