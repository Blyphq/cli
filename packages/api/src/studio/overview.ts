import { buildGroupDetails } from "./grouping";
import { buildErrorGroupDetail, buildErrorsPage } from "./errors";
import { matchesDetectedSection, matchesErrorSignal } from "./sections";

import type {
  StudioCustomSectionDefinition,
  StudioDetectedSection,
  StudioNormalizedRecord,
  StudioOverview,
  StudioOverviewFeedField,
  StudioOverviewRecentErrorItem,
  StudioOverviewSectionCard,
  StudioOverviewTarget,
} from "./types";

const FEED_LIMIT = 25;
const RECENT_ERRORS_LIMIT = 5;
const ERROR_TREND_WINDOW_MS = 10 * 60 * 1000;
const WARNING_WINDOW_MS = 15 * 60 * 1000;
const ACTIVE_TRACE_WINDOW_MS = 5 * 60 * 1000;

const START_SIGNAL_RE = /\b(start|started|begin|began|queued|received)\b/i;
const END_SIGNAL_RE = /\b(complete|completed|finish|finished|success|succeeded|failed|error|cancelled|canceled)\b/i;

export function buildStudioOverview(input: {
  records: StudioNormalizedRecord[];
  projectPath: string;
  generatedAt?: string;
  sections: StudioDetectedSection[];
  customSections?: StudioCustomSectionDefinition[];
}): StudioOverview {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const customSections = input.customSections ?? [];
  const sortedDescending = input.records.slice().sort(compareRecordsDescending);
  const groupDetails = buildGroupDetails(input.records);
  const recordToGroupId = buildRecordToGroupId(groupDetails);

  return {
    connectedAt: generatedAt,
    generatedAt,
    stats: {
      totalEvents: buildTotalEventsStat(input.records.length),
      errorRate: buildErrorRateStat(input.records, generatedAt),
      activeTraces: buildActiveTracesStat(input.records, generatedAt),
      warnings: buildWarningsStat(input.records, generatedAt),
      avgResponseTime: buildAvgResponseTimeStat(input.records),
      uptime: {
        value: 0,
        label: "Uptime",
        status: "healthy",
        helperText: "Time since Studio connected to this project.",
      },
    },
    liveFeed: sortedDescending.slice(0, FEED_LIMIT).map((record) =>
      buildFeedItem(record, input.sections, customSections, recordToGroupId),
    ),
    sections: buildSectionCards(input.sections, input.records, generatedAt, customSections),
    recentErrors: buildRecentErrors(input.records, input.projectPath, customSections),
  };
}

function buildTotalEventsStat(totalEvents: number) {
  return {
    value: totalEvents,
    label: "Total events",
    status: totalEvents > 0 ? "healthy" : "warning",
    helperText:
      totalEvents > 0
        ? "Count of all events in the current overview scope."
        : "No events matched the current overview scope.",
  } as const;
}

function buildErrorRateStat(
  records: StudioNormalizedRecord[],
  generatedAt: string,
) {
  const totalEvents = records.length;
  const errorCount = records.filter((record) => matchesErrorSignal(record)).length;
  const value = totalEvents > 0 ? (errorCount / totalEvents) * 100 : 0;
  const now = parseTimestamp(generatedAt);
  const currentStart = now - ERROR_TREND_WINDOW_MS;
  const previousStart = currentStart - ERROR_TREND_WINDOW_MS;
  const currentWindow = records.filter((record) => {
    const timestamp = parseTimestamp(record.timestamp);
    return Number.isFinite(timestamp) && timestamp >= currentStart && timestamp <= now;
  });
  const previousWindow = records.filter((record) => {
    const timestamp = parseTimestamp(record.timestamp);
    return Number.isFinite(timestamp) && timestamp >= previousStart && timestamp < currentStart;
  });
  const currentRate = rateFor(currentWindow);
  const previousRate = rateFor(previousWindow);
  const deltaPercent = previousRate === 0 ? (currentRate === 0 ? 0 : 100) : ((currentRate - previousRate) / previousRate) * 100;
  const trend =
    Math.abs(currentRate - previousRate) < 0.1
      ? "flat"
      : currentRate > previousRate
        ? "up"
        : "down";

  return {
    value,
    label: "Error rate",
    status: errorCount > 0 || value >= 2 ? "critical" : value > 0 ? "warning" : "healthy",
    helperText:
      totalEvents > 0
        ? `${errorCount} errors in ${totalEvents} events.`
        : "No events in scope.",
    trend,
    deltaPercent: Number.isFinite(deltaPercent) ? Math.round(deltaPercent * 10) / 10 : null,
    comparisonWindowLabel: "vs last 10 min",
  } as const;
}

