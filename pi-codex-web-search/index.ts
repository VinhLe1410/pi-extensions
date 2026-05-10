import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Box, Container, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const WEB_SEARCH_TOOL_NAME = "web_search";
const WEB_SEARCH_UNSUPPORTED_MESSAGE = "web_search is only available with the openai-codex provider";
const WEB_SEARCH_LOCAL_EXECUTION_MESSAGE =
  "web_search is a native openai-codex provider tool and should not execute locally";
const WEB_SEARCH_MULTIMODAL_CONTENT_TYPES = ["text", "image"] as const;
const WEB_SEARCH_ACTIVITY_MESSAGE_TYPE = "codex-native-web-search-activity";
const WEB_SEARCH_INCLUDE_FIELDS = ["web_search_call.action.sources", "web_search_call.results"] as const;

const WEB_SEARCH_PARAMETERS = Type.Unsafe<Record<string, never>>({
  type: "object",
  additionalProperties: false,
});

interface FunctionToolPayload {
  type?: unknown;
  name?: unknown;
}

interface ResponsesPayload {
  tools?: unknown[];
  [key: string]: unknown;
}

interface ResponsesWebSearchTool {
  type: "web_search";
  external_web_access: true;
  search_content_types?: string[];
}

interface StreamEventShape {
  type?: unknown;
  item?: unknown;
}

interface SurfacedWebSearch {
  callId: string;
  status?: string;
  query?: string;
  queries: string[];
  sources: Array<{ title?: string; url: string }>;
}

interface WebSocketLike {
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState?: number;
}

interface WebSocketConstructorLike {
  new (url: string | URL, protocols?: unknown): WebSocketLike;
  prototype: unknown;
}

function isOpenAICodexModel(model: ExtensionContext["model"]): boolean {
  return model?.provider === "openai-codex";
}

function supportsMultimodalNativeWebSearch(model: ExtensionContext["model"]): boolean {
  if (!isOpenAICodexModel(model)) return false;
  return !(model?.id ?? "").toLowerCase().includes("spark");
}

function isWebSearchFunctionTool(tool: unknown): tool is FunctionToolPayload {
  return (
    typeof tool === "object" &&
    tool !== null &&
    (tool as FunctionToolPayload).type === "function" &&
    (tool as FunctionToolPayload).name === WEB_SEARCH_TOOL_NAME
  );
}

function rewriteNativeWebSearchTool(
  payload: unknown,
  model: ExtensionContext["model"],
): unknown {
  if (!isOpenAICodexModel(model) || typeof payload !== "object" || payload === null) {
    return payload;
  }

  const tools = (payload as ResponsesPayload).tools;
  if (!Array.isArray(tools)) return payload;

  let rewritten = false;
  const nextTools = tools.map((tool) => {
    if (!isWebSearchFunctionTool(tool)) return tool;

    rewritten = true;
    const nativeTool: ResponsesWebSearchTool = {
      type: "web_search",
      external_web_access: true,
    };
    if (supportsMultimodalNativeWebSearch(model)) {
      nativeTool.search_content_types = [...WEB_SEARCH_MULTIMODAL_CONTENT_TYPES];
    }
    return nativeTool;
  });

  if (!rewritten) return payload;

  const include = Array.isArray((payload as ResponsesPayload).include)
    ? [...((payload as ResponsesPayload).include as unknown[])]
    : [];
  for (const field of WEB_SEARCH_INCLUDE_FIELDS) {
    if (!include.includes(field)) include.push(field);
  }

  return {
    ...(payload as ResponsesPayload),
    tools: nextTools,
    include,
  };
}

function emptyComponent(): Container {
  return new Container();
}

