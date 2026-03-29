import path from "node:path";

import { buildGroupDetails } from "./grouping";
import { filterRecords } from "./query";
import { parseCallerCandidates, parseStackCandidates } from "./source";
import { getMatchedSectionTags, matchesErrorSignal } from "./sections";

import type {
  StudioCustomSectionDefinition,
  StudioErrorFrequencyBucket,
  StudioErrorGroupDetail,
  StudioErrorGroupSummary,
  StudioErrorHttpContext,
  StudioErrorOccurrence,
  StudioErrorsPage,
  StudioErrorsQueryInput,
  StudioErrorsStats,
  StudioNormalizedRecord,
  StudioStructuredGroupDetail,
} from "./types";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const SPARKLINE_BUCKETS = 12;

interface BuildErrorsPageOptions {
  records: StudioNormalizedRecord[];
  input: StudioErrorsQueryInput;
  projectPath: string;
  customSections?: StudioCustomSectionDefinition[];
  truncated?: boolean;
}

interface ErrorGroupBucket {
  fingerprint: string;
  records: StudioNormalizedRecord[];
}

export function buildErrorsPage({
  records,
  input,
  projectPath,
  customSections = [],
  truncated = false,
}: BuildErrorsPageOptions): StudioErrorsPage {
  const limit = clampLimit(input.limit);
  const offset = Math.max(0, input.offset ?? 0);
  const filteredRecords = filterErrorRecords(records, input, projectPath, customSections);
  const groups = buildErrorGroupBuckets(filteredRecords, projectPath);
  const groupSummaries = Array.from(groups.values()).map((group) =>
    toErrorGroupSummary(group.fingerprint, group.records, projectPath, customSections),
  );
  const sortedGroups = sortErrorGroups(groupSummaries, input.sort ?? "most-recent");
  const rawRecords = filteredRecords
    .slice()
    .sort(compareRecordsDescending)
    .map((record) => toErrorOccurrence(record, projectPath));

  return {
    groups: input.view === "raw" ? [] : sortedGroups.slice(offset, offset + limit),
    rawRecords: input.view === "raw" ? rawRecords.slice(offset, offset + limit) : [],
    stats: buildErrorStats(sortedGroups),
    totalGroups: sortedGroups.length,
    totalRawRecords: rawRecords.length,
    offset,
    limit,
    truncated,
  };
}

export function buildErrorGroupDetail(input: {
  groupId: string;
  records: StudioNormalizedRecord[];
  projectPath: string;
  customSections?: StudioCustomSectionDefinition[];
}): StudioErrorGroupDetail | null {
  const errorRecords = input.records.filter((record) => matchesErrorSignal(record));
  const groups = buildErrorGroupBuckets(errorRecords, input.projectPath);
  const group = groups.get(input.groupId);

  if (!group) {
    return null;
  }

  const summary = toErrorGroupSummary(
    group.fingerprint,
    group.records,
    input.projectPath,
    input.customSections ?? [],
  );
  const representative =
    group.records.slice().sort(compareRecordsDescending)[0] ?? group.records[0] ?? null;
  const structuredGroups = buildGroupDetails(input.records);

  return {
    group: summary,
    occurrences: group.records
      .slice()
      .sort(compareRecordsAscending)
      .map((record) => toErrorOccurrence(record, input.projectPath)),
    structuredFields: representative ? buildStructuredFields(representative) : [],
    traceReference: representative
      ? buildTraceReference(representative, structuredGroups)
      : null,
  };
}

