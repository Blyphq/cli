import path from "node:path";

import { buildGroupDetails } from "./grouping";
import { getMatchedSectionIds, isErrorRecord } from "./sections";

import type {
  StudioCustomSectionDefinition,
  StudioErrorFingerprintSource,
  StudioErrorGroupDetail,
  StudioErrorGroupSummary,
  StudioErrorOccurrence,
  StudioErrorSort,
  StudioErrorStackFrame,
  StudioErrorStats,
  StudioErrorsPage,
  StudioErrorsQueryInput,
  StudioNormalizedRecord,
  StudioResolvedSourceLocation,
} from "./types";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const SPARKLINE_BUCKETS = 12;

export function buildErrorsPage(input: {
  records: StudioNormalizedRecord[];
  query: StudioErrorsQueryInput;
  customSections?: StudioCustomSectionDefinition[];
  scannedRecords: number;
  truncated: boolean;
  projectPath?: string;
}): StudioErrorsPage {
  const limit = clampLimit(input.query.limit);
  const offset = Math.max(0, input.query.offset ?? 0);
  const view = input.query.view ?? "grouped";
  const sort = input.query.sort ?? "most-recent";
  const customSections = input.customSections ?? [];
  const errorGroupsById = buildGroupDetails(input.records);
  const relatedTraceGroupIdByRecordId = buildRelatedTraceGroupIdByRecordId(errorGroupsById);
  const occurrences = input.records
    .filter((record) => isErrorRecord(record))
    .map((record) =>
      toErrorOccurrence(record, {
        customSections,
        projectPath: input.projectPath,
        relatedTraceGroupId: relatedTraceGroupIdByRecordId.get(record.id) ?? null,
      }),
    )
    .filter((occurrence) => matchesErrorFilters(occurrence, input.query))
    .sort((left, right) => sortOccurrences(left, right, sort));

  const groups = buildErrorGroups(occurrences, sort);
  const pagedEntries =
    view === "grouped"
      ? groups.slice(offset, offset + limit)
      : occurrences.slice(offset, offset + limit);

  const timestamps = occurrences
    .map((occurrence) => occurrence.timestamp)
    .filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  const availableTypes = Array.from(new Set(occurrences.map((entry) => entry.type))).sort();
  const availableSourceFiles = Array.from(
    new Set(
      occurrences
        .map((entry) => entry.fingerprintSource.relativePath ?? entry.sourceLocation?.relativePath ?? null)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort();
  const availableSectionTags = Array.from(
    new Set(occurrences.flatMap((occurrence) => occurrence.sectionTags)),
  ).sort();

  return {
    entries: pagedEntries,
    groups,
    occurrences,
    stats: buildErrorStats(groups),
    totalMatched: occurrences.length,
    totalEntries: view === "grouped" ? groups.length : occurrences.length,
    scannedRecords: input.scannedRecords,
    returnedCount: pagedEntries.length,
    offset,
    limit,
    truncated: input.truncated,
    earliestTimestamp: timestamps[0] ?? null,
    latestTimestamp: timestamps[timestamps.length - 1] ?? null,
    availableTypes,
    availableSourceFiles,
    availableSectionTags,
  };
}

export function buildErrorGroupDetail(input: {
  records: StudioNormalizedRecord[];
  fingerprint: string;
  customSections?: StudioCustomSectionDefinition[];
  projectPath?: string;
}): StudioErrorGroupDetail | null {
  const page = buildErrorsPage({
    records: input.records,
    query: {
      view: "grouped",
      limit: MAX_LIMIT,
      offset: 0,
    },
    customSections: input.customSections,
    scannedRecords: input.records.length,
    truncated: false,
    projectPath: input.projectPath,
  });

  const group = page.groups.find((candidate) => candidate.fingerprint === input.fingerprint);
  if (!group) {
    return null;
  }

  return {
    group,
    occurrences: page.occurrences
      .filter((occurrence) => occurrence.fingerprint === input.fingerprint)
      .sort(compareOccurrencesAscending),
  };
}

function buildErrorGroups(
  occurrences: StudioErrorOccurrence[],
  sort: StudioErrorSort,
): StudioErrorGroupSummary[] {
  const earliest = getTimeBounds(occurrences).earliest;
  const latest = getTimeBounds(occurrences).latest;
  const grouped = new Map<string, StudioErrorOccurrence[]>();

  for (const occurrence of occurrences) {
    const bucket = grouped.get(occurrence.fingerprint) ?? [];
    bucket.push(occurrence);
    grouped.set(occurrence.fingerprint, bucket);
  }

  const summaries = Array.from(grouped.entries()).map(([fingerprint, groupOccurrences]) => {
    const sortedAscending = groupOccurrences.slice().sort(compareOccurrencesAscending);
    const sortedDescending = groupOccurrences.slice().sort(compareOccurrencesDescending);
    const first = sortedAscending[0]!;
    const last = sortedDescending[0]!;
    const representative = pickRepresentativeOccurrence(groupOccurrences);

    return {
      kind: "error-group" as const,
      fingerprint,
      errorType: representative.type,
      message: representative.message,
      messageFirstLine: representative.messageFirstLine,
      occurrenceCount: groupOccurrences.length,
      firstSeenAt: first.timestamp,
      lastSeenAt: last.timestamp,
      sourceLocation: representative.sourceLocation,
      fingerprintSource: representative.fingerprintSource,
      http: representative.http
        ? {
            method: representative.http.method,
            path: representative.http.path,
            statusCode: representative.http.statusCode,
            url: representative.http.url,
          }
        : null,
      sectionTags: Array.from(
        new Set(groupOccurrences.flatMap((occurrence) => occurrence.sectionTags)),
      ).sort(),
      sparklineBuckets: buildSparklineBuckets(groupOccurrences, earliest, latest),
      representativeOccurrenceId: representative.id,
      relatedTraceGroupId: representative.relatedTraceGroupId,
    };
  });

  return summaries.sort((left, right) => compareGroupSummaries(left, right, sort));
}

function buildErrorStats(groups: StudioErrorGroupSummary[]): StudioErrorStats {
  const totalOccurrences = groups.reduce((sum, group) => sum + group.occurrenceCount, 0);
  const uniqueTypes = new Set(groups.map((group) => group.errorType));
  const mostFrequentError = groups[0]
    ? groups
        .slice()
        .sort((left, right) => compareGroupSummaries(left, right, "most-frequent"))[0] ?? null
    : null;

  return {
    uniqueErrorTypes: uniqueTypes.size,
    totalOccurrences,
    mostFrequentError: mostFrequentError
      ? {
          fingerprint: mostFrequentError.fingerprint,
          type: mostFrequentError.errorType,
          messageFirstLine: mostFrequentError.messageFirstLine,
          count: mostFrequentError.occurrenceCount,
        }
      : null,
    newErrorsComparedToPreviousSessions: {
      available: false,
      count: null,
    },
  };
}

function toErrorOccurrence(
  record: StudioNormalizedRecord,
  input: {
    customSections: StudioCustomSectionDefinition[];
    projectPath?: string;
    relatedTraceGroupId: string | null;
  },
): StudioErrorOccurrence {
  const stackFrames = parseStackFrames(record.stack, input.projectPath);
  const fingerprintSource = resolveFingerprintSource(record, stackFrames);
  const type = resolveErrorType(record);
  const message = resolveErrorMessage(record);
  const messageFirstLine = firstLine(message);

  return {
    kind: "occurrence",
    id: record.id,
    fingerprint: buildFingerprint(type, messageFirstLine, fingerprintSource.key),
    timestamp: record.timestamp,
    level: record.level,
    type,
    message,
    messageFirstLine,
    fileId: record.fileId,
    fileName: record.fileName,
    filePath: record.filePath,
    lineNumber: record.lineNumber,
    caller: record.caller,
    stack: record.stack,
    stackFrames,
    http: record.http,
    sourceLocation: record.sourceLocation,
    fingerprintSource,
    sectionTags: getMatchedSectionIds(record, input.customSections),
    relatedTraceGroupId: input.relatedTraceGroupId,
    structuredFields: buildStructuredFields(record),
    raw: record.raw,
  };
}

function buildStructuredFields(record: StudioNormalizedRecord): Record<string, unknown> {
  return {
    bindings: record.bindings,
    data: record.data,
    error: record.error,
    caller: record.caller,
    type: record.type,
    source: record.source,
  };
}

function matchesErrorFilters(
  occurrence: StudioErrorOccurrence,
  input: StudioErrorsQueryInput,
): boolean {
  if (input.fileId && occurrence.fileId !== input.fileId) {
    return false;
  }

  if (input.type && occurrence.type.toLowerCase() !== input.type.toLowerCase()) {
    return false;
  }

  if (input.sourceFile) {
    const sourceFile =
      occurrence.fingerprintSource.relativePath ??
      occurrence.sourceLocation?.relativePath ??
      "";
    if (sourceFile !== input.sourceFile) {
      return false;
    }
  }

  if (input.sectionId && !matchesDetectedSectionByTag(occurrence, input.sectionId)) {
    return false;
  }

  if (input.from || input.to) {
    const occurrenceTime = occurrence.timestamp ? Date.parse(occurrence.timestamp) : Number.NaN;
    if (input.from) {
      const fromTime = Date.parse(input.from);
      if (Number.isFinite(fromTime) && Number.isFinite(occurrenceTime) && occurrenceTime < fromTime) {
        return false;
      }
    }
    if (input.to) {
      const toTime = Date.parse(input.to);
      if (Number.isFinite(toTime) && Number.isFinite(occurrenceTime) && occurrenceTime > toTime) {
        return false;
      }
    }
  }

  if (input.search) {
    const haystack = [
      occurrence.type,
      occurrence.message,
      occurrence.stack ?? "",
      occurrence.caller ?? "",
      occurrence.fingerprintSource.relativePath ?? "",
      JSON.stringify(occurrence.structuredFields),
      JSON.stringify(occurrence.raw),
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(input.search.toLowerCase())) {
      return false;
    }
  }

  return true;
}

function matchesDetectedSectionByTag(
  occurrence: StudioErrorOccurrence,
  sectionId: string,
): boolean {
  if (sectionId === "all-logs" || sectionId === "overview") {
    return true;
  }

  return occurrence.sectionTags.includes(sectionId);
}

function resolveErrorType(record: StudioNormalizedRecord): string {
  const errorObject = asPlainObject(record.error);
  const explicitName = readString(errorObject, ["name", "code"]);
  if (explicitName) {
    return explicitName;
  }

  if (record.type && /error|exception|panic|declined|failed/i.test(record.type)) {
    return record.type;
  }

  const stackHeader = record.stack?.split("\n")[0] ?? "";
  const stackNameMatch = stackHeader.match(/^([A-Za-z0-9_$.-]+(?:Error|Exception))/);
  if (stackNameMatch?.[1]) {
    return stackNameMatch[1];
  }

  return "Error";
}

function resolveErrorMessage(record: StudioNormalizedRecord): string {
  const errorObject = asPlainObject(record.error);
  const explicitMessage = readString(errorObject, ["message"]);
  if (explicitMessage) {
    return explicitMessage.trim();
  }

  const stackHeader = record.stack?.split("\n")[0] ?? "";
  const stackMessageMatch = stackHeader.match(/^[A-Za-z0-9_$.-]*(?:Error|Exception)?:?\s*(.+)$/);
  if (stackMessageMatch?.[1]) {
    return stackMessageMatch[1].trim();
  }

  if (record.message.trim().length > 0) {
    return record.message.trim();
  }

  return "Unknown error";
}

function resolveFingerprintSource(
  record: StudioNormalizedRecord,
  stackFrames: StudioErrorStackFrame[],
): StudioErrorFingerprintSource {
  if (record.sourceLocation) {
    return fromResolvedSourceLocation("source-location", record.sourceLocation);
  }

  const stackFrame = stackFrames.find((frame) => frame.inProject && frame.relativePath && frame.line);
  if (stackFrame) {
    return {
      key: `${stackFrame.relativePath}:${stackFrame.line}`,
      kind: "stack-frame",
      relativePath: stackFrame.relativePath,
      line: stackFrame.line,
      column: stackFrame.column,
    };
  }

  const callerLocation = parseCallerLocation(record.caller);
  if (callerLocation) {
    return {
      key: `${callerLocation.relativePath}:${callerLocation.line}`,
      kind: "caller",
      relativePath: callerLocation.relativePath,
      line: callerLocation.line,
      column: callerLocation.column,
    };
  }

  return {
    key: "unknown",
    kind: "unknown",
    relativePath: null,
    line: null,
    column: null,
  };
}

function fromResolvedSourceLocation(
  kind: StudioErrorFingerprintSource["kind"],
  location: StudioResolvedSourceLocation,
): StudioErrorFingerprintSource {
  return {
    key: `${location.relativePath}:${location.line}`,
    kind,
    relativePath: location.relativePath,
    line: location.line,
    column: location.column,
  };
}

function parseStackFrames(
  stack: string | null,
  projectPath: string | undefined,
): StudioErrorStackFrame[] {
  if (!stack) {
    return [];
  }

  return stack
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseStackFrame(line, projectPath));
}

function parseStackFrame(
  line: string,
  projectPath: string | undefined,
): StudioErrorStackFrame {
  const match =
    line.match(/\((.+):(\d+):(\d+)\)$/) ??
    line.match(/at (.+):(\d+):(\d+)$/);

  if (!match) {
    return {
      raw: line,
      relativePath: null,
      absolutePath: null,
      line: null,
      column: null,
      inProject: false,
    };
  }

  const absolutePath = match[1] ?? null;
  const lineNumber = Number(match[2]);
  const columnNumber = Number(match[3]);
  const inProject =
    Boolean(projectPath && absolutePath && path.isAbsolute(absolutePath) && absolutePath.startsWith(projectPath));
  const relativePath =
    inProject && projectPath && absolutePath ? path.relative(projectPath, absolutePath) : null;

  return {
    raw: line,
    relativePath,
    absolutePath,
    line: Number.isFinite(lineNumber) ? lineNumber : null,
    column: Number.isFinite(columnNumber) ? columnNumber : null,
    inProject,
  };
}

function parseCallerLocation(
  caller: string | null,
): { relativePath: string; line: number; column: number | null } | null {
  if (!caller) {
    return null;
  }

  const match = caller.match(/(.+):(\d+)(?::(\d+))?$/);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  const lineNumber = Number(match[2]);
  const columnNumber = match[3] ? Number(match[3]) : null;
  return {
    relativePath: match[1],
    line: Number.isFinite(lineNumber) ? lineNumber : 0,
    column: columnNumber && Number.isFinite(columnNumber) ? columnNumber : null,
  };
}

function buildFingerprint(type: string, messageFirstLine: string, sourceKey: string): string {
  const normalized = [
    normalizeFingerprintPart(type),
    normalizeFingerprintPart(messageFirstLine),
    sourceKey,
  ].join("|");

  return Buffer.from(normalized).toString("base64url");
}

function normalizeFingerprintPart(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b[0-9a-f]{8,}\b/gi, "<hex>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27}\b/gi, "<uuid>")
    .replace(/\b\d{6,}\b/g, "<num>")
    .toLowerCase();
}

function firstLine(value: string): string {
  return value.split("\n")[0]?.trim() || "Unknown error";
}

function pickRepresentativeOccurrence(
  occurrences: StudioErrorOccurrence[],
): StudioErrorOccurrence {
  return occurrences
    .slice()
    .sort((left, right) => {
      const leftScore = (left.stack ? 2 : 0) + (left.sourceLocation ? 1 : 0);
      const rightScore = (right.stack ? 2 : 0) + (right.sourceLocation ? 1 : 0);
      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }
      return compareOccurrencesDescending(left, right);
    })[0]!;
}

