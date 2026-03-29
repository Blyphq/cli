import type {
  StudioDatabaseEventKind,
  StudioDatabaseMigrationEvent,
  StudioDatabaseOverview,
  StudioDatabaseQueryEvent,
  StudioDatabaseQueryInput,
  StudioDatabaseQueryStatus,
  StudioDatabaseTransactionSummary,
  StudioNormalizedRecord,
} from "./types";

const DEFAULT_DATABASE_LIMIT = 100;
const MAX_DATABASE_LIMIT = 500;
const SLOW_QUERY_THRESHOLD_MS = 100;
const VERY_SLOW_QUERY_THRESHOLD_MS = 500;

const DB_MESSAGE_PATTERNS = [
  "query",
  "transaction",
  "migration",
  "slow query",
  "database error",
  "connection",
  "sql",
];

const SECRET_KEY_PATTERN =
  /(password|passcode|secret|authorization|cookie|access[_-]?token|refresh[_-]?token|api[_-]?key|session|^token$|\.token$|_token$)/i;
interface ClassifiedDatabaseRecord {
  kind: StudioDatabaseEventKind;
  query: StudioDatabaseQueryEvent | null;
  migration: StudioDatabaseMigrationEvent | null;
  transactionId: string | null;
  requestId: string | null;
  traceId: string | null;
  timestamp: string | null;
  recordId: string;
}

interface TransactionAccumulator {
  id: string;
  startRecordId: string;
  timestampStart: string | null;
  timestampEnd: string | null;
  terminalKind: "transaction-commit" | "transaction-rollback" | null;
  requestId: string | null;
  traceId: string | null;
  queries: StudioDatabaseQueryEvent[];
}

export function analyzeDatabaseRecords(
  records: StudioNormalizedRecord[],
  input: Pick<StudioDatabaseQueryInput, "offset" | "limit"> = {},
): StudioDatabaseOverview {
  const classified = records
    .map(classifyDatabaseRecord)
    .filter((item): item is ClassifiedDatabaseRecord => item !== null);
  const queries = classified
    .flatMap((item) => (item.query ? [item.query] : []))
    .sort(compareQueryEventsDescending);
  const slowQueries = queries
    .filter((item) => (item.durationMs ?? 0) > SLOW_QUERY_THRESHOLD_MS)
    .sort(compareSlowQueriesDescending);
  const migrations = classified
    .flatMap((item) => (item.migration ? [item.migration] : []))
    .sort(compareMigrationsDescending);
  const transactions = buildTransactionSummaries(classified);
  const offset = Math.max(0, input.offset ?? 0);
  const limit = clampLimit(input.limit);
  const pagedQueries = queries.slice(offset, offset + limit);
  const avgQueryTimeMs = buildAverageDuration(queries);

  return {
    stats: {
      totalQueries: queries.length,
      slowQueries: slowQueries.length,
      failedQueries: queries.filter((item) => item.status === "error").length,
      avgQueryTimeMs,
      activeTransactions: transactions.filter((item) => item.result === "open").length,
    },
    queries: pagedQueries,
    totalQueries: queries.length,
    slowQueries,
    transactions,
    migrationEvents: migrations,
  };
}

export function getSlowQueryThresholdMs(): number {
  return SLOW_QUERY_THRESHOLD_MS;
}

export function getVerySlowQueryThresholdMs(): number {
  return VERY_SLOW_QUERY_THRESHOLD_MS;
}

function classifyDatabaseRecord(record: StudioNormalizedRecord): ClassifiedDatabaseRecord | null {
  const signals = computeSignalScore(record);
  if (signals.score === 0) {
    return null;
  }

  const kind = classifyKind(record, signals.text);
  const transactionId = getTransactionId(record);
  const requestId = getRequestId(record);
  const traceId = getTraceId(record);

  return {
    kind,
    query: kind === "query" ? toDatabaseQueryEvent(record, transactionId, requestId, traceId) : null,
    migration: kind === "migration" ? toMigrationEvent(record) : null,
    transactionId,
    requestId,
    traceId,
    timestamp: record.timestamp,
    recordId: record.id,
  };
}

