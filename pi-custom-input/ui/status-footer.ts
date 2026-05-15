import type { ReadonlyFooterDataProvider, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

export function renderExtensionStatusFooter(
  footerData: ReadonlyFooterDataProvider,
  width: number,
  theme: Theme,
): string[] {
  const statusLine = Array.from(footerData.getExtensionStatuses().entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, text]) =>
      text
        .replace(/[\r\n\t]/g, " ")
        .replace(/ +/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join(" ");

  return statusLine
    ? [truncateToWidth(statusLine, width, theme.fg("dim", "…"))]
    : [];
}
