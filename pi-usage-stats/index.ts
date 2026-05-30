import type {
  ExtensionAPI,
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  CancellableLoader,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { UsageComponent } from "./src/UsageComponent";
import { clampLines, padRight } from "./src/formatting";
import { collectUsageData } from "./src/usage-data";
import type { UsageData } from "./src/types";

function renderTopBorder(theme: Theme, width: number, title: string): string {
  const innerWidth = Math.max(0, width - 2);
  const titleText = truncateToWidth(` ${title} `, innerWidth);
  const titleWidth = visibleWidth(titleText);
  const left = Math.floor(Math.max(0, innerWidth - titleWidth) / 2);
  const right = Math.max(0, innerWidth - titleWidth - left);

  return (
    theme.fg("border", `╭${"─".repeat(left)}`) +
    theme.fg("accent", titleText) +
    theme.fg("border", `${"─".repeat(right)}╮`)
  );
}

function renderBox(
  theme: Theme,
  width: number,
  title: string,
  contentLines: string[],
): string[] {
  if (width < 2) return clampLines(contentLines, width);

  const innerWidth = width - 2;
  const lines = [renderTopBorder(theme, width, title)];

  for (const line of contentLines) {
    const content = padRight(truncateToWidth(line, innerWidth), innerWidth);
    lines.push(theme.fg("border", "│") + content + theme.fg("border", "│"));
  }

  lines.push(theme.fg("border", `╰${"─".repeat(innerWidth)}╯`));
  return clampLines(lines, width);
}

/**
 * /usage - Usage statistics dashboard
 *
 * Shows a centered overlay with usage stats grouped by model.
 * - Tab cycles: Today → This Week → This Month → All Time
 * - Arrow keys navigate/scroll models
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

      await ctx.ui.custom<void>(
        (tui, theme, _kb, done) => {
          const usage = new UsageComponent(
            theme,
            data,
            () => tui.terminal?.rows,
            () => tui.requestRender(),
            () => done(),
          );

          return {
            render: (w: number) =>
              renderBox(
                theme,
                w,
                usage.getTitle(),
                usage.render(Math.max(0, w - 2)),
              ),
            invalidate: () => usage.invalidate(),
            handleInput: (input: string) => usage.handleInput(input),
            dispose: () => {},
          };
        },
        {
          overlay: true,
          overlayOptions: {
            anchor: "center",
            width: "60%",
            minWidth: 80,
            maxHeight: "80%",
            margin: 2,
          },
        },
      );
    },
  });
}