function toDatabaseQueryEvent(
  record: StudioNormalizedRecord,
  transactionId: string | null,
  requestId: string | null,
  traceId: string | null,
): StudioDatabaseQueryEvent {
  const queryText =
    getString(record, [
      "query.sql",
      "sql",
      "query.text",
      "db.query",
      "prisma.query",
      "query",
    ]) ?? null;
  const operation = getOperation(record, queryText);
  const durationMs =
    getNumber(record, [
      "query.durationMs",
      "db.durationMs",
      "durationMs",
      "duration",
      "query.duration",
      "sql.durationMs",
      "prisma.duration",
    ]) ?? null;
  const errorMessage = getErrorMessage(record);
  const status = getQueryStatus(record, durationMs, errorMessage);
  const durationBreakdown = getDurationBreakdown(record);
  const params = sanitizeParams(
    getValue(record, [
      "query.params",
      "params",
      "sql.params",
      "db.params",
      "query.parameters",
      "prisma.params",
    ]),
  );

  return {
    id: `db-query:${record.id}`,
    recordId: record.id,
    timestamp: record.timestamp,
    operation,
    modelOrTable:
      getString(record, [
        "query.model",
        "db.model",
        "query.table",
        "db.table",
        "prisma.model",
        "table",
        "model",
        "sql.table",
      ]) ?? null,
    durationMs,
    status,
    transactionId,
    requestId,
    traceId,
    queryText,
    params,
    errorMessage,
    durationBreakdown,
    adapter: getAdapter(record),
  };
}

function toMigrationEvent(record: StudioNormalizedRecord): StudioDatabaseMigrationEvent {
  return {
    id: `db-migration:${record.id}`,
    recordId: record.id,
    timestamp: record.timestamp,
    name:
      getString(record, [
        "migration.name",
        "db.migration.name",
        "prisma.migration.name",
        "drizzle.migration.name",
      ]) ?? null,
    version:
      getString(record, [
        "migration.version",
        "db.migration.version",
        "prisma.migration.version",
        "drizzle.migration.version",
      ]) ?? null,
    durationMs:
      getNumber(record, [
        "migration.durationMs",
        "db.migration.durationMs",
        "prisma.migration.durationMs",
        "drizzle.migration.durationMs",
        "durationMs",
        "duration",
      ]) ?? null,
    success: !Boolean(getErrorMessage(record)) && !looksFailed(record.message),
    errorMessage: getErrorMessage(record),
  };
}

function buildTransactionSummaries(
  records: ClassifiedDatabaseRecord[],
): StudioDatabaseTransactionSummary[] {
  const byId = new Map<string, TransactionAccumulator>();

  for (const item of records) {
    if (!item.transactionId) {
      continue;
    }

    if (!byId.has(item.transactionId)) {
      byId.set(item.transactionId, {
        id: item.transactionId,
        startRecordId: item.recordId,
        timestampStart: item.timestamp,
        timestampEnd: null,
        terminalKind: null,
        requestId: item.requestId,
        traceId: item.traceId,
        queries: [],
      });
    }

    const current = byId.get(item.transactionId)!;
    if (!current.requestId && item.requestId) current.requestId = item.requestId;
    if (!current.traceId && item.traceId) current.traceId = item.traceId;

    if (item.kind === "transaction-start") {
      current.startRecordId = item.recordId;
      current.timestampStart = minTimestamp(current.timestampStart, item.timestamp);
    }

    if (item.kind === "transaction-commit" || item.kind === "transaction-rollback") {
      current.timestampEnd = maxTimestamp(current.timestampEnd, item.timestamp);
      current.terminalKind = item.kind;
    }

    if (item.query) {
      current.queries.push(item.query);
      if (!current.timestampStart) {
        current.timestampStart = item.timestamp;
        current.startRecordId = item.recordId;
      }
    }
  }

  return Array.from(byId.values())
    .map<StudioDatabaseTransactionSummary>((item) => {
      const result: StudioDatabaseTransactionSummary["result"] =
        item.terminalKind === "transaction-commit"
          ? "committed"
          : item.terminalKind === "transaction-rollback"
            ? "rolled_back"
            : "open";
      const queries = item.queries.slice().sort(compareQueryEventsAscending);
      return {
        id: item.id,
        startRecordId: item.startRecordId,
        timestampStart: item.timestampStart,
        timestampEnd: item.timestampEnd,
        durationMs: computeDuration(item.timestampStart, item.timestampEnd),
        result,
        requestId: item.requestId,
        traceId: item.traceId,
        queries,
      };
    })
    .sort(compareTransactions);
}

function classifyKind(record: StudioNormalizedRecord, lowerText: string): StudioDatabaseEventKind {
  const type = (record.type ?? "").toLowerCase();
  const transactionVerb = getString(record, [
    "transaction.event",
    "transaction.action",
    "db.transaction.event",
    "db.transaction.action",
    "action",
  ])?.toLowerCase();

  if (
    lowerText.includes("migration") ||
    lowerText.includes("schema push") ||
    lowerText.includes("db push") ||
    type.includes("migration") ||
    hasValue(record, [
      "migration.name",
      "migration.version",
      "db.migration.name",
      "prisma.migration.name",
      "drizzle.migration.name",
    ])
  ) {
    return "migration";
  }

  if (
    transactionVerb === "start" ||
    transactionVerb === "begin" ||
    type.includes("transaction_start") ||
    lowerText.includes("transaction start") ||
    lowerText.includes("transaction begin")
  ) {
    return "transaction-start";
  }

  if (
    transactionVerb === "commit" ||
    type.includes("transaction_commit") ||
    lowerText.includes("transaction commit")
  ) {
    return "transaction-commit";
  }

  if (
    transactionVerb === "rollback" ||
    transactionVerb === "rolled_back" ||
    type.includes("transaction_rollback") ||
    lowerText.includes("transaction rollback") ||
    lowerText.includes("rolled back")
  ) {
    return "transaction-rollback";
  }

  if (
    lowerText.includes("connection") ||
    type.includes("connection") ||
    hasValue(record, ["db.connection", "connection.id"])
  ) {
    return "connection";
  }

  if (looksLikeQueryRecord(record, lowerText)) {
    return "query";
  }

  return "unknown";
}

