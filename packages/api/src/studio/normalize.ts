import { resolveRecordSourceLocation } from "./source";

import type { StudioHttpDetails, StudioLogFile, StudioNormalizedRecord, StudioRecordSource } from "./types";

interface NormalizeRecordOptions {
  file: StudioLogFile;
  lineNumber: number;
  rawLine: string;
  parsed: unknown;
  projectPath?: string;
}

export async function normalizeRecord({
  file,
  lineNumber,
  rawLine,
  parsed,
  projectPath,
}: NormalizeRecordOptions): Promise<StudioNormalizedRecord> {
  const malformed = !isPlainObject(parsed);
  const objectRecord = isPlainObject(parsed) ? parsed : {};
  const message = getMessage(objectRecord, rawLine, malformed);
  const timestamp = getOptionalString(objectRecord.timestamp) ?? null;
  const level = getOptionalString(objectRecord.level) ?? "unknown";
  const type = getOptionalString(objectRecord.type) ?? null;
  const http = inferHttpDetails(objectRecord);
  const source = inferSource(objectRecord, http);
  const bindings = isPlainObject(objectRecord.bindings)
    ? (sanitizeForTransport(objectRecord.bindings) as Record<string, unknown>)
    : null;
  const caller = getOptionalString(objectRecord.caller) ?? null;
  const error = sanitizeForTransport(objectRecord.error ?? null);
  const stack = resolveRecordStack(objectRecord);
  const sourceResolution = projectPath
    ? await resolveRecordSourceLocation(projectPath, { caller, stack })
    : null;

  return {
    id: `${file.id}:${lineNumber}`,
    timestamp,
    level,
    message,
    source,
    type,
    caller,
    bindings,
    data: sanitizeForTransport(objectRecord.data),
    fileId: file.id,
    fileName: file.name,
    filePath: file.absolutePath,
    lineNumber,
    malformed,
    http,
    error,
    stack,
    sourceLocation:
      sourceResolution?.status === "resolved" ? sourceResolution.location : null,
    raw: malformed ? { rawLine } : sanitizeForTransport(parsed),
  };
}

export function serializeForSearch(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function inferSource(record: Record<string, unknown>, http: StudioHttpDetails | null): StudioRecordSource {
  if (getOptionalString(record.source) === "client" || getOptionalString(record.type) === "client_log") {
    return "client";
  }

  if (http) {
    return "http";
  }

  if (Array.isArray(record.events) || typeof record.groupId === "string") {
    return "structured";
  }

  if (Object.keys(record).length === 0) {
    return "unknown";
  }

  return "server";
}

export function inferHttpDetails(record: Record<string, unknown>): StudioHttpDetails | null {
  const type = getOptionalString(record.type) ?? null;
  const method = getOptionalString(record.method) ?? null;
  const url = getOptionalString(record.url) ?? null;
  const path = getOptionalString(record.path) ?? url;
  const statusCode = getOptionalNumber(record.statusCode) ?? getOptionalNumber(record.status) ?? null;
  const durationMs = getOptionalNumber(record.responseTime) ?? getOptionalNumber(record.duration) ?? null;
  const isFrameworkHttp = type === "http_request" || type === "http_error";
  const isStructuredHttp =
    method !== null &&
    (statusCode !== null || durationMs !== null) &&
    (path !== null || url !== null);

  if (!isFrameworkHttp && !isStructuredHttp) {
    return null;
  }

  return {
    kind: isFrameworkHttp ? "framework-http" : "structured-http",
    method,
    path,
    statusCode,
    durationMs,
    url,
    type,
    hostname: getOptionalString(record.hostname) ?? null,
    ip: getOptionalString(record.ip) ?? null,
    userAgent: getOptionalString(record.userAgent) ?? null,
    error: record.error ?? null,
  };
}

function getMessage(
  record: Record<string, unknown>,
  rawLine: string,
  malformed: boolean,
): string {
  const value = getOptionalString(record.message);

  if (value) {
    return value;
  }

  if (malformed) {
    return rawLine;
  }

  return "Unknown log record";
}

export function resolveRecordStack(record: Record<string, unknown>): string | null {
  const topLevelStack = getOptionalString(record.stack);

  if (topLevelStack) {
    return topLevelStack;
  }

  if (isPlainObject(record.error)) {
    return getOptionalString(record.error.stack) ?? null;
  }

  return null;
}

function getOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeForTransport(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): unknown {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "function" || typeof value === "symbol") {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    const serializedError: Record<string, unknown> = {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    };

    for (const [key, nested] of Object.entries(value)) {
      serializedError[key] = sanitizeForTransport(nested, seen, depth + 1);
    }

    return serializedError;
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  if (depth >= 8) {
    return "[MaxDepth]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForTransport(item, seen, depth + 1));
  }

  const serialized: Record<string, unknown> = {};

  for (const [key, nested] of Object.entries(value)) {
    serialized[key] = sanitizeForTransport(nested, seen, depth + 1);
  }

  return serialized;
}