export function extractErrorType(record: StudioNormalizedRecord): string | null {
  const errorObject = asPlainObject(record.error);
  const candidates = [
    errorObject?.name,
    errorObject?.type,
    errorObject?.code,
    getNestedValue(record.raw, "error.name"),
    getNestedValue(record.raw, "error.type"),
    getNestedValue(record.raw, "error.code"),
    record.type,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

export function extractErrorMessageFirstLine(record: StudioNormalizedRecord): string {
  const errorObject = asPlainObject(record.error);
  const rawMessage =
    (typeof errorObject?.message === "string" && errorObject.message) || record.message || "Unknown error";

  return rawMessage
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    ?.replace(/\s+/g, " ")
    ?? "Unknown error";
}

export function extractErrorSourceLocation(
  record: StudioNormalizedRecord,
  projectPath: string,
): {
  sourceFile: string | null;
  sourceLine: number | null;
  sourceColumn: number | null;
  sourceKey: string;
} {
  if (record.sourceLocation) {
    return {
      sourceFile: record.sourceLocation.relativePath,
      sourceLine: record.sourceLocation.line,
      sourceColumn: record.sourceLocation.column,
      sourceKey: `${record.sourceLocation.relativePath}:${record.sourceLocation.line}`,
    };
  }

  for (const candidate of [...parseStackCandidates(record.stack), ...parseCallerCandidates(record.caller)]) {
    const relativePath = normalizeCandidatePath(candidate.pathText, projectPath);

    if (!relativePath) {
      continue;
    }

    return {
      sourceFile: relativePath,
      sourceLine: candidate.line,
      sourceColumn: candidate.column,
      sourceKey: `${relativePath}:${candidate.line}`,
    };
  }

  return {
    sourceFile: null,
    sourceLine: null,
    sourceColumn: null,
    sourceKey: "unknown",
  };
}

export function extractErrorHttpContext(
  record: StudioNormalizedRecord,
): StudioErrorHttpContext | null {
  if (!record.http) {
    return null;
  }

  return {
    method: record.http.method,
    route: record.http.path ?? record.http.url,
    statusCode: record.http.statusCode,
  };
}

export function extractErrorTags(
  record: StudioNormalizedRecord,
  customSections: StudioCustomSectionDefinition[] = [],
) {
  return getMatchedSectionTags(record, customSections);
}

function filterErrorRecords(
  records: StudioNormalizedRecord[],
  input: StudioErrorsQueryInput,
  projectPath: string,
  customSections: StudioCustomSectionDefinition[],
): StudioNormalizedRecord[] {
  return filterRecords(
    records.filter((record) => matchesErrorSignal(record)),
    {
      fileId: input.fileId,
      from: input.from,
      to: input.to,
      search: input.search,
      sectionId: input.sectionId,
    },
    customSections,
  ).filter((record) => {
    const errorType = extractErrorType(record);
    const source = extractErrorSourceLocation(record, projectPath);

    if (input.type && errorType?.toLowerCase() !== input.type.toLowerCase()) {
      return false;
    }

    if (input.type && !errorType) {
      return false;
    }

    if (input.sourceFile && source.sourceFile?.toLowerCase() !== input.sourceFile.toLowerCase()) {
      return false;
    }

    if (input.sourceFile && !source.sourceFile) {
      return false;
    }

    return true;
  });
}

function buildErrorGroupBuckets(
  records: StudioNormalizedRecord[],
  projectPath: string,
): Map<string, ErrorGroupBucket> {
  const groups = new Map<string, ErrorGroupBucket>();

  for (const record of records) {
    const fingerprint = buildErrorFingerprint(record, projectPath);
    const existing = groups.get(fingerprint);

    if (existing) {
      existing.records.push(record);
      continue;
    }

    groups.set(fingerprint, {
      fingerprint,
      records: [record],
    });
  }

  return groups;
}

function buildErrorFingerprint(
  record: StudioNormalizedRecord,
  projectPath: string,
): string {
  const type = extractErrorType(record) ?? "unknown";
  const message = extractErrorMessageFirstLine(record);
  const source = extractErrorSourceLocation(record, projectPath).sourceKey;
  return `${type}::${message}::${source}`;
}

function toErrorGroupSummary(
  fingerprint: string,
  records: StudioNormalizedRecord[],
  projectPath: string,
  customSections: StudioCustomSectionDefinition[],
): StudioErrorGroupSummary {
  const sortedDescending = records.slice().sort(compareRecordsDescending);
  const representative = sortedDescending[0] ?? records[0]!;
  const source = extractErrorSourceLocation(representative, projectPath);
  const timestamps = records
    .map((record) => record.timestamp)
    .filter((value): value is string => typeof value === "string");
  const tags = extractErrorTags(representative, customSections);

  return {
    id: fingerprint,
    fingerprint,
    errorType: extractErrorType(representative),
    message: extractErrorMessageFirstLine(representative),
    occurrenceCount: records.length,
    firstSeen: timestamps.length > 0 ? timestamps.slice().sort()[0] ?? null : null,
    lastSeen: timestamps.length > 0 ? timestamps.slice().sort().at(-1) ?? null : null,
    sourceFile: source.sourceFile,
    sourceLine: source.sourceLine,
    sourceColumn: source.sourceColumn,
    http: extractErrorHttpContext(representative),
    tags,
    statusHint: records.length === 1 ? "new" : "recurring",
    sparkline: buildSparkline(records),
    representativeRecordId: representative.id,
    traceId: getCorrelationValue(representative, ["traceId", "trace.id"]),
    correlationId: getCorrelationValue(representative, ["correlationId", "requestId", "groupId"]),
  };
}

function toErrorOccurrence(
  record: StudioNormalizedRecord,
  projectPath: string,
): StudioErrorOccurrence {
  const source = extractErrorSourceLocation(record, projectPath);

  return {
    record,
    errorType: extractErrorType(record),
    message: extractErrorMessageFirstLine(record),
    sourceFile: source.sourceFile,
    sourceLine: source.sourceLine,
    sourceColumn: source.sourceColumn,
    http: extractErrorHttpContext(record),
  };
}

function buildErrorStats(groups: StudioErrorGroupSummary[]): StudioErrorsStats {
  const mostFrequent = groups
    .slice()
    .sort((left, right) => {
      if (left.occurrenceCount !== right.occurrenceCount) {
        return right.occurrenceCount - left.occurrenceCount;
      }

      return compareNullableTimestamps(right.lastSeen, left.lastSeen);
    })[0] ?? null;

  return {
    totalUniqueErrorTypes: groups.length,
    totalErrorOccurrences: groups.reduce((sum, group) => sum + group.occurrenceCount, 0),
    mostFrequentError: mostFrequent
      ? {
          errorType: mostFrequent.errorType,
          message: mostFrequent.message,
          count: mostFrequent.occurrenceCount,
        }
      : null,
    newErrorsThisSession: groups.filter((group) => group.occurrenceCount === 1).length,
  };
}

function buildSparkline(records: StudioNormalizedRecord[]): StudioErrorFrequencyBucket[] {
  const timestamps = records
    .map((record) => (record.timestamp ? Date.parse(record.timestamp) : Number.NaN))
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) {
    return Array.from({ length: SPARKLINE_BUCKETS }, () => ({
      bucketStart: null,
      count: 0,
    }));
  }

  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);

  if (min === max) {
    return Array.from({ length: SPARKLINE_BUCKETS }, (_, index) => ({
      bucketStart: new Date(min + index).toISOString(),
      count: index === SPARKLINE_BUCKETS - 1 ? records.length : 0,
    }));
  }

  const size = Math.max(1, Math.ceil((max - min + 1) / SPARKLINE_BUCKETS));
  const counts = new Array<number>(SPARKLINE_BUCKETS).fill(0);

  for (const timestamp of timestamps) {
    const bucket = Math.min(
      SPARKLINE_BUCKETS - 1,
      Math.floor((timestamp - min) / size),
    );
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }

  return counts.map((count, index) => ({
    bucketStart: new Date(min + index * size).toISOString(),
    count,
  }));
}

