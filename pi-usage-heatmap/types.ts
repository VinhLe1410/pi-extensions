export type DayTotals = Map<string, number>;

export type UsageStats = {
  year: number;
  generatedAt: Date;
  days: DayTotals;
  totalOutput: number;
  activeDays: number;
  maxDayKey?: string;
  maxDayOutput: number;
  dedupedOutput: number;
  dedupedMessages: number;
  scannedFiles: number;
  scannedMessages: number;
  errors: number;
};

export type AssistantUsageRecord = {
  dedupeKey: string;
  date: Date;
  output: number;
};

export type MonthSpan = { start: number; end: number };