function looksLikeQueryRecord(record: StudioNormalizedRecord, lowerText: string): boolean {
  if (
    hasValue(record, [
      "query.sql",
      "sql",
      "query.text",
      "db.query",
      "prisma.query",
      "query.operation",
      "db.operation",
      "sql.operation",
      "prisma.action",
      "query.model",
      "query.table",
      "db.table",
    ])
  ) {
    return true;
  }

  if (typeIncludesQuery(record.type) || lowerText.includes("slow query")) {
    return true;
  }

  return lowerText.includes("query") || lowerText.includes("select ") || lowerText.includes("insert ");
}

function computeSignalScore(record: StudioNormalizedRecord): { score: number; text: string } {
  const lowerText = `${record.message} ${record.type ?? ""}`.toLowerCase();
  const fieldHit = hasInterestingField(record);
  const messageHit = DB_MESSAGE_PATTERNS.some((pattern) => lowerText.includes(pattern));
  const typeHit = typeIncludesQuery(record.type) || lowerText.includes("migration") || lowerText.includes("transaction");

  return {
    score: (fieldHit ? 5 : 0) + (messageHit ? 2 : 0) + (typeHit ? 2 : 0),
    text: lowerText,
  };
}

function hasInterestingField(record: StudioNormalizedRecord): boolean {
  const candidates = [
    "db",
    "query",
    "prisma",
    "drizzle",
    "sql",
    "transaction",
    "migration",
    "params",
  ];

  return candidates.some((key) => hasValue(record, [key]));
}

function getOperation(record: StudioNormalizedRecord, queryText: string | null): string {
  const explicit =
    getString(record, [
      "query.operation",
      "db.operation",
      "sql.operation",
      "prisma.action",
      "action",
    ]) ?? null;

  if (explicit) {
    return explicit.toUpperCase();
  }

  const firstKeyword = queryText?.trim().split(/\s+/, 1)[0] ?? null;
  if (firstKeyword) {
    return firstKeyword.toUpperCase();
  }

  return "QUERY";
}

function getQueryStatus(
  record: StudioNormalizedRecord,
  durationMs: number | null,
  errorMessage: string | null,
): StudioDatabaseQueryStatus {
  if (errorMessage || looksFailed(record.message)) {
    return "error";
  }

  if ((durationMs ?? 0) > SLOW_QUERY_THRESHOLD_MS) {
    return "slow";
  }

  return "success";
}

function getAdapter(record: StudioNormalizedRecord): "prisma" | "drizzle" | null {
  const text = `${record.message} ${record.type ?? ""}`.toLowerCase();
  if (
    text.includes("prisma") ||
    hasValue(record, ["prisma", "prisma.query", "prisma.model"])
  ) {
    return "prisma";
  }
  if (
    text.includes("drizzle") ||
    hasValue(record, ["drizzle", "drizzle.query", "drizzle.migration.name"])
  ) {
    return "drizzle";
  }
  return null;
}

function getDurationBreakdown(record: StudioNormalizedRecord): Record<string, number> | null {
  const value = getValue(record, [
    "query.durationBreakdown",
    "db.durationBreakdown",
    "durationBreakdown",
  ]);
  if (!isPlainObject(value)) {
    return null;
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]),
  );

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function getTransactionId(record: StudioNormalizedRecord): string | null {
  return (
    getString(record, [
      "transaction.id",
      "transactionId",
      "db.transactionId",
      "query.transactionId",
      "query.transaction.id",
    ]) ?? null
  );
}

function getRequestId(record: StudioNormalizedRecord): string | null {
  return (
    getString(record, [
      "requestId",
      "request.id",
      "db.requestId",
      "query.requestId",
    ]) ?? null
  );
}

function getTraceId(record: StudioNormalizedRecord): string | null {
  return (
    getString(record, [
      "traceId",
      "trace.id",
      "db.traceId",
      "query.traceId",
    ]) ?? null
  );
}

