import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { TaskStore } from "./task-store.ts";
import { TaskWidget, type UICtx } from "./ui/task-widget.ts";

function textResult(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], details: undefined as any };
}

function openBlockers(store: TaskStore, blockedBy: string[]): string[] {
  return blockedBy.filter(blockerId => {
    const blocker = store.get(blockerId);
    return blocker && blocker.status !== "completed";
  });
}

function formatTaskState(store: TaskStore): string {
  const lines = store.list().map(task => {
    const blockers = openBlockers(store, task.blockedBy);
    const blockedText = blockers.length > 0
      ? ` ← blocked by ${blockers.map(id => "#" + id).join(", ")}`
      : "";
    return `#${task.id} ${task.status}${blockedText}`;
  });
  return lines.length > 0 ? `Tasks:\n${lines.join("\n")}` : "Tasks: none";
}

const AUTO_CLEAR_COMPLETED_LIST_DELAY_TURNS = 5;

const TASK_SYSTEM_PROMPT_APPEND = `

## Task tracking

Use TaskCreate for non-trivial multi-step work. Use TaskUpdate to mark tasks in_progress before starting and completed when done. Use TaskList and TaskGet to inspect current task state. Use addBlocks/addBlockedBy when task order matters. Skip task tools for trivial single-step requests.
`;

