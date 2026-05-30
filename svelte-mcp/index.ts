import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";

import { keyHint, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

type Activation = {
  active: boolean;
  projectRoot: string;
  reason: string;
  configPath?: string;
};

type SvelteMcpConfig = {
  enabled?: unknown;
};

type JsonRpcPending = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
};

type StartupResult = {
  client: McpClient;
  tools: McpTool[];
};

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

type McpToolResult = {
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
};

type BridgeState = {
  activation: Activation;
  commandPath?: string;
  client?: McpClient;
  registeredTools: string[];
  missingTools: string[];
  unexpectedTools: string[];
  startupError?: string;
};

const CONFIG_RELATIVE_PATH = join(".pi", "svelte-mcp.json");
const SVELTE_CONFIG_FILES = ["svelte.config.js", "svelte.config.ts", "svelte.config.mjs"];
const SVELTE_PACKAGES = new Set(["svelte", "@sveltejs/kit"]);
const EMPTY_INPUT_SCHEMA = { type: "object", properties: {} };
const REQUEST_TIMEOUT_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = parsePositiveInt(process.env.SVELTE_MCP_TOOL_TIMEOUT_MS) ?? 300_000;
const STARTUP_ATTEMPTS = 2;
const STARTUP_RETRY_DELAY_MS = 500;
const STDIO_BUFFER_LIMIT = 1024 * 1024;
const MALFORMED_STDOUT_LIMIT = 3;
const EXPECTED_MCP_TOOLS = new Map([
  ["get-documentation", "svelte_get_documentation"],
  ["list-sections", "svelte_list_sections"],
  ["playground-link", "svelte_playground_link"],
  ["svelte-autofixer", "svelte_autofixer"],
]);

function parentDir(path: string) {
  const parent = dirname(path);
  return parent === path ? undefined : parent;
}

function parsePositiveInt(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactDiagnostic(value: string, maxLength = 1000) {
  const text = value.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

function candidateDirs(startDir: string) {
  const dirs: string[] = [];
  const root = parse(startDir).root;
  let current = resolve(startDir);
  const home = homedir();

  while (true) {
    dirs.push(current);
    if (current === root || current === home) break;
    const parent = parentDir(current);
    if (!parent) break;
    current = parent;
  }

  return dirs;
}

function readConfig(path: string): SvelteMcpConfig | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SvelteMcpConfig;
  } catch {
    return undefined;
  }
}

function hasSvelteDependency(packageJsonPath: string) {
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;
    const sections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

    return sections.some((section) => {
      const deps = pkg[section];
      return Boolean(
        deps &&
          typeof deps === "object" &&
          [...SVELTE_PACKAGES].some((name) => Object.prototype.hasOwnProperty.call(deps, name)),
      );
    });
  } catch {
    return false;
  }
}

function pathEntries() {
  return (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":").filter(Boolean);
}

function commandExtensions() {
  return process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";") : [""];
}

function findCommandsOnPath(command: string) {
  const matches: string[] = [];

  for (const dir of pathEntries()) {
    for (const ext of commandExtensions()) {
      const candidate = join(dir, `${command}${ext}`);
      if (existsSync(candidate)) matches.push(candidate);
    }
  }

  return matches;
}

function safeRealpath(path: string) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function isPathInside(path: string, parent: string) {
  const resolvedPath = safeRealpath(path);
  const resolvedParent = safeRealpath(parent);
  const rel = relative(resolvedParent, resolvedPath);
  return rel === "" || (rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel));
}

function isProjectLocalCommand(commandPath: string, projectRoot: string) {
  const home = safeRealpath(homedir());
  const root = safeRealpath(projectRoot);
  return root !== home && isPathInside(commandPath, projectRoot);
}

function safeChildEnv(): NodeJS.ProcessEnv {
  const keep = ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "USER", "LOGNAME"];
  const env: NodeJS.ProcessEnv = {};

  for (const key of keep) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }

  return env;
}

