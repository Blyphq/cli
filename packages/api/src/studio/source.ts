import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type {
  StudioNormalizedRecord,
  StudioResolvedSourceLocation,
  StudioSourceContext,
  StudioSourceUnavailableReason,
} from "./types";

const SUPPORTED_SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);
const MAX_SOURCE_FILE_BYTES = 250 * 1024;
const SOURCE_CONTEXT_BEFORE_LINES = 12;
const SOURCE_CONTEXT_AFTER_LINES = 12;

interface SourceCandidate {
  pathText: string;
  line: number;
  column: number | null;
  origin: StudioResolvedSourceLocation["origin"];
}

type SourceLocationResolution =
  | {
      status: "resolved";
      location: StudioResolvedSourceLocation;
    }
  | {
      status: "unavailable";
      reason: StudioSourceUnavailableReason;
    };

export async function resolveRecordSourceContext(
  projectPath: string,
  record: StudioNormalizedRecord,
): Promise<StudioSourceContext> {
  const resolution = await resolveRecordSourceLocation(projectPath, record);

  if (resolution.status === "unavailable") {
    return createUnavailableSourceContext(resolution.reason);
  }

  return readSourceContext(resolution.location);
}

export async function resolveRecordSourceLocation(
  projectPath: string,
  record: Pick<StudioNormalizedRecord, "caller" | "stack">,
): Promise<SourceLocationResolution> {
  const candidates = [
    ...parseStackCandidates(record.stack),
    ...parseCallerCandidates(record.caller),
  ];

  if (!record.stack && !record.caller) {
    return {
      status: "unavailable",
      reason: "no_location",
    };
  }

  if (candidates.length === 0) {
    return {
      status: "unavailable",
      reason: "no_project_frame",
    };
  }

  let firstReason: StudioSourceUnavailableReason | null = null;

  for (const candidate of candidates) {
    const normalized = await normalizeSourceCandidate(projectPath, candidate);

    if (normalized.status === "resolved") {
      return normalized;
    }

    firstReason ??= normalized.reason;
  }

  return {
    status: "unavailable",
    reason: firstReason ?? "no_project_frame",
  };
}

export function createUnavailableSourceContext(
  reason: StudioSourceUnavailableReason,
): StudioSourceContext {
  return {
    status: "unavailable",
    reason,
    location: null,
    startLine: null,
    endLine: null,
    focusLine: null,
    language: null,
    snippet: null,
  };
}

