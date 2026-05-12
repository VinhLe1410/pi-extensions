import { basename } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const TITLE_LINES = [
  "  ██████╗  ██╗ ",
  "  ██╔══██╗ ██║ ",
  "  ██████╔╝ ██║ ",
  "  ██╔═══╝  ██║ ",
  "  ██║      ██║ ",
  "  ╚═╝      ╚═╝ ",
];

function center(text: string, width: number): string {
  const length = [...text].length;
  if (length >= width) return text;
  return `${" ".repeat(Math.floor((width - length) / 2))}${text}`;
}

function projectName(): string {
  return basename(process.cwd()) || "session";
}

function renderHeader(width: number, subtitle: string): string[] {
  return [
    "",
    ...TITLE_LINES.map((line) => center(line, width)),
    center(subtitle, width),
    "",
  ];
}

export default function (pi: ExtensionAPI) {
  let currentModelId = "no model selected";
  let requestRender: (() => void) | undefined;

  pi.on("session_start", (_event, ctx) => {
    currentModelId = ctx.model?.id ?? "no model selected";
    if (!ctx.hasUI) return;

    ctx.ui.setHeader((tui) => {
      requestRender = () => tui.requestRender();
      return {
        render(width: number): string[] {
          return renderHeader(width, `${currentModelId} · ${projectName()}`);
        },
        invalidate(): void {
          tui.requestRender();
        },
      };
    });
  });

  pi.on("model_select", (event) => {
    currentModelId = event.model.id;
    requestRender?.();
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setHeader(undefined);
    requestRender = undefined;
  });

  pi.registerCommand("startup-header", {
    description: "Enable the plain Pi startup header",
    handler: async (_args, ctx) => {
      currentModelId = ctx.model?.id ?? "no model selected";
      ctx.ui.setHeader((tui) => {
        requestRender = () => tui.requestRender();
        return {
          render(width: number): string[] {
            return renderHeader(width, `${currentModelId} · ${projectName()}`);
          },
          invalidate(): void {
            tui.requestRender();
          },
        };
      });
      ctx.ui.notify("Startup header enabled", "info");
    },
  });

  pi.registerCommand("startup-header-builtin", {
    description: "Restore Pi's built-in startup header",
    handler: async (_args, ctx) => {
      ctx.ui.setHeader(undefined);
      requestRender = undefined;
      ctx.ui.notify("Built-in header restored", "info");
    },
  });
}
