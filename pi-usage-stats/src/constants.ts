import type { TabName } from "./types";

export const TAB_LABELS: Record<TabName, string> = {
  today: "Today",
  thisWeek: "This Week",
  lastWeek: "Last Week",
  allTime: "All Time",
};

export const TAB_ORDER: TabName[] = ["today", "thisWeek", "lastWeek", "allTime"];
