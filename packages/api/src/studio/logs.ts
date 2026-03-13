import { gunzipSync } from "node:zlib";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { StudioConfigDiscovery, StudioLogDiscovery, StudioLogFile, StudioLogStream } from "./types";

const ARCHIVE_NAME_PATTERN = /^log(?:\.error)?\..+\.ndjson(?:\.gz)?$/;

export async function discoverLogFiles(
  projectPath: string,
  config: StudioConfigDiscovery,
): Promise<StudioLogDiscovery> {
  const logDir = config.resolved.file.dir;
  const archiveDir = config.resolved.file.archiveDir;
  const [logDirExists, archiveDirExists] = await Promise.all([
    pathExists(logDir),
    pathExists(archiveDir),
  ]);

  const files = [
    ...(logDirExists ? await discoverActiveFiles(projectPath, logDir) : []),
    ...(archiveDirExists ? await discoverArchiveFiles(projectPath, archiveDir) : []),
  ].sort(compareLogFiles);

  return {
    logDir,
    archiveDir,
    logDirExists,
    archiveDirExists,
    files,
  };
}

export async function readLogFileText(
  filePath: string,
): Promise<{ text: string; bytes: number }> {
  const content = await readFile(filePath);
  const text = filePath.endsWith(".gz")
    ? gunzipSync(content).toString("utf8")
    : content.toString("utf8");

  return {
    text,
    bytes: Buffer.byteLength(text, "utf8"),
  };
}

export function inferLogStream(name: string): StudioLogStream {
  if (name.startsWith("log.error")) {
    return "error";
  }

  if (name.startsWith("log")) {
    return "combined";
  }

  return "unknown";
}

async function discoverActiveFiles(projectPath: string, logDir: string): Promise<StudioLogFile[]> {
  const candidates = ["log.ndjson", "log.error.ndjson"];
  const files: StudioLogFile[] = [];

  for (const fileName of candidates) {
    const absolutePath = path.join(logDir, fileName);

    if (!(await pathExists(absolutePath))) {
      continue;
    }

    files.push(await toStudioLogFile(projectPath, absolutePath, "active"));
  }

  return files;
}

async function discoverArchiveFiles(
  projectPath: string,
  archiveDir: string,
): Promise<StudioLogFile[]> {
  const entries = await readdir(archiveDir);
  const matches = entries.filter((entry) => ARCHIVE_NAME_PATTERN.test(entry));

  return Promise.all(
    matches.map((entry) => toStudioLogFile(projectPath, path.join(archiveDir, entry), "archive")),
  );
}

async function toStudioLogFile(
  projectPath: string,
  absolutePath: string,
  kind: StudioLogFile["kind"],
): Promise<StudioLogFile> {
  const fileStat = await stat(absolutePath);
  const name = path.basename(absolutePath);

  return {
    id: Buffer.from(absolutePath).toString("base64url"),
    absolutePath,
    relativePath: path.relative(projectPath, absolutePath) || name,
    name,
    kind,
    stream: inferLogStream(name),
    sizeBytes: fileStat.size,
    modifiedAt: fileStat.mtime.toISOString(),
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function compareLogFiles(left: StudioLogFile, right: StudioLogFile): number {
  if (left.kind !== right.kind) {
    return left.kind === "active" ? -1 : 1;
  }

  return new Date(right.modifiedAt).getTime() - new Date(left.modifiedAt).getTime();
}