function buildSparklineBuckets(
  occurrences: StudioErrorOccurrence[],
  earliest: number | null,
  latest: number | null,
): number[] {
  const buckets = new Array<number>(SPARKLINE_BUCKETS).fill(0);
  const validTimes = occurrences
    .map((occurrence) => (occurrence.timestamp ? Date.parse(occurrence.timestamp) : Number.NaN))
    .filter((value) => Number.isFinite(value));

  if (!validTimes.length) {
    buckets[0] = occurrences.length;
    return buckets;
  }

  const start = earliest ?? Math.min(...validTimes);
  const end = latest ?? Math.max(...validTimes);
  if (start === end) {
    buckets[0] = validTimes.length;
    return buckets;
  }

  const span = Math.max(1, end - start);
  for (const time of validTimes) {
    const rawIndex = Math.floor(((time - start) / span) * SPARKLINE_BUCKETS);
    const index = Math.max(0, Math.min(SPARKLINE_BUCKETS - 1, rawIndex));
    buckets[index] += 1;
  }

  return buckets;
}

function getTimeBounds(occurrences: StudioErrorOccurrence[]): {
  earliest: number | null;
  latest: number | null;
} {
  const valid = occurrences
    .map((occurrence) => (occurrence.timestamp ? Date.parse(occurrence.timestamp) : Number.NaN))
    .filter((value) => Number.isFinite(value));

  if (!valid.length) {
    return { earliest: null, latest: null };
  }

  return {
    earliest: Math.min(...valid),
    latest: Math.max(...valid),
  };
}

