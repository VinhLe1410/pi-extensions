import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { CancellableLoader, Container, Spacer } from "@earendil-works/pi-tui";
import { UsageComponent } from "./src/UsageComponent";
import { clampLines } from "./src/formatting";
import { collectUsageData } from "./src/usage-data";
import type { UsageData } from "./src/types";

/**
 * /usage - Usage statistics dashboard
 *
 * Shows an inline view with usage stats grouped by provider.
 * - Tab cycles: Today → This Week → Last Week → All Time
 * - Arrow keys navigate providers
 * - Enter expands/collapses to show models
 */
export default function (pi: ExtensionAPI) {
  pi.registerCommand("usage", {
    description: "Show usage statistics dashboard",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      if (!ctx.hasUI) {
        return;
      }

      const data = await ctx.ui.custom<UsageData | null>(
        (tui, theme, _kb, done) => {
          const loader = new CancellableLoader(
            tui,
            (s: string) => theme.fg("accent", s),
            (s: string) => theme.fg("muted", s),
            "Loading Usage...",
          );
          let finished = false;
          const finish = (value: UsageData | null) => {
            if (finished) return;
            finished = true;
            loader.dispose();
            done(value);
          };

          loader.onAbort = () => finish(null);

          collectUsageData(loader.signal)
            .then(finish)
            .catch(() => finish(null));

          return loader;
        },
      );

      if (!data) {
        return;
      }

      await ctx.ui.custom<void>((tui, theme, _kb, done) => {
        const container = new Container();

        // Top border
        container.addChild(
          new DynamicBorder((s: string) => theme.fg("border", s)),
        );
        container.addChild(new Spacer(1));

        const usage = new UsageComponent(
          theme,
          data,
          () => tui.requestRender(),
          () => done(),
        );

        return {
          render: (w: number) => {
            const borderLines = clampLines(container.render(w), w);
            const usageLines = usage.render(w);
            const bottomBorder = theme.fg("border", "─".repeat(w));
            return clampLines(
              [...borderLines, ...usageLines, "", bottomBorder],
              w,
            );
          },
          invalidate: () => container.invalidate(),
          handleInput: (input: string) => usage.handleInput(input),
          dispose: () => {},
        };
      });
    },
  });
}