function createWebSearchTool(): ToolDefinition<typeof WEB_SEARCH_PARAMETERS> {
  const description =
    "Search the web for sources relevant to the current task. Use it when you need up-to-date information, external references, or broader context beyond the workspace.";

  return {
    name: WEB_SEARCH_TOOL_NAME,
    label: WEB_SEARCH_TOOL_NAME,
    description,
    promptSnippet: description,
    parameters: WEB_SEARCH_PARAMETERS,
    prepareArguments: () => ({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      if (!isOpenAICodexModel(ctx.model)) {
        throw new Error(WEB_SEARCH_UNSUPPORTED_MESSAGE);
      }
      throw new Error(WEB_SEARCH_LOCAL_EXECUTION_MESSAGE);
    },
    renderCall(_args, theme) {
      return new Text(`${theme.fg("toolTitle", theme.bold(WEB_SEARCH_TOOL_NAME))}`, 0, 0);
    },
    renderResult(result, { expanded }, theme) {
      if (!expanded) return emptyComponent();
      const textBlock = result.content.find((item) => item.type === "text");
      const text = textBlock?.type === "text" ? textBlock.text : "(no output)";
      return new Text(theme.fg("dim", text), 0, 0);
    },
  };
}

function syncWebSearchTool(pi: ExtensionAPI, ctx: ExtensionContext): void {
  const activeTools = pi.getActiveTools();
  const hasWebSearch = activeTools.includes(WEB_SEARCH_TOOL_NAME);

  if (isOpenAICodexModel(ctx.model)) {
    if (!hasWebSearch) {
      pi.setActiveTools([...activeTools, WEB_SEARCH_TOOL_NAME]);
    }
    return;
  }

  if (hasWebSearch) {
    pi.setActiveTools(activeTools.filter((toolName) => toolName !== WEB_SEARCH_TOOL_NAME));
  }
}

function extractWebSearch(event: StreamEventShape): SurfacedWebSearch | undefined {
  if (event.type !== "response.output_item.done") return undefined;
  if (!event.item || typeof event.item !== "object") return undefined;

  const item = event.item as Record<string, unknown>;
  if (item.type !== "web_search_call") return undefined;

  const callId = typeof item.id === "string" ? item.id : undefined;
  if (!callId) return undefined;

  const action = typeof item.action === "object" && item.action !== null
    ? (item.action as Record<string, unknown>)
    : undefined;
  const query = typeof action?.query === "string" ? action.query : undefined;
  const queries = Array.isArray(action?.queries)
    ? action.queries.filter((value): value is string => typeof value === "string")
    : [];
  const sourceUrls = Array.isArray(action?.sources)
    ? action.sources
        .map((source) => (typeof source === "object" && source !== null ? (source as Record<string, unknown>) : undefined))
        .map((source) => (typeof source?.url === "string" ? source.url : undefined))
        .filter((url): url is string => typeof url === "string")
    : [];

  const results = Array.isArray(item.results)
    ? item.results
        .map((result) => (typeof result === "object" && result !== null ? (result as Record<string, unknown>) : undefined))
        .filter((result): result is Record<string, unknown> => !!result)
    : [];

  const titledSources: Array<{ title?: string; url: string }> = [];
  for (const result of results) {
    if (typeof result.url !== "string") continue;
    titledSources.push({
      title: typeof result.title === "string" ? result.title : undefined,
      url: result.url,
    });
  }

  const seenUrls = new Set<string>();
  const sources: Array<{ title?: string; url: string }> = [];
  for (const source of titledSources) {
    if (seenUrls.has(source.url)) continue;
    seenUrls.add(source.url);
    sources.push(source);
  }
  for (const url of sourceUrls) {
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    sources.push({ url });
  }

  return {
    callId,
    status: typeof item.status === "string" ? item.status : undefined,
    query,
    queries,
    sources,
  };
}

function getSearchQueries(search: SurfacedWebSearch): string[] {
  return search.queries.length > 0 ? search.queries : search.query ? [search.query] : [];
}

function buildWebSearchSummaryText(search: SurfacedWebSearch | undefined): string {
  if (!search) return "web_search";
  const query = getSearchQueries(search)[0];
  const sourceText = search.sources.length === 1 ? "1 source" : `${search.sources.length} sources`;
  return query ? `web_search: ${query} (${sourceText})` : `web_search (${sourceText})`;
}

function buildWebSearchActivityMessage(search: SurfacedWebSearch): string {
  const lines = ["Web search"];
  const queries = getSearchQueries(search);

  if (search.status) {
    lines.push(`Status: ${search.status}`);
  }
  if (queries.length > 0) {
    lines.push("Queries:");
    for (const query of queries) {
      lines.push(`- ${query}`);
    }
  }
  if (search.sources.length > 0) {
    lines.push("Sources:");
    for (const source of search.sources.slice(0, 8)) {
      lines.push(`- ${source.title ? `${source.title} — ` : ""}${source.url}`);
    }
  }

  return lines.join("\n");
}

function inputToUrl(input: Parameters<typeof fetch>[0]): string | undefined {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof input === "object" && input !== null && "url" in input) {
    const url = (input as { url?: unknown }).url;
    return typeof url === "string" ? url : undefined;
  }
  return undefined;
}

function isCodexResponsesUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).pathname.replace(/\/+$/, "").endsWith("/codex/responses");
  } catch {
    return url.includes("/codex/responses");
  }
}

async function decodeWebSocketData(data: unknown): Promise<string | null> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(data));
  }
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  if (data && typeof data === "object" && "arrayBuffer" in data) {
    const arrayBuffer = await (data as { arrayBuffer(): Promise<ArrayBuffer> }).arrayBuffer();
    return new TextDecoder().decode(new Uint8Array(arrayBuffer));
  }
  return null;
}

