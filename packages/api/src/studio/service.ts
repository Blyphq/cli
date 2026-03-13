import { discoverStudioConfig } from "./config";
import { discoverLogFiles } from "./logs";
import { resolveStudioProject } from "./project";
import { queryLogs } from "./query";

import type {
  StudioConfigDiscovery,
  StudioLogDiscovery,
  StudioLogsPage,
  StudioLogsQueryInput,
  StudioMeta,
} from "./types";

export async function getStudioMeta(projectPath?: string): Promise<StudioMeta> {
  const project = await resolveStudioProject(projectPath);
  const config = await discoverStudioConfig(project);
  const logs = project.valid
    ? await discoverLogFiles(project.absolutePath, config)
    : emptyLogDiscovery(config);

  return {
    project,
    config,
    logs: {
      logDir: logs.logDir,
      archiveDir: logs.archiveDir,
      logDirExists: logs.logDirExists,
      archiveDirExists: logs.archiveDirExists,
      fileCount: logs.files.length,
      activeFileCount: logs.files.filter((file) => file.kind === "active").length,
      archiveFileCount: logs.files.filter((file) => file.kind === "archive").length,
    },
  };
}

export async function getStudioConfig(projectPath?: string): Promise<StudioConfigDiscovery> {
  const project = await resolveStudioProject(projectPath);
  return discoverStudioConfig(project);
}

export async function getStudioFiles(projectPath?: string): Promise<StudioLogDiscovery> {
  const project = await resolveStudioProject(projectPath);
  const config = await discoverStudioConfig(project);

  if (!project.valid) {
    return emptyLogDiscovery(config);
  }

  return discoverLogFiles(project.absolutePath, config);
}

export async function getStudioLogs(input: StudioLogsQueryInput): Promise<StudioLogsPage> {
  const files = await getStudioFiles(input.projectPath);
  return queryLogs({
    files: files.files,
    input,
  });
}

function emptyLogDiscovery(config: StudioConfigDiscovery): StudioLogDiscovery {
  return {
    logDir: config.resolved.file.dir,
    archiveDir: config.resolved.file.archiveDir,
    logDirExists: false,
    archiveDirExists: false,
    files: [],
  };
}