function getErrorMessage(record: StudioNormalizedRecord): string | null {
  if (typeof record.error === "string" && record.error.trim().length > 0) {
    return record.error;
  }
  return (
    getString(record, [
      "error.message",
      "query.error.message",
      "db.error.message",
      "prisma.error.message",
      "drizzle.error.message",
    ]) ?? null
  );
}

function sanitizeParams(value: unknown): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return isRedactedString(value) ? value : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeParams(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      sanitized[key] = "[redacted]";
      continue;
    }
    sanitized[key] = sanitizeParams(nested);
  }

  return sanitized;
}

function isRedactedString(value: string): boolean {
  return /(\*{2,}|\[redacted\]|redacted|masked)/i.test(value);
}

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_DATABASE_LIMIT, 1), MAX_DATABASE_LIMIT);
}

function buildAverageDuration(queries: StudioDatabaseQueryEvent[]): number | null {
  const values = queries
    .map((item) => item.durationMs)
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function computeDuration(start: string | null, end: string | null): number | null {
  if (!start || !end) {
    return null;
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return null;
  }
  return Math.max(0, endMs - startMs);
}

function compareQueryEventsDescending(left: StudioDatabaseQueryEvent, right: StudioDatabaseQueryEvent): number {
  return compareTimestampsDescending(left.timestamp, right.timestamp);
}

function compareQueryEventsAscending(left: StudioDatabaseQueryEvent, right: StudioDatabaseQueryEvent): number {
  return compareTimestampsAscending(left.timestamp, right.timestamp);
}

function compareSlowQueriesDescending(left: StudioDatabaseQueryEvent, right: StudioDatabaseQueryEvent): number {
  const leftDuration = left.durationMs ?? -1;
  const rightDuration = right.durationMs ?? -1;
  if (leftDuration !== rightDuration) {
    return rightDuration - leftDuration;
  }
  return compareQueryEventsDescending(left, right);
}

function compareMigrationsDescending(
  left: StudioDatabaseMigrationEvent,
  right: StudioDatabaseMigrationEvent,
): number {
  return compareTimestampsDescending(left.timestamp, right.timestamp);
}

function compareTransactions(
  left: StudioDatabaseTransactionSummary,
  right: StudioDatabaseTransactionSummary,
): number {
  if (left.result !== right.result) {
    if (left.result === "open") return -1;
    if (right.result === "open") return 1;
  }
  return compareTimestampsDescending(left.timestampStart, right.timestampStart);
}

function compareTimestampsDescending(left: string | null, right: string | null): number {
  const leftMs = left ? Date.parse(left) : Number.NaN;
  const rightMs = right ? Date.parse(right) : Number.NaN;
  if (!Number.isNaN(leftMs) && !Number.isNaN(rightMs) && leftMs !== rightMs) {
    return rightMs - leftMs;
  }
  if (!Number.isNaN(leftMs)) return -1;
  if (!Number.isNaN(rightMs)) return 1;
  return 0;
}

function compareTimestampsAscending(left: string | null, right: string | null): number {
  return compareTimestampsDescending(right, left);
}

function minTimestamp(current: string | null, next: string | null): string | null {
  if (!current) return next;
  if (!next) return current;
  return Date.parse(current) <= Date.parse(next) ? current : next;
}

function maxTimestamp(current: string | null, next: string | null): string | null {
  if (!current) return next;
  if (!next) return current;
  return Date.parse(current) >= Date.parse(next) ? current : next;
}

function looksFailed(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes("failed") ||
    lower.includes("error") ||
    lower.includes("exception") ||
    lower.includes("rollback") ||
    lower.includes("rolled back")
  );
}

function typeIncludesQuery(value: string | null): boolean {
  const lower = (value ?? "").toLowerCase();
  return lower.includes("query") || lower.includes("sql") || lower.includes("prisma") || lower.includes("drizzle");
}

function getValue(record: StudioNormalizedRecord, paths: string[]): unknown {
  for (const path of paths) {
    const value = getPathValue(record.raw, path);
    if (value !== undefined) {
      return value;
    }
    const dataValue = getPathValue(record.data, path);
    if (dataValue !== undefined) {
      return dataValue;
    }
    const bindingsValue = getPathValue(record.bindings, path);
    if (bindingsValue !== undefined) {
      return bindingsValue;
    }
  }
  return undefined;
}

function hasValue(record: StudioNormalizedRecord, paths: string[]): boolean {
  return getValue(record, paths) !== undefined;
}

function getString(record: StudioNormalizedRecord, paths: string[]): string | undefined {
  const value = getValue(record, paths);
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function getNumber(record: StudioNormalizedRecord, paths: string[]): number | undefined {
  const value = getValue(record, paths);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getPathValue(input: unknown, path: string): unknown {
  if (!path) {
    return input;
  }
  const parts = path.split(".");
  let current: unknown = input;
  for (const part of parts) {
    if (!isPlainObject(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
