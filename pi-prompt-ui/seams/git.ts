import { execFile } from "node:child_process";
import type { GitCache } from "../core/types";

const EMPTY_GIT_CACHE: GitCache = {
  branch: null,
  dirty: false,
  ahead: 0,
  behind: 0,
};

export interface GitState {
  refresh(): Promise<boolean>;
  current(): GitCache;
}

function parseGitStatus(output: string): GitCache {
  let branch: string | null = null;
  let dirty = false;
  let ahead = 0;
  let behind = 0;

  for (const line of output.split("\n")) {
    if (!line) continue;

    if (line.startsWith("# branch.head ")) {
      const head = line.slice("# branch.head ".length).trim();
      branch = head && head !== "(detached)" ? head : null;
      continue;
    }

    if (line.startsWith("# branch.ab ")) {
      const match = line.match(/^# branch\.ab \+(\d+) -(\d+)$/);
      if (match) {
        ahead = parseInt(match[1], 10) || 0;
        behind = parseInt(match[2], 10) || 0;
      }
      continue;
    }

    if (!line.startsWith("# ")) dirty = true;
  }

  return { branch, dirty, ahead, behind };
}

function sameGitCache(a: GitCache | null, b: GitCache | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.branch === b.branch &&
    a.dirty === b.dirty &&
    a.ahead === b.ahead &&
    a.behind === b.behind
  );
}

function readGitStatus(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["status", "--porcelain=v2", "--branch"],
      {
        encoding: "utf8",
        timeout: 1000,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

export function createGitState(): GitState {
  let cache: GitCache | null = null;

  return {
    async refresh(): Promise<boolean> {
      let next: GitCache | null = null;

      try {
        const status = await readGitStatus();
        next = parseGitStatus(status.trimEnd());
      } catch {
        next = null;
      }

      const changed = !sameGitCache(cache, next);
      cache = next;
      return changed;
    },
    current(): GitCache {
      return cache ?? EMPTY_GIT_CACHE;
    },
  };
}
