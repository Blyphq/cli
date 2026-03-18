import mysql from "mysql2/promise";
import postgres from "postgres";

import { readProjectEnv } from "./config";
import { resolveRecordSourceLocation } from "./source";
import {
  inferHttpDetails,
  inferSource,
  resolveRecordStack,
  sanitizeForTransport,
} from "./normalize";
import { MAX_DB_SCANNED_RECORDS } from "./query";

import type {
  StudioConfigDiscovery,
  StudioLogFile,
  StudioLogsQueryInput,
  StudioNormalizedRecord,
  StudioResolvedConfigSummary,
} from "./types";

export const SYNTHETIC_DB_FILE_ID = "database:primary";
const SYNTHETIC_DB_PATH = "database://blyp_logs";
const BLYP_LOGS_TABLE = "blyp_logs";

type SupportedDatabaseDialect = NonNullable<StudioResolvedConfigSummary["database"]["dialect"]>;
type SqlParameter = string | number | boolean | Date | null;

type DbQueryInput = Pick<
  StudioLogsQueryInput,
  "level" | "type" | "from" | "to" | "search"
>;

interface DbLoadResult {
  records: StudioNormalizedRecord[];
  scannedRecords: number;
  truncated: boolean;
}

type TestDatabaseQueryFn = (input: {
  dialect: SupportedDatabaseDialect;
  connectionUrl: string;
  query: string;
  values: SqlParameter[];
}) => Promise<unknown[]>;

let testDatabaseQuery: TestDatabaseQueryFn | null = null;

export { MAX_DB_SCANNED_RECORDS } from "./query";

export function buildSyntheticDatabaseFile(
  config: StudioResolvedConfigSummary,
): StudioLogFile {
  const label = config.database.label ?? "Database logs";

  return {
    id: SYNTHETIC_DB_FILE_ID,
    absolutePath: SYNTHETIC_DB_PATH,
    relativePath: SYNTHETIC_DB_PATH,
    name: label,
    kind: "active",
    stream: "combined",
    sizeBytes: 0,
    modifiedAt: new Date().toISOString(),
  };
}

export async function loadDatabaseRecords({
  projectPath,
  config,
  input,
}: {
  projectPath: string;
  config: StudioConfigDiscovery;
  input: DbQueryInput;
}): Promise<DbLoadResult> {
  if (config.resolved.database.dialect === null) {
    throw new Error(
      "Studio DB mode requires database.dialect to be set to 'postgres' or 'mysql' in blyp.config.",
    );
  }

  const connectionUrl = resolveDatabaseConnectionUrl(projectPath);
  const syntheticFile = buildSyntheticDatabaseFile(config.resolved);
  const queryPlan = buildDatabaseQuery(config.resolved.database.dialect, input);
  const rows = await runDatabaseQuery({
    dialect: config.resolved.database.dialect,
    connectionUrl,
    query: queryPlan.query,
    values: queryPlan.values,
  });
  const truncated = rows.length > MAX_DB_SCANNED_RECORDS;
  const slicedRows = truncated ? rows.slice(0, MAX_DB_SCANNED_RECORDS) : rows;
  const records = await Promise.all(
    slicedRows.map((row) => normalizeDatabaseRow({ row, syntheticFile, projectPath })),
  );

  return {
    records,
    scannedRecords: slicedRows.length,
    truncated,
  };
}

export function __setDatabaseQueryForTests(fn: TestDatabaseQueryFn | null): void {
  testDatabaseQuery = fn;
}

function resolveDatabaseConnectionUrl(projectPath: string): string {
  const projectEnv = readProjectEnv(projectPath);
  const connectionUrl =
    process.env.DATABASE_URL ??
    projectEnv.DATABASE_URL ??
    process.env.DATABASE_URL_UNPOOLED ??
    projectEnv.DATABASE_URL_UNPOOLED;

  if (!connectionUrl || connectionUrl.trim().length === 0) {
    throw new Error(
      `Studio DB mode requires DATABASE_URL in the target project's environment (${projectPath}).`,
    );
  }

  return connectionUrl;
}

