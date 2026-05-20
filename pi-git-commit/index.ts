import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

async function git(pi: ExtensionAPI, args: string[], cwd: string) {
  return pi.exec("git", args, { cwd, timeout: 30_000 });
}

function formatCommand(command: string, args: string[]) {
  return [command, ...args.map((arg) => (arg.includes(" ") ? JSON.stringify(arg) : arg))].join(" ");
}

async function ensureGitRepository(pi: ExtensionAPI, ctx: ExtensionCommandContext, commandName: string) {
  const result = await git(pi, ["rev-parse", "--is-inside-work-tree"], ctx.cwd);
  if (result.code === 0 && result.stdout.trim() === "true") return true;

  ctx.ui.notify(`/${commandName} must be run inside a git repository`, "error");
  return false;
}

async function getStatus(pi: ExtensionAPI, cwd: string) {
  const result = await git(pi, ["status", "--short"], cwd);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "Failed to read git status");
  }
  return result.stdout.trimEnd();
}

async function getCurrentBranch(pi: ExtensionAPI, cwd: string) {
  const result = await git(pi, ["branch", "--show-current"], cwd);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "Failed to read current git branch");
  }
  return result.stdout.trim();
}

async function getUpstream(pi: ExtensionAPI, cwd: string) {
  const result = await git(pi, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd);
  return result.code === 0 ? result.stdout.trim() : undefined;
}

async function hasOriginRemote(pi: ExtensionAPI, cwd: string) {
  const result = await git(pi, ["remote", "get-url", "origin"], cwd);
  return result.code === 0 && result.stdout.trim().length > 0;
}

function outputText(result: Awaited<ReturnType<typeof git>>) {
  return [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
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

type ConfirmationDetails = {
  title: string;
  confirmLabel: string;
  message?: string;
  branch?: string;
  upstream?: string;
  commands: string[];
  status?: string;
  note?: string;
};

async function confirmGitAction(ctx: ExtensionCommandContext, details: ConfirmationDetails) {
  return ctx.ui.custom<boolean>(
    (tui, theme, _keybindings, done) => {
      let selected = 0;
      let cachedLines: string[] | undefined;
      const options = [details.confirmLabel, "No, cancel"];

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
        if (details.message) add(`${theme.fg("muted", "Message:")} ${theme.fg("text", details.message)}`);
        if (details.branch) add(`${theme.fg("muted", "Branch:")} ${theme.fg("text", details.branch)}`);
        if (details.upstream) add(`${theme.fg("muted", "Upstream:")} ${theme.fg("text", details.upstream)}`);
        if (details.note) add(`${theme.fg("muted", "Note:")} ${theme.fg("text", details.note)}`);
        add("");
        add(theme.fg("muted", "This will run:"));
        for (const command of details.commands) add(`  ${theme.fg("accent", command)}`);

        if (details.status) {
          add("");
          add(theme.fg("muted", "Current changes:"));
          for (const line of details.status.split("\n")) {
            const statusCode = line.slice(0, 2);
            const filePath = line.slice(3);
            add(`  ${theme.fg(statusColorKey(line), statusCode)} ${theme.fg("text", filePath)}`);
          }
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

        cachedLines = renderBox(theme, width, details.title, contentLines);
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

async function runCommit(pi: ExtensionAPI, ctx: ExtensionCommandContext, message: string) {
  const addResult = await git(pi, ["add", "-A"], ctx.cwd);
  if (addResult.code !== 0) {
    ctx.ui.notify(addResult.stderr.trim() || "git add failed", "error");
    return false;
  }

  const stagedStatus = await getStatus(pi, ctx.cwd);
  if (!stagedStatus) {
    ctx.ui.notify("No git changes to commit after staging", "info");
    return false;
  }

  const commitResult = await git(pi, ["commit", "-m", message], ctx.cwd);
  if (commitResult.code !== 0) {
    ctx.ui.notify(outputText(commitResult) || "git commit failed", "error");
    return false;
  }

  return true;
}

async function commitChanges(pi: ExtensionAPI, ctx: ExtensionCommandContext, message: string) {
  await ctx.waitForIdle();

  if (!(await ensureGitRepository(pi, ctx, "commit"))) return;

  const initialStatus = await getStatus(pi, ctx.cwd);
  if (!initialStatus) {
    ctx.ui.notify("No git changes to commit", "info");
    return;
  }

  const confirmed = await confirmGitAction(ctx, {
    title: "Commit Changes",
    confirmLabel: "Yes, commit",
    message,
    commands: [
      formatCommand("git", ["add", "-A"]),
      formatCommand("git", ["commit", "-m", message]),
    ],
    status: initialStatus,
  });

  if (!confirmed) {
    ctx.ui.notify("Commit cancelled", "info");
    return;
  }

  if (await runCommit(pi, ctx, message)) {
    ctx.ui.notify("Committed changes", "info");
  }
}

async function yeetChanges(pi: ExtensionAPI, ctx: ExtensionCommandContext, message: string) {
  await ctx.waitForIdle();

  if (!(await ensureGitRepository(pi, ctx, "yeet"))) return;

  const status = await getStatus(pi, ctx.cwd);
  if (status && !message) {
    ctx.ui.notify("Usage: /yeet [message]\nProvide a message when there are changes to commit.", "error");
    return;
  }

  const branch = await getCurrentBranch(pi, ctx.cwd);
  if (!branch) {
    ctx.ui.notify("/yeet cannot push from a detached HEAD", "error");
    return;
  }

  const upstream = await getUpstream(pi, ctx.cwd);
  if (!upstream && !(await hasOriginRemote(pi, ctx.cwd))) {
    ctx.ui.notify("Current branch has no upstream and no origin remote is configured", "error");
    return;
  }

  const pushArgs = upstream ? ["push"] : ["push", "-u", "origin", branch];
  const commands = [
    ...(status
      ? [
          formatCommand("git", ["add", "-A"]),
          formatCommand("git", ["commit", "-m", message]),
        ]
      : []),
    formatCommand("git", pushArgs),
  ];

  const confirmed = await confirmGitAction(ctx, {
    title: "Yeet Changes",
    confirmLabel: status ? "Yes, commit and push" : "Yes, push",
    message: status ? message : undefined,
    branch,
    upstream: upstream ?? "origin/${branch} (will set upstream)",
    commands,
    status: status || undefined,
    note: status ? undefined : "No working tree changes; this will push only.",
  });

  if (!confirmed) {
    ctx.ui.notify("Yeet cancelled", "info");
    return;
  }

  if (status && !(await runCommit(pi, ctx, message))) return;

  const pushResult = await git(pi, pushArgs, ctx.cwd);
  if (pushResult.code !== 0) {
    ctx.ui.notify(outputText(pushResult) || "git push failed", "error");
    return;
  }

  ctx.ui.notify(outputText(pushResult) || "Pushed changes", "info");
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

  pi.registerCommand("yeet", {
    description: "Commit and push current git changes. Usage: /yeet [message]",
    handler: async (args, ctx) => {
      try {
        await yeetChanges(pi, ctx, args.trim());
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}
