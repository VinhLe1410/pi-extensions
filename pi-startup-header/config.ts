import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface SettingsPackageObject {
  source?: unknown;
}

export interface PackageEntry {
  label: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

function readJsonFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readSettings(): Record<string, unknown> {
  return readJsonFile(join(agentDir(), "settings.json"));
}

function formatPackage(entry: unknown): PackageEntry | null {
  if (typeof entry === "string") return { label: entry };
  if (!isRecord(entry)) return null;

  const config = entry as SettingsPackageObject;
  if (typeof config.source !== "string") return null;

  return { label: config.source };
}

export function loadExternalPackages(): PackageEntry[] {
  const settings = readSettings();
  const packages = settings.packages;
  if (!Array.isArray(packages)) return [];
  return packages.map(formatPackage).filter((pkg): pkg is PackageEntry => pkg !== null);
}

export function loadLocalPackages(): PackageEntry[] {
  const extensionsPackage = readJsonFile(join(agentDir(), "extensions", "package.json"));
  const workspaces = extensionsPackage.workspaces;
  if (!Array.isArray(workspaces)) return [];
  return workspaces
    .filter((workspace): workspace is string => typeof workspace === "string")
    .map((workspace) => ({ label: workspace }));
}