async function captureSseWebSearches(
  response: Response,
  emitSearch: (search: SurfacedWebSearch) => void,
): Promise<void> {
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

      let index = buffer.indexOf("\n\n");
      while (index !== -1) {
        const chunk = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const data = chunk
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n")
          .trim();

        if (data && data !== "[DONE]") {
          try {
            const search = extractWebSearch(JSON.parse(data) as StreamEventShape);
            if (search) emitSearch(search);
          } catch {
            // Ignore malformed/incomplete capture data. The provider still owns
            // the real response stream and will surface protocol errors itself.
          }
        }

        index = buffer.indexOf("\n\n");
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

function installWebSearchCapture(pi: ExtensionAPI): () => void {
  let disposed = false;
  const cleanupFns: Array<() => void> = [];

  const emitSearch = (search: SurfacedWebSearch) => {
    if (disposed) return;
    pi.sendMessage(
      {
        customType: WEB_SEARCH_ACTIVITY_MESSAGE_TYPE,
        content: buildWebSearchActivityMessage(search),
        display: true,
        details: { search },
      },
      { triggerTurn: false },
    );
  };

  const originalFetch = globalThis.fetch;
  if (typeof originalFetch === "function") {
    const wrappedFetch: typeof fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      if (isCodexResponsesUrl(inputToUrl(input))) {
        try {
          const clonedResponse = response.clone();
          void captureSseWebSearches(clonedResponse, emitSearch).catch(() => {});
        } catch {
          // Response cloning is best-effort for display only.
        }
      }
      return response;
    };

    globalThis.fetch = wrappedFetch;
    cleanupFns.push(() => {
      if (globalThis.fetch === wrappedFetch) {
        globalThis.fetch = originalFetch;
      }
    });
  }

  const webSocketGlobal = globalThis as unknown as { WebSocket?: WebSocketConstructorLike };
  const OriginalWebSocket = webSocketGlobal.WebSocket;
  if (typeof OriginalWebSocket === "function") {
    const attachedSockets = new WeakSet<WebSocketLike>();

    const attachSocket = (socket: WebSocketLike, url: string | URL) => {
      if (!isCodexResponsesUrl(url.toString()) || attachedSockets.has(socket)) return;
      attachedSockets.add(socket);

      const onMessage = (event: unknown) => {
        void (async () => {
          if (disposed || typeof event !== "object" || event === null || !("data" in event)) return;

          const text = await decodeWebSocketData((event as { data?: unknown }).data);
          if (!text) return;

          try {
            const search = extractWebSearch(JSON.parse(text) as StreamEventShape);
            if (search) emitSearch(search);
          } catch {
            // Ignore display-capture parse failures. The provider's own parser
            // remains responsible for the actual model stream.
          }
        })();
      };
      const detach = () => {
        socket.removeEventListener("message", onMessage);
        socket.removeEventListener("close", detach);
      };

      socket.addEventListener("message", onMessage);
      socket.addEventListener("close", detach);
    };

    const WrappedWebSocket = function WebSearchCaptureWebSocket(
      this: unknown,
      url: string | URL,
      protocols?: unknown,
    ) {
      const socket = new OriginalWebSocket(url, protocols);
      attachSocket(socket, url);
      return socket;
    } as unknown as WebSocketConstructorLike;

    Object.setPrototypeOf(WrappedWebSocket, OriginalWebSocket);
    WrappedWebSocket.prototype = OriginalWebSocket.prototype;
    webSocketGlobal.WebSocket = WrappedWebSocket;

    cleanupFns.push(() => {
      if (webSocketGlobal.WebSocket === WrappedWebSocket) {
        webSocketGlobal.WebSocket = OriginalWebSocket;
      }
    });
  }

  return () => {
    disposed = true;
    for (const cleanup of cleanupFns.reverse()) cleanup();
  };
}

export default function piCodexWebSearch(pi: ExtensionAPI) {
  const uninstallWebSearchCapture = installWebSearchCapture(pi);

  pi.registerTool(createWebSearchTool());

  pi.on("session_start", async (_event, ctx) => {
    syncWebSearchTool(pi, ctx);
  });

  pi.on("session_shutdown", () => {
    uninstallWebSearchCapture();
  });

  pi.on("model_select", async (_event, ctx) => {
    syncWebSearchTool(pi, ctx);
  });

  pi.on("before_provider_request", async (event, ctx) => {
    const rewritten = rewriteNativeWebSearchTool(event.payload, ctx.model);
    return rewritten === event.payload ? undefined : rewritten;
  });

  pi.on("context", async (event) => ({
    messages: event.messages.filter(
      (message) => !(message.role === "custom" && message.customType === WEB_SEARCH_ACTIVITY_MESSAGE_TYPE),
    ),
  }));

  pi.registerMessageRenderer<{ search?: SurfacedWebSearch }>(WEB_SEARCH_ACTIVITY_MESSAGE_TYPE, (message, options, theme) => {
    const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
    const search = message.details?.search;
    box.addChild(new Text(theme.fg("customMessageLabel", theme.bold(buildWebSearchSummaryText(search))), 0, 0));

    if (options.expanded) {
      const content = typeof message.content === "string"
        ? message.content
        : message.content
            .filter((item) => item.type === "text")
            .map((item) => item.text)
            .join("\n");
      box.addChild(new Text(`\n${theme.fg("customMessageText", content)}`, 0, 0));
    }

    return box;
  });
}
