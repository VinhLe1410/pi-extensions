/**
 * Type definitions for the in-memory task tracker.
 */

export type TaskStatus = "pending" | "in_progress" | "completed";

export interface Task {
  id: string;
  subject: string;
  description: string;
  status: TaskStatus;
  activeForm?: string;
  blocks: string[];
  blockedBy: string[];
  createdAt: number;
  updatedAt: number;
}
