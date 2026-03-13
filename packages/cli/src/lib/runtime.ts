import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

interface WorkspaceManifest {
  readonly name?: string;
  readonly workspaces?: unknown;
}

export interface RuntimeInfo {
  readonly cwd: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly runtime: {
    readonly name: string;
    readonly bunVersion: string | null;
    readonly nodeVersion: string | null;
  };
  readonly workspaceRoot: string | null;
  readonly webAppPath: string | null;
}

export async function collectRuntimeInfo(cwd: string): Promise<RuntimeInfo> {
  const workspaceRoot = await resolveWorkspaceRoot(cwd);
  const webAppPath = workspaceRoot
    ? await resolveIfExists(path.join(workspaceRoot, "apps", "web", "package.json"))
    : null;

  return {
    cwd,
    platform: process.platform,
    arch: process.arch,
    runtime: {
      name: process.versions.bun ? "bun" : process.release.name,
      bunVersion: process.versions.bun ?? null,
      nodeVersion: process.versions.node ?? null,
    },
    workspaceRoot,
    webAppPath,
  };
}

export function formatRuntimeSummary(info: RuntimeInfo): string {
  const lines = [
    `Current working directory: ${info.cwd}`,
    `Platform: ${info.platform} (${info.arch})`,
    `Runtime: ${info.runtime.name}`,
    `Node version: ${info.runtime.nodeVersion ?? "unavailable"}`,
    `Bun version: ${info.runtime.bunVersion ?? "unavailable"}`,
    `Workspace root: ${info.workspaceRoot ?? "not found"}`,
    `Web app package: ${info.webAppPath ?? "not found"}`,
  ];

  return lines.join("\n");
}

export async function resolveWorkspaceRoot(
  startDirectory: string,
): Promise<string | null> {
  let currentDirectory = path.resolve(startDirectory);
  const rootDirectory = path.parse(currentDirectory).root;

  while (true) {
    const manifestPath = path.join(currentDirectory, "package.json");
    const manifest = await readWorkspaceManifest(manifestPath);

    if (manifest?.workspaces && manifest.name === "blyp-cli") {
      return currentDirectory;
    }

    if (currentDirectory === rootDirectory) {
      return null;
    }

    currentDirectory = path.dirname(currentDirectory);
  }
}

export async function resolveWebAppDir(cwd: string): Promise<string | null> {
  const workspaceRoot = await resolveWorkspaceRoot(cwd);

  if (!workspaceRoot) {
    return null;
  }

  const webAppPackagePath = path.join(workspaceRoot, "apps", "web", "package.json");
  const existingPackagePath = await resolveIfExists(webAppPackagePath);

  if (!existingPackagePath) {
    return null;
  }

  return path.dirname(existingPackagePath);
}

export function getStudioUrl(): string {
  return "http://localhost:3001/";
}

async function readWorkspaceManifest(
  manifestPath: string,
): Promise<WorkspaceManifest | null> {
  try {
    const contents = await readFile(manifestPath, "utf8");
    return JSON.parse(contents) as WorkspaceManifest;
  } catch {
    return null;
  }
}

async function resolveIfExists(targetPath: string): Promise<string | null> {
  try {
    await access(targetPath, fsConstants.F_OK);
    return targetPath;
  } catch {
    return null;
  }
}

export function getDefaultCwd(): string {
  return process.cwd();
}