export default function (pi: ExtensionAPI) {
  const store = new TaskStore();
  const widget = new TaskWidget(store);
  let currentTurn = 0;
  let allCompletedAtTurn: number | undefined;

  const bindUI = (ctx: { ui: unknown }) => {
    widget.setUICtx(ctx.ui as UICtx);
    widget.update();
  };

  const updateCompletedListCountdown = () => {
    const tasks = store.list();
    if (tasks.length > 0 && tasks.every(task => task.status === "completed")) {
      allCompletedAtTurn ??= currentTurn;
    } else {
      allCompletedAtTurn = undefined;
    }
  };

  const resetCompletedListCountdown = () => {
    allCompletedAtTurn = undefined;
  };

  const clearCompletedListIfDue = () => {
    if (allCompletedAtTurn === undefined) return;

    const tasks = store.list();
    if (tasks.length === 0 || tasks.some(task => task.status !== "completed")) {
      allCompletedAtTurn = undefined;
      return;
    }

    if (currentTurn - allCompletedAtTurn >= AUTO_CLEAR_COMPLETED_LIST_DELAY_TURNS) {
      store.clearCompleted();
      allCompletedAtTurn = undefined;
    }
  };

  const afterTaskMutation = () => {
    updateCompletedListCountdown();
    widget.update();
  };

  pi.on("before_agent_start", async (event, ctx) => {
    bindUI(ctx);
    return { systemPrompt: event.systemPrompt + TASK_SYSTEM_PROMPT_APPEND };
  });
  pi.on("turn_start", async (_event, ctx) => {
    currentTurn++;
    clearCompletedListIfDue();
    bindUI(ctx);
  });
  pi.on("tool_execution_start", async (_event, ctx) => bindUI(ctx));
  pi.on("session_switch" as any, async (_event, ctx) => {
    store.clearAll();
    currentTurn = 0;
    resetCompletedListCountdown();
    bindUI(ctx);
  });

  pi.registerTool({
    name: "TaskCreate",
    label: "TaskCreate",
    description: `Create a task in the current in-memory task list.

Use this for multi-step work where visible progress tracking helps. Tasks start as pending. Use TaskUpdate to mark a task in_progress before starting it, completed when done, and to add dependency edges with addBlocks/addBlockedBy.

Fields:
- subject: brief imperative title
- description: detailed context and acceptance criteria
- activeForm: optional present-continuous text shown in the widget while in progress`,
    promptSnippet: "Create an in-memory task for non-trivial multi-step work",
    promptGuidelines: [
      "Use TaskCreate for non-trivial multi-step work that benefits from visible progress tracking.",
      "Do not use TaskCreate for trivial single-step requests.",
      "After TaskCreate, use TaskUpdate to set dependencies when task order matters.",
    ],
    parameters: Type.Object({
      subject: Type.String({ description: "A brief title for the task" }),
      description: Type.String({ description: "A detailed description of what needs to be done" }),
      activeForm: Type.Optional(Type.String({ description: "Present-continuous widget text when in progress, e.g. 'Running tests'" })),
    }),

    execute(_toolCallId, params) {
      const task = store.create(params.subject, params.description, params.activeForm);
      afterTaskMutation();
      return Promise.resolve(textResult(`Task #${task.id} created successfully: ${task.subject}`));
    },
  });

  pi.registerTool({
    name: "TaskList",
    label: "TaskList",
    description: `List all tasks with status and open blockers.

Tasks are grouped pending first, then in_progress, then completed. Pending tasks that have incomplete dependencies are shown as blocked.`,
    promptSnippet: "List current in-memory tasks, statuses, and open blockers",
    promptGuidelines: [
      "Use TaskList to inspect current task status before choosing what to work on next.",
    ],
    parameters: Type.Object({}),

    execute() {
      const tasks = store.list();
      if (tasks.length === 0) return Promise.resolve(textResult("No tasks found"));

      const statusOrder: Record<string, number> = { pending: 0, in_progress: 1, completed: 2 };
      const sorted = [...tasks].sort((a, b) => {
        const statusDelta = (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0);
        if (statusDelta !== 0) return statusDelta;
        return Number(a.id) - Number(b.id);
      });

      const lines = sorted.map(task => {
        let line = `#${task.id} [${task.status}] ${task.subject}`;
        const blockers = openBlockers(store, task.blockedBy);
        if (blockers.length > 0) {
          line += ` [blocked by ${blockers.map(id => "#" + id).join(", ")}]`;
        }
        return line;
      });

      return Promise.resolve(textResult(lines.join("\n")));
    },
  });

  pi.registerTool({
    name: "TaskGet",
    label: "TaskGet",
    description: "Get full details for a task, including dependency edges.",
    promptSnippet: "Get full details for one task and its dependency edges",
    promptGuidelines: [
      "Use TaskGet when you need a task's full description or dependency edges before updating it.",
    ],
    parameters: Type.Object({
      taskId: Type.String({ description: "The ID of the task to retrieve" }),
    }),

    execute(_toolCallId, params) {
      const task = store.get(params.taskId);
      if (!task) return Promise.resolve(textResult("Task not found"));

      const lines = [
        `Task #${task.id}: ${task.subject}`,
        `Status: ${task.status}`,
        `Description: ${task.description.replace(/\\n/g, "\n")}`,
      ];

      if (task.activeForm) {
        lines.push(`Active form: ${task.activeForm}`);
      }
      if (task.blockedBy.length > 0) {
        lines.push(`Blocked by: ${task.blockedBy.map(id => "#" + id).join(", ")}`);
      }
      if (task.blocks.length > 0) {
        lines.push(`Blocks: ${task.blocks.map(id => "#" + id).join(", ")}`);
      }

      return Promise.resolve(textResult(lines.join("\n")));
    },
  });

  pi.registerTool({
    name: "TaskUpdate",
    label: "TaskUpdate",
    description: `Update a task's status, text, active form, or dependency edges.

Status workflow:
- pending: not started
- in_progress: currently being worked on
- completed: finished
- deleted: remove the task entirely

Dependency fields are bidirectional:
- addBlocks: task IDs that cannot start until this task completes
- addBlockedBy: task IDs that must complete before this task can start`,
    promptSnippet: "Update task status, text, active form, or dependency edges",
    promptGuidelines: [
      "Use TaskUpdate to set status to in_progress before starting work on a task.",
      "Use TaskUpdate to set status to completed only when the task is fully done.",
      "Use TaskUpdate addBlocks/addBlockedBy when one task depends on another.",
    ],
    parameters: Type.Object({
      taskId: Type.String({ description: "The ID of the task to update" }),
      status: Type.Optional(Type.Unsafe<"pending" | "in_progress" | "completed" | "deleted">({
        type: "string",
        enum: ["pending", "in_progress", "completed", "deleted"],
        description: "New status for the task",
      })),
      subject: Type.Optional(Type.String({ description: "New subject for the task" })),
      description: Type.Optional(Type.String({ description: "New description for the task" })),
      activeForm: Type.Optional(Type.String({ description: "Present-continuous widget text when in progress" })),
      addBlocks: Type.Optional(Type.Array(Type.String(), { description: "Task IDs that this task blocks" })),
      addBlockedBy: Type.Optional(Type.Array(Type.String(), { description: "Task IDs that block this task" })),
    }),

    execute(_toolCallId, params) {
      const { taskId, ...fields } = params;
      const { task, changedFields, warnings } = store.update(taskId, fields);

      if (changedFields.length === 0 && !task) {
        return Promise.resolve(textResult(`Task #${taskId} not found`));
      }

      if (fields.status === "in_progress") {
        widget.setActiveTask(taskId);
      } else if (fields.status === "pending" || fields.status === "completed" || fields.status === "deleted") {
        widget.setActiveTask(taskId, false);
      }

      if (changedFields.length === 0) {
        return Promise.resolve(textResult(`No changes for task #${taskId}`));
      }

      afterTaskMutation();

      let msg = `Updated task #${taskId} ${changedFields.join(", ")}`;
      if (warnings.length > 0) {
        msg += ` (warning: ${warnings.join("; ")})`;
      }
      return Promise.resolve(textResult(`${msg}\n\n${formatTaskState(store)}`));
    },
  });

  pi.registerCommand("tasks", {
    description: "Manage in-memory tasks",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const ui = ctx.ui;
      bindUI(ctx);

      const mainMenu = async (): Promise<void> => {
        const tasks = store.list();
        const taskCount = tasks.length;
        const completedCount = tasks.filter(task => task.status === "completed").length;

        const choices = [`View all tasks (${taskCount})`, "Create task"];
        if (completedCount > 0) choices.push(`Clear completed (${completedCount})`);
        if (taskCount > 0) choices.push(`Clear all (${taskCount})`);

        const choice = await ui.select("Tasks", choices);
        if (!choice) return;

        if (choice.startsWith("View")) {
          await viewTasks();
        } else if (choice === "Create task") {
          await createTask();
        } else if (choice.startsWith("Clear completed")) {
          store.clearCompleted();
          afterTaskMutation();
          await mainMenu();
        } else if (choice.startsWith("Clear all")) {
          store.clearAll();
          afterTaskMutation();
          await mainMenu();
        }
      };

      const viewTasks = async (): Promise<void> => {
        const tasks = store.list();
        if (tasks.length === 0) {
          await ui.select("No tasks", ["← Back"]);
          return mainMenu();
        }

        const statusIcon = (status: string) => {
          switch (status) {
            case "completed": return "✔";
            case "in_progress": return "◼";
            default: return "◻";
          }
        };

        const choices = tasks.map(task => {
          const blockers = openBlockers(store, task.blockedBy);
          const blockedText = blockers.length > 0
            ? ` [blocked by ${blockers.map(id => "#" + id).join(", ")}]`
            : "";
          return `${statusIcon(task.status)} #${task.id} [${task.status}] ${task.subject}${blockedText}`;
        });
        choices.push("← Back");

        const selected = await ui.select("Tasks", choices);
        if (!selected || selected === "← Back") return mainMenu();

        const match = selected.match(/#(\d+)/);
        if (match) await viewTaskDetail(match[1]);
        else return viewTasks();
      };

      const viewTaskDetail = async (taskId: string): Promise<void> => {
        const task = store.get(taskId);
        if (!task) return viewTasks();

        const actions: string[] = [];
        if (task.status === "pending") actions.push("▸ Start (in_progress)");
        if (task.status === "in_progress") actions.push("✓ Complete");
        actions.push("✗ Delete", "← Back");

        const details = [
          `#${task.id} [${task.status}] ${task.subject}`,
          task.description,
        ];
        if (task.blockedBy.length > 0) details.push(`Blocked by: ${task.blockedBy.map(id => "#" + id).join(", ")}`);
        if (task.blocks.length > 0) details.push(`Blocks: ${task.blocks.map(id => "#" + id).join(", ")}`);

        const action = await ui.select(details.join("\n"), actions);

        if (action === "▸ Start (in_progress)") {
          store.update(taskId, { status: "in_progress" });
          widget.setActiveTask(taskId);
          afterTaskMutation();
          return viewTasks();
        } else if (action === "✓ Complete") {
          store.update(taskId, { status: "completed" });
          widget.setActiveTask(taskId, false);
          afterTaskMutation();
          return viewTasks();
        } else if (action === "✗ Delete") {
          store.update(taskId, { status: "deleted" });
          widget.setActiveTask(taskId, false);
          afterTaskMutation();
          return viewTasks();
        }

        return viewTasks();
      };

      const createTask = async (): Promise<void> => {
        const subject = await ui.input("Task subject");
        if (!subject) return mainMenu();
        const description = await ui.input("Task description");
        if (!description) return mainMenu();

        store.create(subject, description);
        afterTaskMutation();
        return mainMenu();
      };

      await mainMenu();
    },
  });
}
