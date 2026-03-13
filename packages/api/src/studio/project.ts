import { stat } from "node:fs/promises";
import path from "node:path";

import type { StudioProjectResolution } from "./types";

export async function resolveStudioProject(
  requestedPath?: string,
): Promise<StudioProjectResolution> {
  const envPath = process.env.BLYPQ_STUDIO_TARGET;
  const rawPath = requestedPath ?? envPath ?? process.cwd();
  const resolvedFrom = requestedPath
    ? "input"
    : envPath
      ? "env"
      : "cwd";
  const absolutePath = path.resolve(process.cwd(), rawPath);

  try {
    const stats = await stat(absolutePath);
    const isDirectory = stats.isDirectory();

    return {
      requestedPath: requestedPath ?? null,
      resolvedFrom,
      absolutePath,
      exists: true,
      isDirectory,
      valid: isDirectory,
      error: isDirectory ? null : "Resolved project path is not a directory.",
    };
  } catch {
    return {
      requestedPath: requestedPath ?? null,
      resolvedFrom,
      absolutePath,
      exists: false,
      isDirectory: false,
      valid: false,
      error: "Resolved project path does not exist.",
    };
  }
}
