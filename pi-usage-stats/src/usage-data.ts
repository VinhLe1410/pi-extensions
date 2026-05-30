import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { TAB_ORDER } from "./constants";
import type {
  BaseStats,
  ModelStats,
  ParsedSessionFile,
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
  registry: ModelRegistry,
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
              modelName: getModelDisplayName(registry, msg.provider, msg.model),
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

function emptyModelStats(displayName: string): ModelStats {
  return {
    sessions: new Set(),
    displayName,
    messages: 0,
    cost: 0,
    tokens: emptyTokens(),
  };
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

function emptyTimeFilteredStats(tokenBucketCount = 0): TimeFilteredStats {
  return {
    providers: new Map(),
    totals: { sessions: 0, messages: 0, cost: 0, tokens: emptyTokens() },
    tokenBuckets: Array(tokenBucketCount).fill(0),
  };
}

function emptyUsageData(monthDayCount: number): UsageData {
  return {
    today: emptyTimeFilteredStats(24),
    thisWeek: emptyTimeFilteredStats(21),
    thisMonth: emptyTimeFilteredStats(monthDayCount),
    allTime: emptyTimeFilteredStats(),
  };
}

function getPeriodsForTimestamp(
  timestamp: number,
  todayMs: number,
  tomorrowMs: number,
  weekStartMs: number,
  nextWeekMs: number,
  monthStartMs: number,
  nextMonthMs: number,
): TabName[] {
  const periods: TabName[] = ["allTime"];
  if (timestamp >= todayMs && timestamp < tomorrowMs) periods.push("today");
  if (timestamp >= weekStartMs && timestamp < nextWeekMs) {
    periods.push("thisWeek");
  }
  if (timestamp >= monthStartMs && timestamp < nextMonthMs) {
    periods.push("thisMonth");
  }
  return periods;
}

function addToTokenBuckets(
  stats: TimeFilteredStats,
  period: TabName,
  timestamp: number,
  tokens: number,
  weekStartMs: number,
): void {
  if (stats.tokenBuckets.length === 0 || timestamp <= 0) return;

  let bucketIndex = -1;
  if (period === "today") {
    bucketIndex = new Date(timestamp).getHours();
  } else if (period === "thisWeek") {
    const dayIndex = Math.floor((timestamp - weekStartMs) / 86_400_000);
    const hour = new Date(timestamp).getHours();
    bucketIndex = dayIndex * 3 + Math.floor(hour / 8);
  } else if (period === "thisMonth") {
    bucketIndex = new Date(timestamp).getDate() - 1;
  }

  if (bucketIndex >= 0 && bucketIndex < stats.tokenBuckets.length) {
    stats.tokenBuckets[bucketIndex] += tokens;
  }
}

function getModelDisplayName(
  registry: ModelRegistry,
  provider: string,
  modelId: string,
): string {
  return registry.find(provider, modelId)?.name || modelId;
}

function addMessagesToUsageData(
  data: UsageData,
  sessionId: string,
  messages: SessionMessage[],
  todayMs: number,
  tomorrowMs: number,
  weekStartMs: number,
  nextWeekMs: number,
  monthStartMs: number,
  nextMonthMs: number,
  periodSessionIds: Record<TabName, Set<string>>,
  registry: ModelRegistry,
): void {
  for (const msg of messages) {
    const periods = getPeriodsForTimestamp(
      msg.timestamp,
      todayMs,
      tomorrowMs,
      weekStartMs,
      nextWeekMs,
      monthStartMs,
      nextMonthMs,
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
        modelStats = emptyModelStats(msg.modelName);
        providerStats.models.set(msg.model, modelStats);
      }

      modelStats.sessions.add(sessionId);
      accumulateStats(modelStats, msg.cost, tokens);

      providerStats.sessions.add(sessionId);
      accumulateStats(providerStats, msg.cost, tokens);

      accumulateStats(stats.totals, msg.cost, tokens);

      addToTokenBuckets(stats, period, msg.timestamp, tokens.total, weekStartMs);
    }
  }
}

export async function collectUsageData(
  signal?: AbortSignal,
): Promise<UsageData | null> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const tomorrowMs = startOfTomorrow.getTime();

  // Start of current week (Monday 00:00)
  const startOfWeek = new Date();
  const dayOfWeek = startOfWeek.getDay(); // 0 = Sunday, 1 = Monday, ...
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(startOfWeek.getDate() - daysSinceMonday);
  startOfWeek.setHours(0, 0, 0, 0);
  const weekStartMs = startOfWeek.getTime();

  const startOfNextWeek = new Date(startOfWeek);
  startOfNextWeek.setDate(startOfNextWeek.getDate() + 7);
  const nextWeekMs = startOfNextWeek.getTime();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthStartMs = startOfMonth.getTime();

  const startOfNextMonth = new Date(startOfMonth);
  startOfNextMonth.setMonth(startOfNextMonth.getMonth() + 1);
  const nextMonthMs = startOfNextMonth.getTime();
  const monthDayCount = new Date(
    startOfMonth.getFullYear(),
    startOfMonth.getMonth() + 1,
    0,
  ).getDate();

  const data = emptyUsageData(monthDayCount);
  const registry = ModelRegistry.create(AuthStorage.inMemory());
  const periodSessionIds: Record<TabName, Set<string>> = {
    today: new Set(),
    thisWeek: new Set(),
    thisMonth: new Set(),
    allTime: new Set(),
  };

  const sessionFiles = await getAllSessionFiles(signal);
  if (signal?.aborted) return null;
  const seenHashes = new Set<string>();

  for (const filePath of sessionFiles) {
    if (signal?.aborted) return null;
    const parsed = await parseSessionFile(filePath, seenHashes, registry, signal);
    if (signal?.aborted) return null;
    if (!parsed) continue;

    addMessagesToUsageData(
      data,
      parsed.sessionId,
      parsed.messages,
      todayMs,
      tomorrowMs,
      weekStartMs,
      nextWeekMs,
      monthStartMs,
      nextMonthMs,
      periodSessionIds,
      registry,
    );

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  for (const period of TAB_ORDER) {
    data[period].totals.sessions = periodSessionIds[period].size;
  }

  return data;
}
