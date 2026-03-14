import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface PackagedStudioPaths {
  readonly packageRoot: string;
  readonly studioRoot: string;
  readonly serverEntryPath: string;
  readonly clientRoot: string;
}

export function getCliPackageRoot(): string {
  return path.resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export function getStudioHostScriptPath(): string {
  const packageRoot = getCliPackageRoot();
  const distHostPath = path.join(packageRoot, "dist", "studio-host.js");

  if (existsSync(distHostPath)) {
    return distHostPath;
  }

  return path.join(packageRoot, "src", "studio-host.ts");
}

export async function resolvePackagedStudioPaths(): Promise<PackagedStudioPaths | null> {
  const packageRoot = getCliPackageRoot();
  const studioRoot = path.join(packageRoot, "studio");
  const serverEntryPath = path.join(studioRoot, "server", "server.js");
  const clientRoot = path.join(studioRoot, "client");

  if (!(await pathExists(serverEntryPath)) || !(await pathExists(clientRoot))) {
    return null;
  }

  return {
    packageRoot,
    studioRoot,
    serverEntryPath,
    clientRoot,
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}
