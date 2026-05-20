import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

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
  return result.stdout.trim();
}

async function commitChanges(pi: ExtensionAPI, ctx: ExtensionCommandContext, message: string) {
  await ctx.waitForIdle();

  if (!(await ensureGitRepository(pi, ctx))) return;

  const initialStatus = await getStatus(pi, ctx.cwd);
  if (!initialStatus) {
    ctx.ui.notify("No git changes to commit", "info");
    return;
  }

  const confirmed = await ctx.ui.confirm(
    "Commit changes?",
    [
      `Message: ${message}`,
      "",
      "This will run:",
      `  ${formatCommand("git", ["add", "-A"])}`,
      `  ${formatCommand("git", ["commit", "-m", message])}`,
      "",
      "Current changes:",
      initialStatus,
    ].join("\n"),
  );

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
