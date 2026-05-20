import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

async function git(pi: ExtensionAPI, args: string[], cwd: string) {
  return pi.exec("git", args, { cwd, timeout: 30_000 });
}

function formatCommand(command: string, args: string[]) {
  return [command, ...args.map((arg) => (arg.includes(" ") ? JSON.stringify(arg) : arg))].join(" ");
}

async function ensureGitRepository(pi: ExtensionAPI, ctx: ExtensionCommandContext) {
  const result = await git(pi, ["rev-parse", "--is-inside-work-tree"], ctx.cwd);
  if (result.code === 0 && result.stdout.trim() === "true") return true;

  ctx.ui.notify("/commit must be run inside a git repository", "error");
  return false;
}

async function getStatus(pi: ExtensionAPI, cwd: string) {
  const result = await git(pi, ["status", "--short"], cwd);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "Failed to read git status");
  }
  return result.stdout.trimEnd();
}

function padRight(text: string, width: number) {
  const textWidth = visibleWidth(text);
  if (textWidth >= width) return text;
  return text + " ".repeat(width - textWidth);
}

function renderTopBorder(theme: Theme, width: number, title: string) {
  const innerWidth = Math.max(0, width - 2);
  const titleText = truncateToWidth(` ${title} `, innerWidth);
  const titleWidth = visibleWidth(titleText);
  const left = Math.floor(Math.max(0, innerWidth - titleWidth) / 2);
  const right = Math.max(0, innerWidth - titleWidth - left);

  return (
    theme.fg("border", `╭${"─".repeat(left)}`) +
    theme.fg("accent", titleText) +
    theme.fg("border", `${"─".repeat(right)}╮`)
  );
}

function renderBox(theme: Theme, width: number, title: string, contentLines: string[]) {
  if (width < 2) return contentLines.map((line) => truncateToWidth(line, width));

  const innerWidth = width - 2;
  const paddingX = innerWidth >= 4 ? 2 : 0;
  const contentWidth = Math.max(0, innerWidth - paddingX * 2);
  const lines = [renderTopBorder(theme, width, title)];

  for (const line of contentLines) {
    const content = `${" ".repeat(paddingX)}${padRight(truncateToWidth(line, contentWidth), contentWidth)}${" ".repeat(paddingX)}`;
    lines.push(theme.fg("border", "│") + content + theme.fg("border", "│"));
  }

  lines.push(theme.fg("border", `╰${"─".repeat(innerWidth)}╯`));
  return lines;
}

function statusColorKey(line: string) {
  if (line.startsWith("??")) return "success" as const;
  if (line.includes("D")) return "error" as const;
  if (line.includes("A")) return "success" as const;
  if (line.includes("R")) return "accent" as const;
  return "warning" as const;
}

async function confirmCommit(ctx: ExtensionCommandContext, message: string, status: string) {
  return ctx.ui.custom<boolean>(
    (tui, theme, _keybindings, done) => {
      let selected = 0;
      let cachedLines: string[] | undefined;
      const options = ["Yes, commit", "No, cancel"];

      function refresh() {
        cachedLines = undefined;
        tui.requestRender();
      }

      function render(width: number) {
        if (cachedLines) return cachedLines;

        const contentWidth = Math.max(0, width - 6);
        const contentLines: string[] = [];
        const add = (line = "") => contentLines.push(truncateToWidth(line, contentWidth));

        add("");
        add(`${theme.fg("muted", "Message:")} ${theme.fg("text", message)}`);
        add("");
        add(theme.fg("muted", "This will run:"));
        add(`  ${theme.fg("accent", "git add -A")}`);
        add(`  ${theme.fg("accent", formatCommand("git", ["commit", "-m", message]))}`);
        add("");
        add(theme.fg("muted", "Current changes:"));
        for (const line of status.split("\n")) {
          const statusCode = line.slice(0, 2);
          const filePath = line.slice(3);
          add(`  ${theme.fg(statusColorKey(line), statusCode)} ${theme.fg("text", filePath)}`);
        }
        add("");

        for (let i = 0; i < options.length; i++) {
          const isSelected = i === selected;
          const prefix = isSelected ? theme.fg("accent", "› ") : "  ";
          const color = isSelected ? "accent" : "text";
          add(`${prefix}${theme.fg(color, options[i]!)}`);
        }

        add("");
        add(theme.fg("dim", "↑↓ navigate  enter select  esc cancel"));

        cachedLines = renderBox(theme, width, "Commit Changes", contentLines);
        return cachedLines;
      }

      function handleInput(data: string) {
        if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
          selected = selected === 0 ? 1 : 0;
          refresh();
          return;
        }
        if (matchesKey(data, Key.enter)) {
          done(selected === 0);
          return;
        }
        if (matchesKey(data, Key.escape)) {
          done(false);
        }
      }

      return {
        render,
        handleInput,
        invalidate: () => {
          cachedLines = undefined;
        },
      };
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: "70%",
        minWidth: 72,
        maxHeight: "80%",
        margin: 2,
      },
    },
  );
}

async function commitChanges(pi: ExtensionAPI, ctx: ExtensionCommandContext, message: string) {
  await ctx.waitForIdle();

  if (!(await ensureGitRepository(pi, ctx))) return;

  const initialStatus = await getStatus(pi, ctx.cwd);
  if (!initialStatus) {
    ctx.ui.notify("No git changes to commit", "info");
    return;
  }

  const confirmed = await confirmCommit(ctx, message, initialStatus);

  if (!confirmed) {
    ctx.ui.notify("Commit cancelled", "info");
    return;
  }

  const addResult = await git(pi, ["add", "-A"], ctx.cwd);
  if (addResult.code !== 0) {
    ctx.ui.notify(addResult.stderr.trim() || "git add failed", "error");
    return;
  }

  const stagedStatus = await getStatus(pi, ctx.cwd);
  if (!stagedStatus) {
    ctx.ui.notify("No git changes to commit after staging", "info");
    return;
  }

  const commitResult = await git(pi, ["commit", "-m", message], ctx.cwd);
  if (commitResult.code !== 0) {
    ctx.ui.notify(commitResult.stderr.trim() || commitResult.stdout.trim() || "git commit failed", "error");
    return;
  }

  ctx.ui.notify(commitResult.stdout.trim() || "Committed changes", "info");
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("commit", {
    description: "Commit current git changes. Usage: /commit [message]",
    handler: async (args, ctx) => {
      const message = args.trim();
      if (!message) {
        ctx.ui.notify("Usage: /commit [message]", "error");
        return;
      }

      try {
        await commitChanges(pi, ctx, message);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}
