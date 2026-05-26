import { assert, describe, it } from "../support/index.ts";
import { registerSubagentResumeTool } from "../../src/tools/resume-tool.ts";
import { registerSubagentCoreTools } from "../../src/tools/subagent-tools.ts";
import {
	SUBAGENT_RESUME_TOOL_NAME,
	SUBAGENT_TOOL_NAME,
} from "../../src/tools/tool-names.ts";

const theme = {
	fg(_tone: string, text: string) {
		return text;
	},
	bold(text: string) {
		return text;
	},
} as any;

const renderContext = { expanded: false } as any;

function renderComponentText(component: { render(width: number): string[] }): string {
	return component.render(160).join("\n");
}

function getSubagentTool() {
	const tools = new Map<string, any>();
	registerSubagentCoreTools(
		{
			registerTool(definition: { name: string }) {
				tools.set(definition.name, definition);
			},
		} as any,
		(name) => name === SUBAGENT_TOOL_NAME,
		{} as any,
	);
	return tools.get(SUBAGENT_TOOL_NAME);
}

function getResumeTool() {
	const tools = new Map<string, any>();
	registerSubagentResumeTool(
		{
			registerTool(definition: { name: string }) {
				tools.set(definition.name, definition);
			},
		} as any,
		(name) => name === SUBAGENT_RESUME_TOOL_NAME,
		{} as any,
	);
	return tools.get(SUBAGENT_RESUME_TOOL_NAME);
}

describe("subagent launch tool rendering", () => {
	it("renders single subagent launches without the task prompt", () => {
		const tool = getSubagentTool();
		const text = renderComponentText(
			tool.renderCall(
				{
					name: "auth-scout",
					title: "Auth implementation map",
					agent: "scout",
					task: [
						"Objective: inspect auth.",
						"",
						"Scope:",
						"- src/auth",
					].join("\n"),
				},
				theme,
				renderContext,
			),
		);

		assert.match(text, /Spawn auth-scout \(scout\)/);
		assert.doesNotMatch(text, /Objective: inspect auth/);
		assert.doesNotMatch(text, /Scope:/);
		assert.doesNotMatch(text, /to expand|ctrl\+o/);
	});

	it("renders multi-child subagent launches without child task prompts or blank separators", () => {
		const tool = getSubagentTool();
		const lines = tool.renderCall(
			{
				children: [
					{
						name: "auth-scout",
						title: "Auth implementation map",
						agent: "scout",
						task: "Find auth files.\n\nReturn concise findings.",
					},
					{
						name: "diff-reviewer",
						title: "Local diff review",
						agent: "reviewer",
						task: "Review the diff.\n\nCall out risks.",
					},
				],
			},
			theme,
			renderContext,
		).render(160);
		const text = lines.join("\n");

		assert.match(text, /Spawn 2 agents/);
		assert.match(text, /auth-scout \(scout\)/);
		assert.match(text, /diff-reviewer \(reviewer\)/);
		assert.doesNotMatch(text, /Find auth files/);
		assert.doesNotMatch(text, /Review the diff/);
		assert.doesNotMatch(text, /to expand|ctrl\+o/);
		assert.equal(lines.some((line: string) => line.trim() === ""), false);
	});

	it("renders subagent resume launches without the follow-up task prompt", () => {
		const tool = getResumeTool();
		const text = renderComponentText(
			tool.renderCall(
				{
					sessionFile: "/tmp/missing-session.jsonl",
					name: "auth-scout",
					agent: "scout",
					task: "Continue the investigation.\n\nFocus on auth routes.",
				},
				theme,
				renderContext,
			),
		);

		assert.match(text, /Resume auth-scout \(scout\)/);
		assert.doesNotMatch(text, /Continue the investigation/);
		assert.doesNotMatch(text, /Focus on auth routes/);
		assert.doesNotMatch(text, /to expand|ctrl\+o/);
	});
});