function resolveNpmGlobalCommand(command: string, projectRoot: string) {
  const npm = findCommandsOnPath("npm").find((candidate) => !isProjectLocalCommand(candidate, projectRoot));
  if (!npm) return undefined;

  try {
    const prefix = execFileSync(npm, ["prefix", "-g"], {
      encoding: "utf8",
      env: safeChildEnv(),
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const binDir = process.platform === "win32" ? prefix : join(prefix, "bin");
    for (const ext of commandExtensions()) {
      const candidate = join(binDir, `${command}${ext}`);
      if (existsSync(candidate)) return candidate;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function resolveTrustedSvelteMcpCommand(projectRoot: string) {
  const globalCommand = resolveNpmGlobalCommand("svelte-mcp", projectRoot);
  if (globalCommand) return globalCommand;

  return findCommandsOnPath("svelte-mcp").find((candidate) => !isProjectLocalCommand(candidate, projectRoot));
}

function resolveActivation(startDir: string, env = process.env): Activation {
  const dirs = candidateDirs(startDir);
  const configDir = dirs.find((dir) => existsSync(join(dir, CONFIG_RELATIVE_PATH)));
  const configPath = configDir ? join(configDir, CONFIG_RELATIVE_PATH) : undefined;
  const config = configPath ? readConfig(configPath) : undefined;
  const detectedDir = dirs.find(
    (dir) =>
      SVELTE_CONFIG_FILES.some((file) => existsSync(join(dir, file))) ||
      hasSvelteDependency(join(dir, "package.json")),
  );
  const projectRoot = configDir ?? detectedDir ?? resolve(startDir);

  if (env.SVELTE_MCP === "0") {
    return { active: false, projectRoot, configPath, reason: "disabled by SVELTE_MCP=0" };
  }

  if (env.SVELTE_MCP === "1") {
    return { active: true, projectRoot, configPath, reason: "enabled by SVELTE_MCP=1" };
  }

  if (configPath && config) {
    if (config.enabled === true) {
      return { active: true, projectRoot, configPath, reason: `enabled by ${CONFIG_RELATIVE_PATH}` };
    }

    if (config.enabled === false) {
      return { active: false, projectRoot, configPath, reason: `disabled by ${CONFIG_RELATIVE_PATH}` };
    }

    return { active: false, projectRoot, configPath, reason: `${CONFIG_RELATIVE_PATH} must contain { "enabled": true|false }` };
  }

  if (configPath && !config) {
    return { active: false, projectRoot, configPath, reason: `invalid JSON in ${CONFIG_RELATIVE_PATH}` };
  }

  if (detectedDir) {
    return { active: true, projectRoot, reason: "auto-detected Svelte project" };
  }

  return { active: false, projectRoot, reason: "no Svelte project markers found" };
}

function commandCwd(ctx?: ExtensionCommandContext) {
  return ctx?.cwd ?? process.env.PI_WORKSPACE_DIR ?? process.env.PI_PROJECT_DIR ?? process.env.PWD ?? process.cwd();
}

function formatStatus(activation: Activation, bridge: BridgeState) {
  const commandPath = resolveTrustedSvelteMcpCommand(activation.projectRoot);
  const runningPid = bridge.client?.pid();
  const lines = [
    "Svelte MCP",
    `- Status: ${activation.active ? "active" : "disabled"}`,
    `- Bridge: ${runningPid ? "running" : bridge.startupError ? "failed" : bridge.activation.active ? "not running" : "disabled"}`,
    `- Project root: ${activation.projectRoot}`,
    `- Reason: ${activation.reason}`,
    `- Config: ${activation.configPath ?? "none"}`,
    `- svelte-mcp: ${commandPath ?? "trusted global command not found"}`,
    `- PID: ${runningPid ?? "none"}`,
    `- Registered tools: ${bridge.registeredTools.length ? bridge.registeredTools.join(", ") : "none"}`,
  ];

  if (bridge.missingTools.length) {
    lines.push(`- Missing tools: ${bridge.missingTools.join(", ")}`);
  }

  if (bridge.unexpectedTools.length) {
    lines.push(`- Ignored unexpected tools: ${bridge.unexpectedTools.join(", ")}`);
  }

  if (bridge.activation.projectRoot !== activation.projectRoot) {
    lines.push(`- Bridge startup root: ${bridge.activation.projectRoot}`);
    lines.push("- Restart required: run /reload to rebuild the bridge for this project root");
  }

  const lastExit = bridge.client?.lastExitReason();
  if (lastExit) {
    lines.push(`- Last runtime exit: ${compactDiagnostic(lastExit)}`);
  }

  const lastStderr = bridge.client?.lastStderr();
  if (lastStderr) {
    lines.push(`- Last stderr: ${compactDiagnostic(lastStderr)}`);
  }

  if (bridge.startupError) {
    lines.push(`- Startup error: ${compactDiagnostic(bridge.startupError)}`);
  }

  return lines.join("\n");
}

function mcpText(result: McpToolResult) {
  return (result.content ?? [])
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}

function compactSingleLine(value: string, maxLength = 140) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function summarizeArgs(args: unknown) {
  if (!args || typeof args !== "object") return "";
  try {
    const json = JSON.stringify(args);
    return json && json !== "{}" ? ` ${compactSingleLine(json, 100)}` : "";
  } catch {
    return "";
  }
}

function summarizeOutput(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "done";

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const firstLine = compactSingleLine(lines[0] ?? trimmed);
  const remaining = lines.length - 1;
  return remaining > 0 ? `${firstLine} (${remaining} more line${remaining === 1 ? "" : "s"})` : firstLine;
}

function textComponent(lastComponent: unknown) {
  return lastComponent instanceof Text ? lastComponent : new Text("", 0, 0);
}

class McpClient {
  private child?: ChildProcessWithoutNullStreams;
  private requestId = 0;
  private pending = new Map<number, JsonRpcPending>();
  private buffer = "";
  private stderr = "";
  private initialized = false;
  private shuttingDown = false;
  private reconnecting?: Promise<void>;
  private lastExit?: string;
  private malformedStdout = 0;

  constructor(
    private readonly command: string,
    private readonly cwd: string,
    private readonly env: NodeJS.ProcessEnv,
  ) {}

  pid() {
    return this.child?.pid;
  }

  lastStderr() {
    return this.stderr.trim();
  }

  lastExitReason() {
    return this.lastExit;
  }

  async connect() {
    if (this.child && this.initialized) return;
    if (this.shuttingDown) throw new Error("svelte-mcp is shutting down");

    if (!this.reconnecting) {
      this.reconnecting = this.connectFresh().finally(() => {
        this.reconnecting = undefined;
      });
    }

    await this.reconnecting;
  }

  async initialize() {
    await this.requestRaw("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      clientInfo: { name: "pi-svelte-mcp-extension", version: "1.0.0" },
    });
    this.notify("notifications/initialized", {});
    this.initialized = true;
  }

  async listTools() {
    await this.connect();
    const result = await this.requestRaw("tools/list", {});
    return Array.isArray(result?.tools) ? (result.tools as McpTool[]) : [];
  }

  async callTool(name: string, args: unknown) {
    await this.connect();
    return (await this.requestRaw("tools/call", { name, arguments: args ?? {} }, TOOL_CALL_TIMEOUT_MS)) as McpToolResult;
  }

  shutdown() {
    this.shuttingDown = true;
    const child = this.child;
    this.child = undefined;
    this.initialized = false;
    this.rejectPending(new Error("svelte-mcp stopped"));
    if (!child) return;

    try {
      child.stdin.end();
    } catch {
      // best effort
    }

    try {
      child.kill("SIGTERM");
    } catch {
      // best effort
    }

    setTimeout(() => {
      try {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      } catch {
        // best effort
      }
    }, 2_000).unref();
  }

  private start() {
    if (this.child) return;

    this.shuttingDown = false;
    this.buffer = "";
    this.malformedStdout = 0;
    const child = spawn(this.command, [], {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;

    child.stdout.on("data", (chunk) => this.onData(chunk));
    child.stderr.on("data", (chunk) => {
      this.stderr = `${this.stderr}${chunk.toString("utf8")}`.slice(-4000);
    });
    child.on("error", (error) => this.onExit(child, error instanceof Error ? error : new Error(String(error))));
    child.on("exit", (code, signal) => {
      const reason = code === null ? `svelte-mcp exited with signal ${signal}` : `svelte-mcp exited with code ${code}`;
      this.onExit(child, new Error(reason));
    });
  }

  private async connectFresh() {
    if (this.child) this.shutdown();
    this.start();
    await this.initialize();
  }

  private requestRaw(method: string, params: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<any> {
    if (!this.child) return Promise.reject(new Error("svelte-mcp is not running"));

    const child = this.child;
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timer = timeoutMs > 0
        ? setTimeout(() => {
            const error = new Error(`MCP request timed out: ${method}`);
            this.pending.delete(id);
            reject(error);
            if (this.child === child) {
              try {
                child.kill("SIGTERM");
              } catch {
                // best effort
              }
              this.onExit(child, error);
            }
          }, timeoutMs)
        : undefined;

      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n", (error) => {
        if (!error) return;
        this.pending.delete(id);
        if (timer) clearTimeout(timer);
        reject(error);
      });
    });
  }

  private notify(method: string, params: unknown) {
    this.child?.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  private onData(chunk: Buffer) {
    this.buffer += chunk.toString("utf8");
    if (this.buffer.length > STDIO_BUFFER_LIMIT) {
      this.failProtocol(`svelte-mcp stdout exceeded ${STDIO_BUFFER_LIMIT} bytes without a complete message`);
      return;
    }

    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line) continue;

      let message: any;
      try {
        message = JSON.parse(line);
        this.malformedStdout = 0;
      } catch {
        this.malformedStdout += 1;
        if (this.malformedStdout >= MALFORMED_STDOUT_LIMIT) {
          this.failProtocol("svelte-mcp emitted repeated malformed JSON on stdout");
          return;
        }
        continue;
      }

      if (typeof message.id !== "number") continue;
      const pending = this.pending.get(message.id);
      if (!pending) continue;

      this.pending.delete(message.id);
      if (pending.timer) clearTimeout(pending.timer);

      if (message.error) {
        pending.reject(new Error(JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  private failProtocol(message: string) {
    const child = this.child;
    const error = new Error(message);
    if (child) {
      try {
        child.kill("SIGTERM");
      } catch {
        // best effort
      }
      this.onExit(child, error);
    } else {
      this.lastExit = message;
      this.rejectPending(error);
    }
  }

  private onExit(child: ChildProcessWithoutNullStreams, error: Error) {
    if (this.child !== child) return;
    this.shutdownChild(error);
  }

  private shutdownChild(error: Error) {
    this.child = undefined;
    this.initialized = false;
    this.lastExit = error.message;
    this.rejectPending(error);
  }

  private rejectPending(error: Error) {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(error);
    }
  }
}

async function startBridge(pi: ExtensionAPI, activation: Activation): Promise<BridgeState> {
  const commandPath = resolveTrustedSvelteMcpCommand(activation.projectRoot);
  const bridge: BridgeState = { activation, commandPath, registeredTools: [], missingTools: [], unexpectedTools: [] };

  if (!activation.active) return bridge;
  if (!commandPath) {
    bridge.startupError = "trusted global svelte-mcp command not found";
    return bridge;
  }

  try {
    const { client, tools } = await startClientWithRetry(commandPath, activation.projectRoot);
    bridge.client = client;
    const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

    bridge.missingTools = [...EXPECTED_MCP_TOOLS.keys()].filter((name) => !toolsByName.has(name));
    bridge.unexpectedTools = tools.map((tool) => tool.name).filter((name) => !EXPECTED_MCP_TOOLS.has(name));

    for (const [mcpToolName, piToolName] of EXPECTED_MCP_TOOLS) {
      const tool = toolsByName.get(mcpToolName);
      if (!tool) continue;

      pi.registerTool({
        name: piToolName,
        label: piToolName,
        description: tool.description ?? `Svelte MCP tool: ${tool.name}`,
        parameters: (tool.inputSchema ?? EMPTY_INPUT_SCHEMA) as any,
        async execute(_toolCallId, params) {
          const result = await client.callTool(tool.name, params);
          const text = mcpText(result);
          if (result.isError) {
            throw new Error(text || `${tool.name} returned an error`);
          }

          return {
            content: [{ type: "text", text }],
            details: { mcpTool: tool.name },
          };
        },
        renderCall(args, theme, context) {
          const text = textComponent(context.lastComponent);
          text.setText(
            `${theme.fg("toolTitle", theme.bold(piToolName))} ${theme.fg("muted", tool.name)}${theme.fg("dim", summarizeArgs(args))}`,
          );
          return text;
        },
        renderResult(result, options, theme, context) {
          const text = textComponent(context.lastComponent);
          const output = mcpText(result);

          if (options.isPartial) {
            text.setText(theme.fg("warning", "Running Svelte MCP tool..."));
          } else if (options.expanded || context.isError) {
            const color = context.isError ? "error" : "toolOutput";
            text.setText(output ? `\n${theme.fg(color, output)}` : theme.fg("muted", "No output"));
          } else {
            text.setText(`${theme.fg("success", "✓")} ${theme.fg("muted", summarizeOutput(output))} (${keyHint("app.tools.expand", "to expand")})`);
          }

          return text;
        },
      });
      bridge.registeredTools.push(piToolName);
    }
  } catch (error) {
    bridge.startupError = error instanceof Error ? error.message : String(error);
    bridge.client = undefined;
  }

  return bridge;
}

async function startClientWithRetry(commandPath: string, projectRoot: string): Promise<StartupResult> {
  let lastError = "unknown startup failure";

  for (let attempt = 1; attempt <= STARTUP_ATTEMPTS; attempt += 1) {
    const client = new McpClient(commandPath, projectRoot, safeChildEnv());

    try {
      await client.connect();
      const tools = await client.listTools();
      return { client, tools };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      const stderr = client.lastStderr();
      if (stderr) lastError = `${lastError}: ${stderr}`;
      client.shutdown();
      if (attempt < STARTUP_ATTEMPTS) await sleep(STARTUP_RETRY_DELAY_MS);
    }
  }

  throw new Error(lastError);
}

export default async function svelteMcpExtension(pi: ExtensionAPI) {
  const startupActivation = resolveActivation(commandCwd(), process.env);
  const bridge = await startBridge(pi, startupActivation);

  pi.on("session_shutdown", async () => {
    bridge.client?.shutdown();
  });

  pi.registerCommand("svelte-mcp", {
    description: "Show Svelte MCP activation status",
    handler: async (_args, ctx) => {
      const activation = resolveActivation(commandCwd(ctx), process.env);
      ctx.ui.notify(formatStatus(activation, bridge), activation.active && !bridge.startupError ? "info" : "warning");
    },
  });
}
