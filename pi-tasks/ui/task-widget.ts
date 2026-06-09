import { truncateToWidth } from "@earendil-works/pi-tui";
import type { TaskStore } from "../task-store.ts";

export type Theme = {
  fg(color: string, text: string): string;
  bold(text: string): string;
  strikethrough(text: string): string;
};

export type UICtx = {
  setWidget(
    key: string,
    content: undefined | ((tui: any, theme: Theme) => { render(): string[]; invalidate(): void }),
    options?: { placement?: "aboveEditor" | "belowEditor" },
  ): void;
};

const SPINNER = ["✳", "✴", "✵", "✶", "✷", "✸", "✹", "✺", "✻", "✼", "✽"];
const MAX_VISIBLE_TASKS = 10;

export class TaskWidget {
  private uiCtx: UICtx | undefined;
  private widgetFrame = 0;
  private widgetInterval: ReturnType<typeof setInterval> | undefined;
  private activeTaskIds = new Set<string>();
  private tui: any | undefined;
  private widgetRegistered = false;

  constructor(private store: TaskStore) {}

  setUICtx(ctx: UICtx) {
    this.uiCtx = ctx;
  }

  setActiveTask(taskId: string | undefined, active = true) {
    if (taskId && active) {
      this.activeTaskIds.add(taskId);
      this.ensureTimer();
    } else if (taskId) {
      this.activeTaskIds.delete(taskId);
    }
    this.update();
  }

  private ensureTimer() {
    if (!this.widgetInterval) {
      this.widgetInterval = setInterval(() => this.update(), 150);
    }
  }

  private renderWidget(tui: any, theme: Theme): string[] {
    const tasks = this.store.list();
    const truncate = (line: string) => truncateToWidth(line, tui.terminal.columns);

    if (tasks.length === 0) return [];

    const completed = tasks.filter(task => task.status === "completed");
    const inProgress = tasks.filter(task => task.status === "in_progress");
    const pending = tasks.filter(task => task.status === "pending");

    const parts: string[] = [];
    if (completed.length > 0) parts.push(`${completed.length} done`);
    if (inProgress.length > 0) parts.push(`${inProgress.length} in progress`);
    if (pending.length > 0) parts.push(`${pending.length} open`);

    const lines = [
      truncate(theme.fg("accent", "●") + " " + theme.fg("accent", `${tasks.length} tasks (${parts.join(", ")})`)),
    ];

    const visible = tasks.slice(0, MAX_VISIBLE_TASKS);
    const hiddenCount = tasks.length - visible.length;
    const spinnerChar = SPINNER[this.widgetFrame % SPINNER.length];

    for (const task of visible) {
      const isActive = this.activeTaskIds.has(task.id) && task.status === "in_progress";

      let icon: string;
      if (isActive) {
        icon = theme.fg("accent", spinnerChar);
      } else if (task.status === "completed") {
        icon = theme.fg("success", "✔");
      } else if (task.status === "in_progress") {
        icon = theme.fg("accent", "◼");
      } else {
        icon = "◻";
      }

      let suffix = "";
      if (task.status === "pending" && task.blockedBy.length > 0) {
        const openBlockers = task.blockedBy.filter(blockerId => {
          const blocker = this.store.get(blockerId);
          return blocker && blocker.status !== "completed";
        });
        if (openBlockers.length > 0) {
          suffix = theme.fg("dim", ` › blocked by ${openBlockers.map(id => "#" + id).join(", ")}`);
        }
      }

      let text: string;
      if (isActive) {
        text = `  ${icon} ${theme.fg("dim", "#" + task.id)} ${theme.fg("accent", (task.activeForm || task.subject) + "…")}`;
      } else if (task.status === "completed") {
        text = `  ${icon} ${theme.fg("dim", theme.strikethrough("#" + task.id + " " + task.subject))}`;
      } else {
        text = `  ${icon} ${theme.fg("dim", "#" + task.id)} ${task.subject}`;
      }

      lines.push(truncate(text + suffix));
    }

    if (hiddenCount > 0) {
      lines.push(truncate(theme.fg("dim", `    … and ${hiddenCount} more`)));
    }

    return lines;
  }

  update() {
    if (!this.uiCtx) return;
    const tasks = this.store.list();

    if (tasks.length === 0) {
      this.activeTaskIds.clear();
      if (this.widgetRegistered) {
        this.uiCtx.setWidget("tasks", undefined);
        this.widgetRegistered = false;
      }
      if (this.widgetInterval) {
        clearInterval(this.widgetInterval);
        this.widgetInterval = undefined;
      }
      return;
    }

    for (const id of this.activeTaskIds) {
      const task = this.store.get(id);
      if (!task || task.status !== "in_progress") {
        this.activeTaskIds.delete(id);
      }
    }

    const hasActiveSpinner = tasks.some(task => this.activeTaskIds.has(task.id) && task.status === "in_progress");
    if (hasActiveSpinner) {
      this.ensureTimer();
    } else if (this.widgetInterval) {
      clearInterval(this.widgetInterval);
      this.widgetInterval = undefined;
    }

    this.widgetFrame++;

    if (!this.widgetRegistered) {
      this.uiCtx.setWidget("tasks", (tui, theme) => {
        this.tui = tui;
        return { render: () => this.renderWidget(tui, theme), invalidate: () => {} };
      }, { placement: "aboveEditor" });
      this.widgetRegistered = true;
    } else if (this.tui) {
      this.tui.requestRender();
    }
  }

  dispose() {
    if (this.widgetInterval) {
      clearInterval(this.widgetInterval);
      this.widgetInterval = undefined;
    }
    if (this.uiCtx) {
      this.uiCtx.setWidget("tasks", undefined);
    }
    this.widgetRegistered = false;
    this.tui = undefined;
  }
}
