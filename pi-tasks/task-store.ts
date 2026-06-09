import type { Task, TaskStatus } from "./types.ts";

function sortById(a: Task, b: Task): number {
  return Number(a.id) - Number(b.id);
}

export class TaskStore {
  private nextId = 1;
  private tasks = new Map<string, Task>();

  create(subject: string, description: string, activeForm?: string): Task {
    const now = Date.now();
    const task: Task = {
      id: String(this.nextId++),
      subject,
      description,
      status: "pending",
      activeForm,
      blocks: [],
      blockedBy: [],
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  list(): Task[] {
    return Array.from(this.tasks.values()).sort(sortById);
  }

  update(id: string, fields: {
    status?: TaskStatus | "deleted";
    subject?: string;
    description?: string;
    activeForm?: string;
    addBlocks?: string[];
    addBlockedBy?: string[];
  }): { task: Task | undefined; changedFields: string[]; warnings: string[] } {
    const task = this.tasks.get(id);
    if (!task) return { task: undefined, changedFields: [], warnings: [] };

    const changedFields: string[] = [];
    const warnings: string[] = [];

    if (fields.status === "deleted") {
      this.delete(id);
      return { task: undefined, changedFields: ["deleted"], warnings };
    }

    if (fields.status !== undefined) {
      task.status = fields.status;
      changedFields.push("status");
    }
    if (fields.subject !== undefined) {
      task.subject = fields.subject;
      changedFields.push("subject");
    }
    if (fields.description !== undefined) {
      task.description = fields.description;
      changedFields.push("description");
    }
    if (fields.activeForm !== undefined) {
      task.activeForm = fields.activeForm;
      changedFields.push("activeForm");
    }

    if (fields.addBlocks && fields.addBlocks.length > 0) {
      for (const targetId of fields.addBlocks) {
        if (!task.blocks.includes(targetId)) {
          task.blocks.push(targetId);
        }

        const target = this.tasks.get(targetId);
        if (target && !target.blockedBy.includes(id)) {
          target.blockedBy.push(id);
          target.updatedAt = Date.now();
        }

        if (targetId === id) {
          warnings.push(`#${id} blocks itself`);
        } else if (!target) {
          warnings.push(`#${targetId} does not exist`);
        } else if (target.blocks.includes(id)) {
          warnings.push(`cycle: #${id} and #${targetId} block each other`);
        }
      }
      changedFields.push("blocks");
    }

    if (fields.addBlockedBy && fields.addBlockedBy.length > 0) {
      for (const targetId of fields.addBlockedBy) {
        if (!task.blockedBy.includes(targetId)) {
          task.blockedBy.push(targetId);
        }

        const target = this.tasks.get(targetId);
        if (target && !target.blocks.includes(id)) {
          target.blocks.push(id);
          target.updatedAt = Date.now();
        }

        if (targetId === id) {
          warnings.push(`#${id} blocks itself`);
        } else if (!target) {
          warnings.push(`#${targetId} does not exist`);
        } else if (task.blocks.includes(targetId)) {
          warnings.push(`cycle: #${id} and #${targetId} block each other`);
        }
      }
      changedFields.push("blockedBy");
    }

    if (changedFields.length > 0) {
      task.updatedAt = Date.now();
    }

    return { task, changedFields, warnings };
  }

  delete(id: string): boolean {
    if (!this.tasks.has(id)) return false;
    this.tasks.delete(id);
    for (const task of this.tasks.values()) {
      task.blocks = task.blocks.filter(blockedId => blockedId !== id);
      task.blockedBy = task.blockedBy.filter(blockerId => blockerId !== id);
    }
    return true;
  }

  clearAll(): number {
    const count = this.tasks.size;
    this.tasks.clear();
    return count;
  }

  clearCompleted(): number {
    let count = 0;
    for (const [id, task] of this.tasks) {
      if (task.status === "completed") {
        this.tasks.delete(id);
        count++;
      }
    }

    if (count > 0) {
      const validIds = new Set(this.tasks.keys());
      for (const task of this.tasks.values()) {
        task.blocks = task.blocks.filter(blockedId => validIds.has(blockedId));
        task.blockedBy = task.blockedBy.filter(blockerId => validIds.has(blockerId));
      }
    }

    return count;
  }
}