function buildRelatedTraceGroupIdByRecordId(
  groups: Map<string, { records: StudioNormalizedRecord[] }>,
): Map<string, string> {
  const related = new Map<string, string>();
  for (const [groupId, group] of groups.entries()) {
    for (const record of group.records) {
      if (!related.has(record.id)) {
        related.set(record.id, groupId);
      }
    }
  }
  return related;
}

function compareGroupSummaries(
  left: StudioErrorGroupSummary,
  right: StudioErrorGroupSummary,
  sort: StudioErrorSort,
): number {
  if (sort === "most-frequent" && left.occurrenceCount !== right.occurrenceCount) {
    return right.occurrenceCount - left.occurrenceCount;
  }

  if (sort === "first-seen") {
    const byFirstSeen = compareTimestampsAscending(left.firstSeenAt, right.firstSeenAt);
    if (byFirstSeen !== 0) {
      return byFirstSeen;
    }
  } else {
    const byLastSeen = compareTimestampsDescending(left.lastSeenAt, right.lastSeenAt);
    if (byLastSeen !== 0) {
      return byLastSeen;
    }
  }

  if (left.occurrenceCount !== right.occurrenceCount) {
    return right.occurrenceCount - left.occurrenceCount;
  }

  return left.messageFirstLine.localeCompare(right.messageFirstLine);
}