function sortErrorGroups(
  groups: StudioErrorGroupSummary[],
  sort: NonNullable<StudioErrorsQueryInput["sort"]>,
): StudioErrorGroupSummary[] {
  return groups.slice().sort((left, right) => {
    if (sort === "most-frequent") {
      if (left.occurrenceCount !== right.occurrenceCount) {
        return right.occurrenceCount - left.occurrenceCount;
      }

      return compareNullableTimestamps(right.lastSeen, left.lastSeen);
    }

    if (sort === "first-seen") {
      return compareNullableTimestamps(left.firstSeen, right.firstSeen);
    }

    return compareNullableTimestamps(right.lastSeen, left.lastSeen);
  });
}

function buildStructuredFields(record: StudioNormalizedRecord) {
  const fields = new Map<string, string>();
  const sources: Array<[string, unknown]> = [
    ["level", record.level],
    ["message", record.message],
    ["type", record.type],
    ["caller", record.caller],
    ["http.method", record.http?.method],
    ["http.route", record.http?.path ?? record.http?.url],
    ["http.statusCode", record.http?.statusCode],
    ["bindings", record.bindings],
    ["data", record.data],
    ["error", record.error],
  ];

  for (const [prefix, value] of sources) {
    flattenField(prefix, value, fields);
  }

  return Array.from(fields.entries()).map(([key, value]) => ({ key, value }));
}