function buildDatabaseQuery(
  dialect: SupportedDatabaseDialect,
  input: DbQueryInput,
): { query: string; values: SqlParameter[] } {
  const values: SqlParameter[] = [];
  const whereClauses: string[] = [];
  const quote = dialect === "postgres" ? (value: string) => `"${value}"` : (value: string) => `\`${value}\``;
  const pushValue = (value: SqlParameter) => {
    values.push(value);
    return dialect === "postgres" ? `$${values.length}` : "?";
  };

  if (input.level) {
    const param = pushValue(input.level);
    whereClauses.push(`${quote("level")} = ${param}`);
  }

  if (input.type) {
    const param = pushValue(input.type);
    whereClauses.push(`${quote("type")} = ${param}`);
  }

  const fromDate = parseFilterDate(input.from);
  if (fromDate) {
    const param = pushValue(fromDate);
    whereClauses.push(`${quote("timestamp")} >= ${param}`);
  }

  const toDate = parseFilterDate(input.to);
  if (toDate) {
    const param = pushValue(toDate);
    whereClauses.push(`${quote("timestamp")} <= ${param}`);
  }

  const limitParam = pushValue(MAX_DB_SCANNED_RECORDS + 1);

  const fields =
    dialect === "postgres"
      ? [
          `"id"`,
          `"timestamp"`,
          `"level"`,
          `"message"`,
          `"caller"`,
          `"type"`,
          `"group_id" AS "groupId"`,
          `"method"`,
          `"path"`,
          `"status"`,
          `"duration"`,
          `"has_error" AS "hasError"`,
          `"data"`,
          `"bindings"`,
          `"error"`,
          `"events"`,
          `"record"`,
          `"created_at" AS "createdAt"`,
        ]
      : [
          "`id`",
          "`timestamp`",
          "`level`",
          "`message`",
          "`caller`",
          "`type`",
          "`group_id` AS `groupId`",
          "`method`",
          "`path`",
          "`status`",
          "`duration`",
          "`has_error` AS `hasError`",
          "`data`",
          "`bindings`",
          "`error`",
          "`events`",
          "`record`",
          "`created_at` AS `createdAt`",
        ];

  const query = [
    `SELECT ${fields.join(", ")}`,
    `FROM ${dialect === "postgres" ? `"${BLYP_LOGS_TABLE}"` : `\`${BLYP_LOGS_TABLE}\``}`,
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "",
    `ORDER BY ${quote("timestamp")} DESC, ${dialect === "postgres" ? `"created_at"` : "`created_at`"} DESC`,
    `LIMIT ${limitParam}`,
  ]
    .filter(Boolean)
    .join(" ");

  return { query, values };
}

async function runDatabaseQuery(input: {
  dialect: SupportedDatabaseDialect;
  connectionUrl: string;
  query: string;
  values: SqlParameter[];
}): Promise<unknown[]> {
  if (testDatabaseQuery) {
    return testDatabaseQuery(input);
  }

  if (input.dialect === "postgres") {
    const sql = postgres(input.connectionUrl, {
      max: 1,
      prepare: false,
      idle_timeout: 5,
      connect_timeout: 5,
    });

    try {
      return await sql.unsafe(input.query, input.values);
    } finally {
      await sql.end({ timeout: 1 });
    }
  }

  const connection = await mysql.createConnection(input.connectionUrl);

  try {
    const [rows] = await connection.query(input.query, input.values);
    return Array.isArray(rows) ? rows : [];
  } finally {
    await connection.end();
  }
}

async function normalizeDatabaseRow({
  row,
  syntheticFile,
  projectPath,
}: {
  row: unknown;
  syntheticFile: StudioLogFile;
  projectPath: string;
}): Promise<StudioNormalizedRecord> {
  const rowObj = isPlainObject(row) ? row : {};
  const id = getOptionalString(rowObj.id) ?? `db:${Date.now()}:${Math.random()}`;
  const timestamp = normalizeTimestamp(rowObj.timestamp);
  const level = getOptionalString(rowObj.level) ?? "unknown";
  const message = getOptionalString(rowObj.message) ?? "Unknown log record";
  const type = getOptionalString(rowObj.type) ?? null;
  const caller = getOptionalString(rowObj.caller) ?? null;
  const bindings = toRecordValue(rowObj.bindings);
  const data = toTransportValue(rowObj.data);
  const error = toTransportValue(rowObj.error ?? null);
  const storedRecord = toRecordValue(rowObj.record) ?? {};
  const normalizedRecord = applyScalarFallbacks(
    Object.keys(storedRecord).length > 0
      ? storedRecord
      : buildRawFromScalars(rowObj, id, timestamp, level, message, type, caller),
    rowObj,
  );
  const http = inferHttpDetails(normalizedRecord);
  const source = inferSource(normalizedRecord, http);
  const stack = resolveRecordStack(normalizedRecord) ?? resolveStackFromError(error);
  const sourceResolution = await resolveRecordSourceLocation(projectPath, { caller, stack });

  return {
    id,
    timestamp,
    level,
    message,
    source,
    type,
    caller,
    bindings,
    data,
    fileId: syntheticFile.id,
    fileName: syntheticFile.name,
    filePath: syntheticFile.absolutePath,
    lineNumber: 0,
    malformed: false,
    http,
    error,
    stack,
    sourceLocation: sourceResolution?.status === "resolved" ? sourceResolution.location : null,
    raw: normalizedRecord,
  };
}

function buildRawFromScalars(
  row: Record<string, unknown>,
  id: string,
  timestamp: string | null,
  level: string,
  message: string,
  type: string | null,
  caller: string | null,
): Record<string, unknown> {
  const raw: Record<string, unknown> = { id, level, message };

  if (timestamp) raw.timestamp = timestamp;
  if (type) raw.type = type;
  if (caller) raw.caller = caller;
  if (typeof row.groupId === "string" && row.groupId.length > 0) raw.groupId = row.groupId;
  if (typeof row.method === "string") raw.method = row.method;
  if (typeof row.path === "string") raw.path = row.path;

  const statusNumber = toFiniteNumber(row.status);
  if (statusNumber !== null) raw.status = statusNumber;

  const durationNumber = toFiniteNumber(row.duration);
  if (durationNumber !== null) raw.duration = durationNumber;

  const bindings = toRecordValue(row.bindings);
  if (bindings) raw.bindings = bindings;

  const data = toTransportValue(row.data);
  if (data !== undefined) raw.data = data;

  const error = toTransportValue(row.error);
  if (error != null) raw.error = error;

  const events = toTransportValue(row.events);
  if (Array.isArray(events)) raw.events = events;

  return raw;
}

function applyScalarFallbacks(
  record: Record<string, unknown>,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...record };

  if (typeof next.groupId !== "string" && typeof row.groupId === "string" && row.groupId.length > 0) {
    next.groupId = row.groupId;
  }

  if (typeof next.method !== "string" && typeof row.method === "string") {
    next.method = row.method;
  }

  if (typeof next.path !== "string" && typeof row.path === "string") {
    next.path = row.path;
  }

  if (typeof next.status !== "number") {
    const statusNumber = toFiniteNumber(row.status);
    if (statusNumber !== null) {
      next.status = statusNumber;
    }
  }

  if (typeof next.duration !== "number") {
    const durationNumber = toFiniteNumber(row.duration);
    if (durationNumber !== null) {
      next.duration = durationNumber;
    }
  }

  if (!Array.isArray(next.events)) {
    const events = toTransportValue(row.events);
    if (Array.isArray(events)) {
      next.events = events;
    }
  }

  return next;
}

function toRecordValue(value: unknown): Record<string, unknown> | null {
  const parsed = toTransportValue(value);
  return isPlainObject(parsed) ? (parsed as Record<string, unknown>) : null;
}

function toTransportValue(value: unknown): unknown {
  if (typeof value === "string") {
    const parsed = tryParseJson(value);
    return sanitizeForTransport(parsed);
  }

  return sanitizeForTransport(value);
}

function normalizeTimestamp(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }

  return null;
}

function resolveStackFromError(error: unknown): string | null {
  if (isPlainObject(error)) {
    return getOptionalString(error.stack) ?? null;
  }

  return null;
}

function tryParseJson(value: string): unknown {
  const trimmed = value.trim();

  if (
    !trimmed ||
    (!trimmed.startsWith("{") &&
      !trimmed.startsWith("[") &&
      !trimmed.startsWith("\"") &&
      trimmed !== "null" &&
      trimmed !== "true" &&
      trimmed !== "false")
  ) {
    return value;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseFilterDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
