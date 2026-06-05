import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { UsageHeatmapComponent } from "./component.ts";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("usage", {
    description: "Show current-year assistant output token heatmap",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/usage requires interactive TUI mode", "error");
        return;
      }

      await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
        const component = new UsageHeatmapComponent(tui, theme, () =>
          done(undefined),
        );
        void component.refresh();
        return component;
      });
    },
  });
}
