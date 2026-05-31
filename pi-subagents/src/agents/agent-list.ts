import type { ResolvedAgentDefinition } from "./definitions.ts";
import { getEffectiveAgentDefinitions } from "./definitions.ts";

type SubagentSessionMode = "standalone" | "lineage-only" | "fork";

export interface AgentListEntry {
	name: string;
	source: "project" | "global";
	mode?: "interactive" | "background";
	sessionMode: SubagentSessionMode;
	async?: boolean;
	autoExit?: boolean;
	description?: string;
}

export type ResolveSubagentSessionMode = (
	agent: ResolvedAgentDefinition,
) => SubagentSessionMode;

export function getAgentListEntries(
	baseCwd: string,
	resolveSessionMode: ResolveSubagentSessionMode,
): AgentListEntry[] {
	return getEffectiveAgentDefinitions(baseCwd)
		.filter((agent) => agent.description?.trim())
		.map((agent) => ({
			name: agent.name,
			source: agent.source,
			mode: agent.mode,
			sessionMode: resolveSessionMode(agent),
			async: agent.async,
			autoExit: agent.autoExit,
			description: agent.description,
		}));
}

function getToolReturn(entry: AgentListEntry): "wait_here" | "later_message" {
	return entry.async === false ? "wait_here" : "later_message";
}

function getRunsAs(entry: AgentListEntry): "visible_terminal" | "hidden_process" {
	return entry.mode === "background" ? "hidden_process" : "visible_terminal";
}

function getContext(
	entry: AgentListEntry,
): "fresh_chat_needs_full_brief" | "copy_of_this_chat" {
	return entry.sessionMode === "fork" ? "copy_of_this_chat" : "fresh_chat_needs_full_brief";
}

function getCompletion(
	entry: AgentListEntry,
): "exits_automatically" | "human_or_agent_must_finish" {
	return entry.autoExit === false ? "human_or_agent_must_finish" : "exits_automatically";
}

export function renderAgentListReminder(
	entries: AgentListEntry[],
): string {
	const agentLines = entries.map((entry) => {
		return [
			`- \`${entry.name}\`: ${entry.description}`,
			`  tool_return: ${getToolReturn(entry)}`,
			`  runs_as: ${getRunsAs(entry)}`,
			`  context: ${getContext(entry)}`,
			`  completion: ${getCompletion(entry)}`,
		].join("\n");
	});
	const body = [
		"<subagent-capabilities>",
		"Available named sub-agent definitions. This is metadata for the subagent tool; follow the session's subagent usage policy when deciding whether to delegate.",
		"",
		"<subagent-roster>",
		agentLines.join("\n\n"),
		"</subagent-roster>",
		"",
		"<subagent-field-guide>",
		"- agent names are exact values for subagent.agent or children[].agent",
		"- tool_return: wait_here returns the child result in the tool call; later_message delivers it in a later parent turn",
		"- runs_as: visible_terminal opens a watched pane; hidden_process runs headlessly",
		"- context: fresh_chat_needs_full_brief starts clean; copy_of_this_chat starts from the parent transcript",
		"- completion: exits_automatically closes itself; human_or_agent_must_finish stays open until explicitly finished",
		"</subagent-field-guide>",
		"</subagent-capabilities>",
	].join("\n");
	return body;
}

export function getAgentListSignature(
	entries: AgentListEntry[],
): string {
	return JSON.stringify(
		entries.map((entry) => ({
			name: entry.name,
			source: entry.source,
			mode: entry.mode,
			sessionMode: entry.sessionMode,
			async: entry.async,
			autoExit: entry.autoExit,
			description: entry.description,
		})),
	);
}
