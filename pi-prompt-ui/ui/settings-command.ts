import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { type SettingItem, SettingsList, truncateToWidth } from "@earendil-works/pi-tui";
import {
  type ExtensionStatusPlacement,
  type PromptUiConfig,
  getExtensionStatusPlacement,
  isExtensionStatusPlacement,
} from "../core/config";
import { sanitizeExtensionStatusText } from "./extension-status";

const extensionStatusPlacementValues: ExtensionStatusPlacement[] = [
  "off",
  "left",
  "middle",
  "right",
];

type SettingsCommandDeps = {
  getConfig: () => PromptUiConfig;
  getActiveExtensionStatuses: () => ReadonlyMap<string, string>;
  setExtensionStatusPlacement: (key: string, placement: ExtensionStatusPlacement) => void;
  requestRender: () => void;
};

function buildStatusItems(
  config: PromptUiConfig,
  activeStatuses: ReadonlyMap<string, string>,
): SettingItem[] {
  return Array.from(activeStatuses.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      const sanitizedText = sanitizeExtensionStatusText(value);
      return {
        id: key,
        label: key,
        description: sanitizedText ? `Current status: ${sanitizedText}` : undefined,
        currentValue: getExtensionStatusPlacement(config, key),
        values: extensionStatusPlacementValues,
      };
    });
}

export function registerPromptUiSettingsCommand(
  pi: ExtensionAPI,
  deps: SettingsCommandDeps,
): void {
  pi.registerCommand("prompt-ui", {
    description: "Configure prompt UI footer status placement",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
        const settingsListTheme = getSettingsListTheme();
        const buildList = () =>
          new SettingsList(
            buildStatusItems(deps.getConfig(), deps.getActiveExtensionStatuses()),
            8,
            settingsListTheme,
            (key, newValue) => {
              if (!isExtensionStatusPlacement(newValue)) return;

              try {
                deps.setExtensionStatusPlacement(key, newValue);
                settingsList.updateValue(key, newValue);
                deps.requestRender();
                ctx.ui.notify(`Extension status ${key}: ${newValue}`, "info");
                tui.requestRender();
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                ctx.ui.notify(`Could not update prompt UI settings: ${message}`, "error");
              }
            },
            () => done(undefined),
          );

        const settingsList = buildList();

        return {
          render(width: number) {
            const border = theme.fg("borderMuted", "─".repeat(Math.max(0, width)));
            const activeCount = deps.getActiveExtensionStatuses().size;
            const empty = activeCount === 0;
            return [
              truncateToWidth(border, width, ""),
              truncateToWidth(theme.fg("accent", theme.bold("Prompt UI settings")), width, ""),
              truncateToWidth(
                theme.fg("muted", "Move active ctx.ui.setStatus() footer statuses"),
                width,
                "",
              ),
              "",
              ...(empty
                ? [
                    truncateToWidth(theme.fg("muted", "No third-party statuses are active."), width, ""),
                    truncateToWidth(
                      theme.fg("muted", "This menu only lists statuses currently published."),
                      width,
                      "",
                    ),
                  ]
                : settingsList.render(width)),
              "",
              truncateToWidth(theme.fg("muted", "Enter/Space cycles values · Esc closes"), width, ""),
              truncateToWidth(border, width, ""),
            ];
          },
          invalidate() {
            settingsList.invalidate();
          },
          handleInput(data: string) {
            if (deps.getActiveExtensionStatuses().size === 0) {
              if (data === "\x1b" || data === "\u0003") done(undefined);
              return;
            }
            settingsList.handleInput(data);
          },
        };
      });
    },
  });
}
