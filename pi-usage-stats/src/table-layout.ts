import type { DataColumn, TableLayout, TableLayoutCandidate } from "./types";
import { formatCost, formatNumber, formatTokens } from "./formatting";

export const MAX_NAME_COL_WIDTH = 34;

const SESSIONS_COLUMN: DataColumn = {
  label: "Sessions",
  width: 9,
  getValue: (s) =>
    formatNumber(typeof s.sessions === "number" ? s.sessions : s.sessions.size),
};

const MSGS_COLUMN: DataColumn = {
  label: "Msgs",
  width: 9,
  getValue: (s) => formatNumber(s.messages),
};

const COST_COLUMN: DataColumn = {
  label: "Cost",
  width: 9,
  getValue: (s) => formatCost(s.cost),
};

const TOKENS_COLUMN: DataColumn = {
  label: "Tokens",
  width: 9,
  getValue: (s) => formatTokens(s.tokens.total),
};

const INPUT_COLUMN: DataColumn = {
  label: "↑In",
  width: 8,
  dimmed: true,
  // Include cacheWrite so this reflects fresh input tokens sent this turn,
  // even for providers like Anthropic that split cached prompt creation out
  // from the regular input token count.
  getValue: (s) => formatTokens(s.tokens.input + s.tokens.cacheWrite),
};

const OUTPUT_COLUMN: DataColumn = {
  label: "↓Out",
  width: 8,
  dimmed: true,
  getValue: (s) => formatTokens(s.tokens.output),
};

const CACHE_COLUMN: DataColumn = {
  label: "Cache",
  width: 8,
  dimmed: true,
  getValue: (s) => formatTokens(s.tokens.cacheRead + s.tokens.cacheWrite),
};

const FULL_DATA_COLUMNS: DataColumn[] = [
  SESSIONS_COLUMN,
  MSGS_COLUMN,
  COST_COLUMN,
  TOKENS_COLUMN,
  INPUT_COLUMN,
  OUTPUT_COLUMN,
  CACHE_COLUMN,
];

const TABLE_LAYOUTS: TableLayoutCandidate[] = [
  { columns: FULL_DATA_COLUMNS, minNameWidth: MAX_NAME_COL_WIDTH },
  {
    columns: [SESSIONS_COLUMN, MSGS_COLUMN, COST_COLUMN, TOKENS_COLUMN],
    minNameWidth: 18,
    compact: true,
  },
  {
    columns: [SESSIONS_COLUMN, COST_COLUMN, TOKENS_COLUMN],
    minNameWidth: 16,
    compact: true,
  },
  { columns: [COST_COLUMN, TOKENS_COLUMN], minNameWidth: 14, compact: true },
  { columns: [COST_COLUMN], minNameWidth: 12, compact: true },
];

function sumColumnWidths(columns: DataColumn[]): number {
  return columns.reduce((sum, col) => sum + col.width, 0);
}

export function getTableLayout(width: number): TableLayout {
  const safeWidth = Math.max(width, 0);

  for (const candidate of TABLE_LAYOUTS) {
    const columnsWidth = sumColumnWidths(candidate.columns);
    const nameWidth = Math.min(
      MAX_NAME_COL_WIDTH,
      Math.max(safeWidth - columnsWidth, 0),
    );
    if (nameWidth >= candidate.minNameWidth) {
      return {
        columns: candidate.columns,
        nameWidth,
        tableWidth: nameWidth + columnsWidth,
        compact: candidate.compact ?? false,
      };
    }
  }

  const fallback = TABLE_LAYOUTS[TABLE_LAYOUTS.length - 1]!;
  const fallbackColumnsWidth = sumColumnWidths(fallback.columns);
  const fallbackNameWidth = Math.min(
    MAX_NAME_COL_WIDTH,
    Math.max(safeWidth - fallbackColumnsWidth, 0),
  );
  return {
    columns: fallback.columns,
    nameWidth: fallbackNameWidth,
    tableWidth: fallbackNameWidth + fallbackColumnsWidth,
    compact: fallback.compact ?? false,
  };
}
