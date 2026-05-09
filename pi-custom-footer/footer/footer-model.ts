import type { AssistantMessage } from "@earendil-works/pi-ai";
import { buildSessionContext } from "@earendil-works/pi-coding-agent";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { GitCache } from "../core/types";

interface ContextInfo {
  percentage: number;
  used: number;
  total: number;
}

interface BranchInfo {
  name: string;
  dirty: boolean;
  ahead: number;
  behind: number;
}

interface FooterModelConfig {
  showCwd: boolean;
  showBranch: boolean;
  fastMode: boolean;
  cwd: string;
  homeDir?: string;
}

export interface FooterModel {
  location: {
    cwd: string;
    branch: BranchInfo | null;
  };
  model: {
    name: string;
    thinkingLevel: string;
    fastMode: boolean;
  };
  context: {
    percentage: number;
    used: number;
    total: number;
  };
}

function getThinkingLevel(
  context: ReturnType<typeof buildSessionContext>,
): string {
  return context.thinkingLevel || "off";
}

function getContextInfo(
  context: ReturnType<typeof buildSessionContext>,
  contextWindow: number,
): ContextInfo {
  if (contextWindow === 0) return { percentage: 0, used: 0, total: 0 };

  const messages = context.messages;

  const lastAssistant = messages
    .slice()
    .reverse()
    .find(
      (message): message is AssistantMessage =>
        message.role === "assistant" && message.stopReason !== "aborted",
    );

  const usage = lastAssistant?.usage;
  if (!usage) return { percentage: 0, used: 0, total: contextWindow };

  const contextTokens =
    (usage.input ?? 0) +
    (usage.output ?? 0) +
    (usage.cacheRead ?? 0) +
    (usage.cacheWrite ?? 0);

  return {
    percentage: (contextTokens / contextWindow) * 100,
    used: contextTokens,
    total: contextWindow,
  };
}

function compactPath(path: string, homeDir: string | undefined): string {
  if (!homeDir || !path.startsWith(homeDir)) return path;
  return `~${path.slice(homeDir.length)}`;
}

export function buildFooterModel(
  ctx: ExtensionContext,
  git: GitCache,
  config: FooterModelConfig,
): FooterModel {
  const entries = ctx.sessionManager.getEntries();
  const leafId = ctx.sessionManager.getLeafId();
  const sessionContext = buildSessionContext(entries, leafId);
  const contextInfo = getContextInfo(
    sessionContext,
    ctx.model?.contextWindow ?? 0,
  );
  const thinkingLevel = ctx.model?.reasoning
    ? getThinkingLevel(sessionContext)
    : "off";
  const modelName = ctx.model?.id?.split("/").pop() || "no-model";
  const branch: BranchInfo | null =
    config.showBranch && git.branch
      ? {
          name: git.branch,
          dirty: git.dirty,
          ahead: git.ahead,
          behind: git.behind,
        }
      : null;
  const cwd = config.showCwd ? compactPath(config.cwd, config.homeDir) : "";

  return {
    location: {
      cwd,
      branch,
    },
    model: {
      name: modelName,
      thinkingLevel,
      fastMode: config.fastMode,
    },
    context: {
      percentage: contextInfo.percentage,
      used: contextInfo.used,
      total: contextInfo.total,
    },
  };
}