function buildWarningsStat(records: StudioNormalizedRecord[], generatedAt: string) {
  const now = parseTimestamp(generatedAt);
  const count = records.filter((record) => {
    const timestamp = parseTimestamp(record.timestamp);
    return (
      Number.isFinite(timestamp) &&
      timestamp >= now - WARNING_WINDOW_MS &&
      isWarningRecord(record)
    );
  }).length;

  return {
    value: count,
    label: "Warnings",
    status: count >= 10 ? "critical" : count > 0 ? "warning" : "healthy",
    helperText: "Warning-level events in the last 15 minutes.",
  } as const;
}

function buildAvgResponseTimeStat(records: StudioNormalizedRecord[]) {
  const durations = records
    .map((record) => record.http?.durationMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => left - right);

  if (durations.length === 0) {
    return {
      value: null,
      label: "Avg response time",
      status: "healthy",
      helperText: "No HTTP timing data.",
    } as const;
  }

  const midpoint = Math.floor((durations.length - 1) / 2);
  const p50 =
    durations.length % 2 === 0
      ? (durations[midpoint]! + durations[midpoint + 1]!) / 2
      : durations[midpoint]!;

  return {
    value: Math.round(p50),
    label: "Avg response time",
    status: p50 >= 1000 ? "critical" : p50 >= 500 ? "warning" : "healthy",
    helperText: "p50 across HTTP logs in the current overview scope.",
  } as const;
}

function buildActiveTracesStat(records: StudioNormalizedRecord[], generatedAt: string) {
  const now = parseTimestamp(generatedAt);
  const traceBuckets = new Map<string, StudioNormalizedRecord[]>();

  for (const record of records) {
    const traceKey = getTraceKey(record);
    if (!traceKey) {
      continue;
    }
    const items = traceBuckets.get(traceKey) ?? [];
    items.push(record);
    traceBuckets.set(traceKey, items);
  }

  let activeCount = 0;
  for (const bucket of traceBuckets.values()) {
    const sorted = bucket.slice().sort(compareRecordsAscending);
    const lastRecord = sorted[sorted.length - 1];
    if (!lastRecord) {
      continue;
    }
    const lastSeen = parseTimestamp(lastRecord.timestamp);
    if (!Number.isFinite(lastSeen) || lastSeen < now - ACTIVE_TRACE_WINDOW_MS) {
      continue;
    }

    let latestStartIndex = -1;
    let hasLifecycleSignals = false;
    for (let index = 0; index < sorted.length; index += 1) {
      const signal = classifyLifecycleSignal(sorted[index]!);
      if (signal === "start") {
        latestStartIndex = index;
        hasLifecycleSignals = true;
      } else if (signal === "end") {
        hasLifecycleSignals = true;
      }
    }

    if (!hasLifecycleSignals || latestStartIndex < 0) {
      continue;
    }

    const hasEndAfterStart = sorted
      .slice(latestStartIndex + 1)
      .some((record) => classifyLifecycleSignal(record) === "end");

    if (!hasEndAfterStart) {
      activeCount += 1;
    }
  }

  return {
    value: activeCount,
    label: "Active traces",
    status: activeCount >= 25 ? "warning" : "healthy",
    helperText: "Recently started traces without a completion signal yet.",
  } as const;
}

