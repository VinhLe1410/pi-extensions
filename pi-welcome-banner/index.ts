import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { MIN_BANNER_WIDTH, WelcomeBannerComponent } from "./src/component.ts";
import { shouldRenderForSession } from "./src/session-gate.ts";

const EMPTY_HEADER: Component = {
  render: () => [],
  invalidate: () => {},
};

export default function (pi: ExtensionAPI) {
  let banner: WelcomeBannerComponent | undefined;

  function disposeBanner(): void {
    banner?.dispose();
    banner = undefined;
  }

  pi.on("session_start", async (event, ctx) => {
    if (ctx.mode !== "tui") return;

    disposeBanner();
    if (!shouldRenderForSession(event.reason, ctx.sessionManager.getEntries())) return;

    ctx.ui.setHeader((tui, theme) => {
      if (tui.terminal.columns < MIN_BANNER_WIDTH) return EMPTY_HEADER;

      disposeBanner();
      banner = new WelcomeBannerComponent(tui, theme, {
        expanded: true,
      });
      return banner;
    });
  });

  pi.on("agent_start", async () => {
    banner?.collapse();
  });

  pi.on("session_shutdown", async () => {
    disposeBanner();
  });

  pi.registerCommand("welcome", {
    description: "Replay the Pi welcome banner",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/welcome requires interactive TUI mode", "error");
        return;
      }

      if (!banner) {
        ctx.ui.notify("Welcome banner is not mounted", "warning");
        return;
      }

      banner.replay();
    },
  });
}
