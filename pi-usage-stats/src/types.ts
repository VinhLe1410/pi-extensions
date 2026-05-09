export interface TokenStats {
  total: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface BaseStats {
  messages: number;
  cost: number;
  tokens: TokenStats;
}

export interface ModelStats extends BaseStats {
  sessions: Set<string>;
}

export interface ProviderStats extends BaseStats {
  sessions: Set<string>;
  models: Map<string, ModelStats>;
}

export interface TotalStats extends BaseStats {
  sessions: number;
}

export interface Insight {
  percent: number;
  headline: string;
  advice: string;
}

export interface PeriodInsights {
  insights: Insight[];
}

export interface RawMessage {
  sessionId: string;
  timestamp: number;
  cost: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface PeriodRawData {
  messages: RawMessage[];
  sessionCosts: Map<string, number>;
}

export interface GlobalSessionSpan {
  startMs: number;
  endMs: number;
}

export interface TimeFilteredStats {
  providers: Map<string, ProviderStats>;
  totals: TotalStats;
  insights: PeriodInsights;
  tokenBuckets: number[];
}

export interface UsageData {
  today: TimeFilteredStats;
  thisWeek: TimeFilteredStats;
  thisMonth: TimeFilteredStats;
  allTime: TimeFilteredStats;
}

export type TabName = "today" | "thisWeek" | "thisMonth" | "allTime";
export type ViewMode = "table" | "insights";

export interface DataColumn {
  label: string;
  width: number;
  dimmed?: boolean;
  getValue: (stats: BaseStats & { sessions: Set<string> | number }) => string;
}

export interface TableLayoutCandidate {
  columns: DataColumn[];
  minNameWidth: number;
  compact?: boolean;
}

export interface TableLayout {
  columns: DataColumn[];
  nameWidth: number;
  tableWidth: number;
  compact: boolean;
}

export interface SessionMessage {
  provider: string;
  model: string;
  cost: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  timestamp: number;
}

export interface ParsedSessionFile {
  sessionId: string;
  messages: SessionMessage[];
}