function compareOccurrencesDescending(
  left: StudioErrorOccurrence,
  right: StudioErrorOccurrence,
): number {
  const byTimestamp = compareTimestampsDescending(left.timestamp, right.timestamp);
  if (byTimestamp !== 0) {
    return byTimestamp;
  }
  return right.id.localeCompare(left.id);
}

function compareOccurrencesAscending(
  left: StudioErrorOccurrence,
  right: StudioErrorOccurrence,
): number {
  const byTimestamp = compareTimestampsAscending(left.timestamp, right.timestamp);
  if (byTimestamp !== 0) {
    return byTimestamp;
  }
  return left.id.localeCompare(right.id);
}

function sortOccurrences(
  left: StudioErrorOccurrence,
  right: StudioErrorOccurrence,
  sort: StudioErrorSort,
): number {
  if (sort === "first-seen") {
    return compareOccurrencesAscending(left, right);
  }

  return compareOccurrencesDescending(left, right);
}

function compareTimestampsDescending(left: string | null, right: string | null): number {
  const leftTime = left ? Date.parse(left) : Number.NaN;
  const rightTime = right ? Date.parse(right) : Number.NaN;

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  if (Number.isFinite(leftTime)) {
    return -1;
  }
  if (Number.isFinite(rightTime)) {
    return 1;
  }
  return 0;
}

function compareTimestampsAscending(left: string | null, right: string | null): number {
  const leftTime = left ? Date.parse(left) : Number.NaN;
  const rightTime = right ? Date.parse(right) : Number.NaN;

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  if (Number.isFinite(leftTime)) {
    return -1;
  }
  if (Number.isFinite(rightTime)) {
    return 1;
  }
  return 0;
}

function readString(value: Record<string, unknown> | null, keys: string[]): string | null {
  if (!value) {
    return null;
  }

  for (const key of keys) {
    const nested = value[key];
    if (typeof nested === "string" && nested.trim().length > 0) {
      return nested.trim();
    }
  }

  return null;
}

function asPlainObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}