function buildFeedItem(
  record: StudioNormalizedRecord,
  sections: StudioDetectedSection[],
  customSections: StudioCustomSectionDefinition[],
  recordToGroupId: Map<string, string>,
) {
  return {
    recordId: record.id,
    timestamp: record.timestamp,
    level: record.level,
    message: record.message,
    summaryFields: buildFeedFields(record),
    target: buildFeedTarget(record, sections, customSections, recordToGroupId),
  };
}

function buildFeedFields(record: StudioNormalizedRecord): StudioOverviewFeedField[] {
  const fields: StudioOverviewFeedField[] = [];

  if (record.http?.method && (record.http.path ?? record.http.url)) {
    fields.push({
      key: "HTTP",
      value: `${record.http.method} ${record.http.path ?? record.http.url}`,
    });
  }
  if (typeof record.http?.statusCode === "number") {
    fields.push({ key: "Status", value: String(record.http.statusCode) });
  }
  if (typeof record.http?.durationMs === "number") {
    fields.push({ key: "Duration", value: `${Math.round(record.http.durationMs)}ms` });
  }
  if (record.type) {
    fields.push({ key: "Type", value: record.type });
  }

  const userValue = getString(record, ["user.email", "user.id", "session.userId"]);
  if (userValue) {
    fields.push({ key: "User", value: userValue });
  }

  const traceValue = getTraceLabel(record);
  if (traceValue) {
    fields.push({ key: "Trace", value: traceValue });
  }

  const sourceValue = getSourceValue(record);
  if (sourceValue) {
    fields.push({ key: "Source", value: sourceValue });
  }

  const deduped = new Map<string, StudioOverviewFeedField>();
  for (const field of fields) {
    const key = `${field.key}:${field.value}`;
    if (!deduped.has(key)) {
      deduped.set(key, field);
    }
  }

  return Array.from(deduped.values()).slice(0, 3);
}

function buildFeedTarget(
  record: StudioNormalizedRecord,
  sections: StudioDetectedSection[],
  customSections: StudioCustomSectionDefinition[],
  recordToGroupId: Map<string, string>,
): StudioOverviewTarget {
  const matchedSection = sections.find(
    (section) => section.id !== "errors" && matchesDetectedSection(record, section.id, customSections),
  );
  const groupId = recordToGroupId.get(record.id);

  if (matchedSection && groupId) {
    return {
      sectionId: matchedSection.id,
      selection: { kind: "group", id: groupId },
    };
  }

  if (matchedSection) {
    return {
      sectionId: matchedSection.id,
      selection: { kind: "record", id: record.id },
    };
  }

  if (groupId) {
    return {
      sectionId: "all-logs",
      selection: { kind: "group", id: groupId },
    };
  }

  return {
    sectionId: "all-logs",
    selection: { kind: "record", id: record.id },
  };
}

function buildSectionCards(
  detectedSections: StudioDetectedSection[],
  records: StudioNormalizedRecord[],
  generatedAt: string,
  customSections: StudioCustomSectionDefinition[],
): StudioOverviewSectionCard[] {
  const now = parseTimestamp(generatedAt);

  return detectedSections.map((section) => {
    const sectionRecords = records.filter((record) =>
      matchesDetectedSection(record, section.id, customSections),
    );
    const errorCount = sectionRecords.filter((record) => matchesErrorSignal(record)).length;
    const warningCount = sectionRecords.filter((record) => {
      const timestamp = parseTimestamp(record.timestamp);
      return Number.isFinite(timestamp) && timestamp >= now - WARNING_WINDOW_MS && isWarningRecord(record);
    }).length;

    return {
      id: section.id,
      label: section.label,
      icon: section.icon,
      eventCount: sectionRecords.length,
      errorCount,
      lastEventAt: section.lastMatchedAt,
      status: errorCount > 0 ? "critical" : warningCount > 0 ? "warning" : "healthy",
    };
  });
}

