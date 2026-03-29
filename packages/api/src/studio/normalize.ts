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
  const timestamp = getTimestamp(objectRecord);
  const level = getLevel(objectRecord.level);
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
  const nestedData = isPlainObject(record.data) ? record.data : null;
  const nestedBindings = isPlainObject(record.bindings) ? record.bindings : null;
  const nestedHttp =
    isPlainObject(record.http) ? record.http : isPlainObject(record.request) ? record.request : null;
  const method =
    getOptionalString(record.method) ??
    getNestedOptionalString(nestedHttp, ["method"]) ??
    getNestedOptionalString(nestedData, ["method", "request.method", "http.method"]) ??
    getNestedOptionalString(nestedBindings, ["method", "request.method", "http.method"]) ??
    null;
  const url =
    getOptionalString(record.url) ??
    getNestedOptionalString(nestedHttp, ["url"]) ??
    getNestedOptionalString(nestedData, ["url", "request.url", "http.url"]) ??
    getNestedOptionalString(nestedBindings, ["url", "request.url", "http.url"]) ??
    null;
  const path =
    getOptionalString(record.path) ??
    getNestedOptionalString(nestedHttp, ["path", "route"]) ??
    getNestedOptionalString(nestedData, ["path", "route", "request.path", "http.path"]) ??
    getNestedOptionalString(nestedBindings, ["path", "route", "request.path", "http.path"]) ??
    url;
  const statusCode =
    getOptionalNumber(record.statusCode) ??
    getOptionalNumber(record.status) ??
    getNestedOptionalNumber(nestedHttp, ["statusCode", "status"]) ??
    getNestedOptionalNumber(nestedData, ["statusCode", "status", "response.statusCode", "http.statusCode"]) ??
    getNestedOptionalNumber(nestedBindings, ["statusCode", "status", "response.statusCode", "http.statusCode"]) ??
    null;
  const durationMs =
    getOptionalNumber(record.responseTime) ??
    getOptionalNumber(record.duration) ??
    getNestedOptionalNumber(nestedHttp, ["durationMs", "responseTime", "duration"]) ??
    getNestedOptionalNumber(nestedData, [
      "durationMs",
      "duration",
      "responseTime",
      "http.durationMs",
      "http.duration",
      "response.durationMs",
      "response.duration",
      "request.durationMs",
      "request.duration",
    ]) ??
    getNestedOptionalNumber(nestedBindings, [
      "durationMs",
      "duration",
      "responseTime",
      "http.durationMs",
      "http.duration",
      "response.durationMs",
      "response.duration",
      "request.durationMs",
      "request.duration",
    ]) ??
    null;
  const parsedFromMessage = parseHttpMessage(getOptionalString(record.msg) ?? getOptionalString(record.message));
  const fallbackMethod = method ?? parsedFromMessage?.method ?? null;
  const fallbackPath = path ?? parsedFromMessage?.path ?? url;
  const fallbackStatusCode = statusCode ?? parsedFromMessage?.statusCode ?? null;
  const fallbackDurationMs = durationMs ?? parsedFromMessage?.durationMs ?? null;
  const isFrameworkHttp = type === "http_request" || type === "http_error";
  const isStructuredHttp =
    fallbackMethod !== null &&
    (fallbackStatusCode !== null || fallbackDurationMs !== null) &&
    (fallbackPath !== null || url !== null);

  if (!isFrameworkHttp && !isStructuredHttp) {
    return null;
  }

  return {
    kind: isFrameworkHttp ? "framework-http" : "structured-http",
    method: fallbackMethod,
    path: fallbackPath,
    statusCode: fallbackStatusCode,
    durationMs: fallbackDurationMs,
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
  const value = getOptionalString(record.message) ?? getOptionalString(record.msg);

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

function getTimestamp(record: Record<string, unknown>): string | null {
  const direct =
    normalizeTimestampValue(record.timestamp) ??
    normalizeTimestampValue(record.time) ??
    normalizeTimestampValue(record.createdAt) ??
    normalizeTimestampValue(record.created_at);

  if (direct) {
    return direct;
  }

  if (isPlainObject(record.data)) {
    return (
      normalizeTimestampValue(record.data.timestamp) ??
      normalizeTimestampValue(record.data.time) ??
      null
    );
  }

  return null;
}

function getLevel(value: unknown): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 60) return "fatal";
    if (value >= 50) return "error";
    if (value >= 40) return "warning";
    if (value >= 30) return "info";
    if (value >= 20) return "debug";
    if (value >= 10) return "trace";
  }
  return "unknown";
}

function getOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getNestedOptionalString(
  value: Record<string, unknown> | null,
  keys: string[],
): string | null {
  if (!value) {
    return null;
  }
  for (const key of keys) {
    const candidate = getNestedValue(value, key);
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return null;
}

function getNestedOptionalNumber(
  value: Record<string, unknown> | null,
  keys: string[],
): number | null {
  if (!value) {
    return null;
  }
  for (const key of keys) {
    const candidate = getNestedValue(value, key);
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getNestedValue(value: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[part];
  }, value);
}

function normalizeTimestampValue(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const next = new Date(value);
    return Number.isNaN(next.getTime()) ? null : next.toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return null;
}

function parseHttpMessage(
  message: string | null,
): { method: string; statusCode: number | null; path: string; durationMs: number | null } | null {
  if (!message) {
    return null;
  }

  const match = message.match(
    /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*(?:->|→)\s*(\d{3})\s+(\S+)(?:\s+(\d+(?:\.\d+)?)ms)?\b/i,
  );

  if (!match) {
    return null;
  }

  return {
    method: match[1]!.toUpperCase(),
    statusCode: Number.parseInt(match[2]!, 10),
    path: match[3]!,
    durationMs: match[4] ? Number.parseFloat(match[4]) : null,
  };
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
