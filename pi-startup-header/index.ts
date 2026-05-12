import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { renderHeader } from "./render";

export default function (pi: ExtensionAPI) {
  let currentModelId = "no model selected";
  let requestRender: (() => void) | undefined;

  function installHeader(ctx: ExtensionContext): void {
    currentModelId = ctx.model?.id ?? "no model selected";
    ctx.ui.setHeader((tui, theme) => {
      requestRender = () => tui.requestRender();
      return {
        render(width: number): string[] {
          return renderHeader(width, theme, pi, currentModelId);
        },
        invalidate(): void {
          tui.requestRender();
        },
      };
    });
  }

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    installHeader(ctx);
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
    description: "Enable the custom Pi startup dashboard",
    handler: async (_args, ctx) => {
      installHeader(ctx);
      ctx.ui.notify("Startup dashboard enabled", "info");
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