export function parseStackCandidates(stack: string | null): SourceCandidate[] {
  if (!stack) {
    return [];
  }

  const candidates: SourceCandidate[] = [];

  for (const line of stack.split("\n").slice(1)) {
    const candidate = parseStackLine(line);

    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

export function parseCallerCandidates(caller: string | null): SourceCandidate[] {
  if (!caller) {
    return [];
  }

  const parsed = parsePathWithOptionalLine(caller.trim(), "caller");
  return parsed ? [parsed] : [];
}

export async function readSourceContext(
  location: StudioResolvedSourceLocation,
): Promise<StudioSourceContext> {
  try {
    const fileStat = await stat(location.absolutePath);

    if (!fileStat.isFile()) {
      return createUnavailableSourceContext("file_missing");
    }

    if (fileStat.size > MAX_SOURCE_FILE_BYTES) {
      return createUnavailableSourceContext("file_too_large");
    }
  } catch {
    return createUnavailableSourceContext("file_missing");
  }

  try {
    const content = await readFile(location.absolutePath, "utf8");
    const lines = content.split(/\r?\n/);
    const startLine = Math.max(1, location.line - SOURCE_CONTEXT_BEFORE_LINES);
    const endLine = Math.min(lines.length, location.line + SOURCE_CONTEXT_AFTER_LINES);
    const snippet = lines.slice(startLine - 1, endLine).join("\n");

    return {
      status: "resolved",
      reason: null,
      location,
      startLine,
      endLine,
      focusLine: location.line,
      language: inferSourceLanguage(location.absolutePath),
      snippet,
    };
  } catch {
    return createUnavailableSourceContext("read_failed");
  }
}

function parseStackLine(line: string): SourceCandidate | null {
  const trimmed = line.trim();

  if (!trimmed.startsWith("at ")) {
    return null;
  }

  const parenthesizedMatch = trimmed.match(/\((.+:\d+(?::\d+)?)\)$/);
  if (parenthesizedMatch?.[1]) {
    return parsePathWithOptionalLine(parenthesizedMatch[1], "stack");
  }

  const directMatch = trimmed.match(/^at\s+(.+:\d+(?::\d+)?)$/);
  if (directMatch?.[1]) {
    return parsePathWithOptionalLine(directMatch[1], "stack");
  }

  return null;
}

function parsePathWithOptionalLine(
  value: string,
  origin: StudioResolvedSourceLocation["origin"],
): SourceCandidate | null {
  const trimmed = value.trim();

  if (!trimmed || trimmed.startsWith("unknown:")) {
    return null;
  }

  const fileUrlMatch = trimmed.match(/^(file:\/\/.+\.[A-Za-z0-9]+):(\d+)(?::(\d+))?$/);
  if (fileUrlMatch?.[1] && fileUrlMatch[2]) {
    const decodedPath = decodeFileUrlPath(fileUrlMatch[1]);

    if (!decodedPath) {
      return null;
    }

    return {
      pathText: decodedPath,
      line: Number(fileUrlMatch[2]),
      column: fileUrlMatch[3] ? Number(fileUrlMatch[3]) : null,
      origin,
    };
  }

  const pathMatch = trimmed.match(/^(.*\.[A-Za-z0-9]+):(\d+)(?::(\d+))?$/);

  if (!pathMatch?.[1] || !pathMatch[2]) {
    return null;
  }

  return {
    pathText: pathMatch[1],
    line: Number(pathMatch[2]),
    column: pathMatch[3] ? Number(pathMatch[3]) : null,
    origin,
  };
}

async function normalizeSourceCandidate(
  projectPath: string,
  candidate: SourceCandidate,
): Promise<SourceLocationResolution> {
  const normalizedPath = normalizeFilesystemPath(candidate.pathText, projectPath);

  if (!normalizedPath) {
    return {
      status: "unavailable",
      reason: "no_project_frame",
    };
  }

  if (normalizedPath.includes(`${path.sep}node_modules${path.sep}`)) {
    return {
      status: "unavailable",
      reason: "node_modules",
    };
  }

  const relativePath = path.relative(projectPath, normalizedPath);

  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return {
      status: "unavailable",
      reason: "outside_project",
    };
  }

  if (!SUPPORTED_SOURCE_EXTENSIONS.has(path.extname(normalizedPath))) {
    return {
      status: "unavailable",
      reason: "unsupported_extension",
    };
  }

  try {
    const targetStat = await stat(normalizedPath);

    if (!targetStat.isFile()) {
      return {
        status: "unavailable",
        reason: "file_missing",
      };
    }
  } catch {
    return {
      status: "unavailable",
      reason: "file_missing",
    };
  }

  return {
    status: "resolved",
    location: {
      absolutePath: normalizedPath,
      relativePath: relativePath || path.basename(normalizedPath),
      line: candidate.line,
      column: candidate.column,
      origin: candidate.origin,
    },
  };
}

function normalizeFilesystemPath(
  candidatePath: string,
  projectPath: string,
): string | null {
  const trimmed = candidatePath.trim();

  if (!trimmed) {
    return null;
  }

  const withoutWindowsDriveSlash = trimmed.replace(/^\/([A-Za-z]:[\\/])/, "$1");
  const absolutePath = path.isAbsolute(withoutWindowsDriveSlash)
    ? withoutWindowsDriveSlash
    : path.resolve(projectPath, withoutWindowsDriveSlash);

  return path.normalize(absolutePath);
}

function decodeFileUrlPath(rawUrl: string): string | null {
  try {
    return decodeURIComponent(new URL(rawUrl).pathname);
  } catch {
    return null;
  }
}

function inferSourceLanguage(filePath: string): string | null {
  switch (path.extname(filePath)) {
    case ".ts":
    case ".mts":
    case ".cts":
      return "ts";
    case ".tsx":
      return "tsx";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "js";
    case ".jsx":
      return "jsx";
    default:
      return null;
  }
}