function buildRecentErrors(
  records: StudioNormalizedRecord[],
  projectPath: string,
  customSections: StudioCustomSectionDefinition[],
): StudioOverviewRecentErrorItem[] {
  const errorPage = buildErrorsPage({
    records,
    input: { sort: "most-recent", view: "grouped", limit: RECENT_ERRORS_LIMIT, offset: 0 },
    projectPath,
    customSections,
    truncated: false,
  });

  return errorPage.groups.slice(0, RECENT_ERRORS_LIMIT).map((group) => {
    const detail = buildErrorGroupDetail({
      groupId: group.id,
      records,
      projectPath,
      customSections,
    });

    return {
      groupId: group.id,
      recordId: group.representativeRecordId,
      message: group.message,
      timestamp: group.lastSeen,
      sourceFile: group.sourceFile,
      sourceLine: group.sourceLine,
      traceReference: detail?.traceReference ?? null,
    };
  });
}

function buildRecordToGroupId(groupDetails: Map<string, { records: StudioNormalizedRecord[] }>) {
  const recordToGroupId = new Map<string, string>();
  for (const [groupId, detail] of groupDetails.entries()) {
    for (const record of detail.records) {
      if (!recordToGroupId.has(record.id)) {
        recordToGroupId.set(record.id, groupId);
      }
    }
  }
  return recordToGroupId;
}

function classifyLifecycleSignal(record: StudioNormalizedRecord): "start" | "end" | null {
  const haystack = [
    record.message,
    record.type ?? "",
    stringifyData(record.data),
    stringifyData(record.raw),
  ]
    .join(" ")
    .trim();

  if (START_SIGNAL_RE.test(haystack)) {
    return "start";
  }
  if (END_SIGNAL_RE.test(haystack)) {
    return "end";
  }
  return null;
}

function getTraceKey(record: StudioNormalizedRecord): string | null {
  for (const key of ["traceId", "trace.id", "requestId", "correlationId", "groupId"]) {
    const value = getString(record, [key]);
    if (value) {
      return `${key}:${value}`;
    }
  }
  return null;
}

function getTraceLabel(record: StudioNormalizedRecord): string | null {
  for (const key of ["traceId", "trace.id", "requestId", "correlationId", "groupId"]) {
    const value = getString(record, [key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function getSourceValue(record: StudioNormalizedRecord): string | null {
  if (record.sourceLocation) {
    return `${record.sourceLocation.relativePath}:${record.sourceLocation.line}`;
  }
  if (record.caller) {
    return record.caller;
  }
  return null;
}

function getString(record: StudioNormalizedRecord, keys: string[]): string | null {
  const candidates = [
    record.bindings,
    record.data,
    record.raw,
    record.error,
    {
      type: record.type,
      caller: record.caller,
      message: record.message,
    },
  ];

  for (const source of candidates) {
    if (!source || typeof source !== "object") {
      continue;
    }

    for (const key of keys) {
      const value = getNestedValue(source, key);
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }

  return null;
}

function getNestedValue(value: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[part];
  }, value);
}

function stringifyData(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function isWarningRecord(record: StudioNormalizedRecord): boolean {
  const level = record.level.trim().toLowerCase();
  return level === "warning" || level === "warn";
}

function rateFor(records: StudioNormalizedRecord[]): number {
  if (records.length === 0) {
    return 0;
  }
  return (records.filter((record) => matchesErrorSignal(record)).length / records.length) * 100;
}

function parseTimestamp(value: string | null | undefined): number {
  if (!value) {
    return Number.NaN;
  }
  return Date.parse(value);
}

function compareRecordsDescending(left: StudioNormalizedRecord, right: StudioNormalizedRecord): number {
  return compareRecordsAscending(right, left);
}

function compareRecordsAscending(left: StudioNormalizedRecord, right: StudioNormalizedRecord): number {
  const leftTime = parseTimestamp(left.timestamp);
  const rightTime = parseTimestamp(right.timestamp);

  if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime)) {
    return left.id.localeCompare(right.id);
  }
  if (!Number.isFinite(leftTime)) {
    return 1;
  }
  if (!Number.isFinite(rightTime)) {
    return -1;
  }
  if (leftTime === rightTime) {
    return left.id.localeCompare(right.id);
  }
  return leftTime - rightTime;
}
