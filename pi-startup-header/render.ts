import { basename } from "node:path";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { loadExternalPackages, loadLocalPackages, type PackageEntry } from "./config";

const TITLE_LINES = [
  "╭────────────────────╮",
  "│   L P V  //  P I   │",
  "╰────────────────────╯",
];

type HeaderCommand = ReturnType<ExtensionAPI["getCommands"]>[number];
type CommandTreeEntry =
  | { kind: "command"; command: HeaderCommand }
  | { kind: "source"; source: string; commands: HeaderCommand[] };

function center(text: string, width: number): string {
  const length = visibleWidth(text);
  if (length >= width) return text;
  return `${" ".repeat(Math.floor((width - length) / 2))}${text}`;
}

function padRight(text: string, width: number): string {
  const length = visibleWidth(text);
  if (length >= width) return text;
  return `${text}${" ".repeat(width - length)}`;
}

function projectName(): string {
  return basename(process.cwd()) || "session";
}

function stripPackagePrefix(source: string): string {
  return source.replace(/^npm:/, "").replace(/^git:/, "");
}

function formatSource(source: string): string {
  const stripped = stripPackagePrefix(source);
  return stripped.length > 0 ? stripped : "unknown";
}

function groupBySource<T extends { sourceInfo: { source: string } }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const source = formatSource(item.sourceInfo.source);
    groups.set(source, [...(groups.get(source) ?? []), item]);
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function sectionTitle(theme: Theme, icon: string, title: string, count?: number): string {
  const suffix = count === undefined ? "" : theme.fg("dim", ` (${count})`);
  return theme.bold(theme.fg("mdHeading", `${icon} ${title}`)) + suffix;
}

function pushLine(lines: string[], width: number, theme: Theme, line: string): void {
  lines.push(truncateToWidth(line, width, theme.fg("dim", "…")));
}

function treeLine(theme: Theme, isLast: boolean, text: string): string {
  return `${theme.fg("dim", isLast ? "└─ " : "├─ ")}${text}`;
}

function treeChildLine(theme: Theme, parentLast: boolean, isLast: boolean, text: string): string {
  const trunk = parentLast ? "   " : "│  ";
  return `${theme.fg("dim", `${trunk}${isLast ? "└─ " : "├─ "}`)}${text}`;
}

function renderPackageTree(
  lines: string[],
  width: number,
  theme: Theme,
  title: string,
  packages: PackageEntry[],
): void {
  lines.push(sectionTitle(theme, "◈", title, packages.length));
  if (packages.length === 0) {
    pushLine(lines, width, theme, treeLine(theme, true, theme.fg("dim", "none configured")));
    return;
  }

  packages.forEach((pkg, packageIndex) => {
    const packageLast = packageIndex === packages.length - 1;
    pushLine(lines, width, theme, treeLine(theme, packageLast, theme.fg("text", pkg.label)));
  });
}

function maxLineWidth(lines: string[]): number {
  return Math.max(0, ...lines.map((line) => visibleWidth(line)));
}

function renderPackageColumns(lines: string[], width: number, theme: Theme): void {
  const externalLines: string[] = [];
  const localLines: string[] = [];

  renderPackageTree(externalLines, width, theme, "External packages", loadExternalPackages());
  renderPackageTree(localLines, width, theme, "Local packages", loadLocalPackages());

  const gap = "    ";
  const gapWidth = visibleWidth(gap);
  const externalWidth = maxLineWidth(externalLines);
  const localWidth = maxLineWidth(localLines);
  const shouldUseColumns = externalWidth + gapWidth + localWidth <= width;

  if (!shouldUseColumns) {
    lines.push(...externalLines);
    lines.push("");
    lines.push(...localLines);
    return;
  }

  const rowCount = Math.max(externalLines.length, localLines.length);
  for (let index = 0; index < rowCount; index++) {
    const left = externalLines[index] ?? "";
    const right = localLines[index] ?? "";
    pushLine(lines, width, theme, `${padRight(left, externalWidth)}${gap}${right}`);
  }
}

