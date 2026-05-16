import type {
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

function sanitizeStatusText(text: string): string {
  return text
    .replace(/[\r\n\t]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

function renderStatusChip(text: string, theme: Theme): string {
  return [
    theme.fg("dim", "["),
    theme.fg("success", ""),
    " ",
    text,
    theme.fg("dim", "]"),
  ].join("");
}

export function renderExtensionStatusFooter(
  footerData: ReadonlyFooterDataProvider,
  width: number,
  theme: Theme,
): string[] {
  const statusLine = Array.from(footerData.getExtensionStatuses().entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, text]) => sanitizeStatusText(text))
    .filter(Boolean)
    .map((text) => renderStatusChip(text, theme))
    .join(theme.fg("dim", " "));

  return statusLine
    ? [truncateToWidth(statusLine, width, theme.fg("dim", "…"))]
    : [];
}