function flattenField(
  prefix: string,
  value: unknown,
  target: Map<string, string>,
  depth = 0,
) {
  if (!prefix || value == null) {
    return;
  }

  if (depth >= 3) {
    target.set(prefix, stringifyValue(value));
    return;
  }

  if (Array.isArray(value)) {
    target.set(prefix, stringifyValue(value));
    return;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);

    if (entries.length === 0) {
      return;
    }

    for (const [key, nested] of entries.slice(0, 20)) {
      flattenField(`${prefix}.${key}`, nested, target, depth + 1);
    }
    return;
  }

  target.set(prefix, stringifyValue(value));
}

function buildTraceReference(
  representative: StudioNormalizedRecord,
  structuredGroups: Map<string, StudioStructuredGroupDetail>,
) {
  for (const group of structuredGroups.values()) {
    if (!group.records.some((record) => record.id === representative.id)) {
      continue;
    }

    return {
      kind: "group" as const,
      id: group.group.id,
      sectionId: "all-logs" as const,
      label: group.group.title,
    };
  }

  return null;
}

function getCorrelationValue(record: StudioNormalizedRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = getNestedValue(record.raw, key) ?? getNestedValue(record.data, key) ?? getNestedValue(record.bindings, key);
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function normalizeCandidatePath(pathText: string, projectPath: string): string | null {
  const normalized = path.normalize(pathText);
  const absolute = path.isAbsolute(normalized)
    ? normalized
    : path.resolve(projectPath, normalized);
  const relative = path.relative(projectPath, absolute);

  if (!relative || relative.startsWith("..")) {
    return path.isAbsolute(normalized) ? null : normalized;
  }

  return relative;
}

function compareRecordsDescending(left: StudioNormalizedRecord, right: StudioNormalizedRecord): number {
  return compareNullableTimestamps(right.timestamp, left.timestamp) || right.id.localeCompare(left.id);
}

function compareRecordsAscending(left: StudioNormalizedRecord, right: StudioNormalizedRecord): number {
  return compareNullableTimestamps(left.timestamp, right.timestamp) || left.id.localeCompare(right.id);
}

function compareNullableTimestamps(left: string | null, right: string | null): number {
  const leftTime = left ? Date.parse(left) : Number.NaN;
  const rightTime = right ? Date.parse(right) : Number.NaN;

  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  if (!Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
    return -1;
  }

  if (Number.isNaN(leftTime) && !Number.isNaN(rightTime)) {
    return 1;
  }

  return 0;
}

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function asPlainObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getNestedValue(value: unknown, dottedKey: string): unknown {
  if (!asPlainObject(value)) {
    return undefined;
  }

  let current: unknown = value;
  for (const part of dottedKey.split(".")) {
    const currentObject = asPlainObject(current);
    if (!currentObject || !(part in currentObject)) {
      return undefined;
    }
    current = currentObject[part];
  }

  return current;
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
