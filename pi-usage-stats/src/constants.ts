import type { TabName } from "./types";

export const TAB_LABELS: Record<TabName, string> = {
  today: "Today",
  thisWeek: "This Week",
  thisMonth: "This Month",
  allTime: "All Time",
};

export const TAB_ORDER: TabName[] = ["today", "thisWeek", "thisMonth", "allTime"];
