import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { format, isAfter, startOfDay } from "date-fns";
import { promises as fs } from "node:fs";
import path from "node:path";
import { FILE_SCAN_CONCURRENCY } from "./constants.ts";
import type { AssistantUsageRecord, DayTotals, UsageStats } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function dateFromValue(value: unknown): Date | undefined {
  const date =
    typeof value === "number" || typeof value === "string"
      ? new Date(value)
      : undefined;
  return date && !Number.isNaN(date.getTime()) ? date : undefined;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("Usage scan aborted");
}

async function findSessionFiles(
  root: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const files: string[] = [];
  const dirs = [root];

  while (dirs.length > 0) {
    throwIfAborted(signal);
    const dir = dirs.pop()!;
    let entries: Array<{
      name: string;
      isDirectory(): boolean;
      isFile(): boolean;
    }>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      throwIfAborted(signal);
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        dirs.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const item = items[nextIndex++]!;
      await fn(item);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
}

function readAssistantUsage(
  entry: unknown,
  filePath: string,
  lineNumber: number,
): AssistantUsageRecord | undefined {
  if (!isRecord(entry) || entry.type !== "message" || !isRecord(entry.message))
    return undefined;

  const message = entry.message;
  if (message.role !== "assistant" || !isRecord(message.usage))
    return undefined;

  const usage = message.usage;
  const output = Math.trunc(numberValue(usage.output));
  if (output <= 0) return undefined;

  const date =
    dateFromValue(message.timestamp) ?? dateFromValue(entry.timestamp);
  if (!date) return undefined;

  const entryId =
    typeof entry.id === "string" ? entry.id : `${filePath}:${lineNumber}`;
  const timestamp =
    typeof message.timestamp === "number" ||
    typeof message.timestamp === "string"
      ? String(message.timestamp)
      : typeof entry.timestamp === "string"
        ? entry.timestamp
        : "";
  const provider = typeof message.provider === "string" ? message.provider : "";
  const model = typeof message.model === "string" ? message.model : "";
  const input = Math.trunc(numberValue(usage.input));
  const cacheRead = Math.trunc(numberValue(usage.cacheRead));
  const cacheWrite = Math.trunc(numberValue(usage.cacheWrite));
  const totalTokens = Math.trunc(numberValue(usage.totalTokens));

  return {
    date,
    output,
    dedupeKey: [
      entryId,
      timestamp,
      provider,
      model,
      input,
      output,
      cacheRead,
      cacheWrite,
      totalTokens,
    ].join("|"),
  };
}

export async function collectUsage(
  now = new Date(),
  signal?: AbortSignal,
): Promise<UsageStats> {
  const year = now.getFullYear();
  const today = startOfDay(now);
  const sessionsDir = path.join(getAgentDir(), "sessions");
  const sessionFiles = await findSessionFiles(sessionsDir, signal);
  const seen = new Set<string>();
  const days: DayTotals = new Map();

  let totalOutput = 0;
  let dedupedOutput = 0;
  let dedupedMessages = 0;
  let scannedMessages = 0;
  let errors = 0;

  await mapLimit(sessionFiles, FILE_SCAN_CONCURRENCY, async (filePath) => {
    let content: string;
    try {
      throwIfAborted(signal);
      content = await fs.readFile(filePath, { encoding: "utf8", signal });
    } catch {
      throwIfAborted(signal);
      errors += 1;
      return;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      throwIfAborted(signal);
      const line = lines[i]!.trim();
      if (!line) continue;

      let entry: unknown;
      try {
        entry = JSON.parse(line);
      } catch {
        errors += 1;
        continue;
      }

      const record = readAssistantUsage(entry, filePath, i + 1);
      if (!record) continue;

      const day = startOfDay(record.date);
      if (day.getFullYear() !== year || isAfter(day, today)) continue;

      scannedMessages += 1;
      if (seen.has(record.dedupeKey)) {
        dedupedOutput += record.output;
        dedupedMessages += 1;
        continue;
      }
      seen.add(record.dedupeKey);

      const key = format(day, "yyyy-MM-dd");
      days.set(key, (days.get(key) ?? 0) + record.output);
      totalOutput += record.output;
    }
  });

  let activeDays = 0;
  let maxDayKey: string | undefined;
  let maxDayOutput = 0;
  for (const [key, output] of days) {
    if (output <= 0) continue;
    activeDays += 1;
    if (output > maxDayOutput) {
      maxDayOutput = output;
      maxDayKey = key;
    }
  }

  return {
    year,
    generatedAt: now,
    days,
    totalOutput,
    activeDays,
    maxDayKey,
    maxDayOutput,
    dedupedOutput,
    dedupedMessages,
    scannedFiles: sessionFiles.length,
    scannedMessages,
    errors,
  };
}