function renderCommandGroups(
  lines: string[],
  width: number,
  theme: Theme,
  title: string,
  icon: string,
  commands: HeaderCommand[],
): void {
  lines.push(sectionTitle(theme, icon, title, commands.length));
  if (commands.length === 0) {
    pushLine(lines, width, theme, treeLine(theme, true, theme.fg("dim", "none discovered")));
    return;
  }

  const grouped: CommandTreeEntry[] = [];
  for (const [source, sourceCommands] of groupBySource(commands)) {
    const sortedCommands = [...sourceCommands].sort((a, b) => a.name.localeCompare(b.name));
    if (source === "auto") {
      grouped.push(...sortedCommands.map((command) => ({ kind: "command" as const, command })));
    } else {
      grouped.push({ kind: "source", source, commands: sortedCommands });
    }
  }

  grouped.forEach((entry, entryIndex) => {
    const entryLast = entryIndex === grouped.length - 1;
    if (entry.kind === "command") {
      pushLine(lines, width, theme, treeLine(theme, entryLast, theme.fg("text", `/${entry.command.name}`)));
      return;
    }

    pushLine(lines, width, theme, treeLine(theme, entryLast, theme.fg("accent", entry.source)));
    entry.commands.forEach((command, commandIndex) => {
      pushLine(
        lines,
        width,
        theme,
        treeChildLine(theme, entryLast, commandIndex === entry.commands.length - 1, theme.fg("text", `/${command.name}`)),
      );
    });
  });
}

function renderDetailsContent(width: number, theme: Theme, pi: ExtensionAPI): string[] {
  const commands = pi.getCommands();
  const skillCommands = commands.filter((command) => command.source === "skill");
  const promptCommands = commands.filter((command) => command.source === "prompt");
  const lines: string[] = [];

  renderPackageColumns(lines, width, theme);
  lines.push("");

  renderCommandGroups(lines, width, theme, "Skills", "✦", skillCommands);
  lines.push("");
  renderCommandGroups(lines, width, theme, "Prompt templates", "✎", promptCommands);

  return lines;
}

function renderTopBorder(theme: Theme, width: number, title: string): string {
  const innerWidth = Math.max(0, width - 2);
  const titleText = truncateToWidth(` ${title} `, innerWidth);
  const titleWidth = visibleWidth(titleText);
  const left = Math.floor(Math.max(0, innerWidth - titleWidth) / 2);
  const right = Math.max(0, innerWidth - titleWidth - left);

  return (
    theme.fg("accent", `╭${"─".repeat(left)}`) +
    theme.fg("accent", titleText) +
    theme.fg("accent", `${"─".repeat(right)}╮`)
  );
}

function renderBox(theme: Theme, width: number, title: string, contentLines: string[], paddingX = 2): string[] {
  if (width < 2) return contentLines;

  const innerWidth = width - 2;
  const contentWidth = Math.max(0, innerWidth - paddingX * 2);
  const sidePadding = " ".repeat(paddingX);
  const lines = [renderTopBorder(theme, width, title)];
  const blankContent = " ".repeat(contentWidth);

  lines.push(`${theme.fg("accent", "│")}${sidePadding}${blankContent}${sidePadding}${theme.fg("accent", "│")}`);
  for (const line of contentLines) {
    const content = padRight(truncateToWidth(line, contentWidth), contentWidth);
    lines.push(`${theme.fg("accent", "│")}${sidePadding}${content}${sidePadding}${theme.fg("accent", "│")}`);
  }
  lines.push(`${theme.fg("accent", "│")}${sidePadding}${blankContent}${sidePadding}${theme.fg("accent", "│")}`);

  lines.push(theme.fg("accent", `╰${"─".repeat(innerWidth)}╯`));
  return lines;
}

function renderCenteredBox(theme: Theme, width: number, title: string, contentLines: string[]): string[] {
  const paddingX = 2;
  const maxContentWidth = Math.max(1, width - 2 - paddingX * 2);
  const contentWidth = Math.min(
    maxContentWidth,
    Math.max(1, ...contentLines.map((line) => visibleWidth(line))),
  );
  const boxWidth = Math.min(width, contentWidth + paddingX * 2 + 2);
  const boxedLines = renderBox(theme, boxWidth, title, contentLines, paddingX);
  const leftPadding = " ".repeat(Math.max(0, Math.floor((width - boxWidth) / 2)));

  return boxedLines.map((line) => `${leftPadding}${line}`);
}

export function renderHeader(width: number, theme: Theme, pi: ExtensionAPI, currentModelId: string): string[] {
  const maxDetailsWidth = Math.max(1, width - 6);
  const details = renderDetailsContent(maxDetailsWidth, theme, pi);
  const lines: string[] = [""];

  for (const line of TITLE_LINES) {
    lines.push(center(theme.bold(theme.fg("accent", line)), width));
  }

  lines.push(center(`${theme.fg("accent", currentModelId)} ${theme.fg("dim", "·")} ${theme.fg("text", projectName())}`, width));
  lines.push("");
  lines.push(...renderCenteredBox(theme, width, "customizations", details));

  return lines;
}
