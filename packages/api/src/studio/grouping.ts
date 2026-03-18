import type {
  StudioGroupingReason,
  StudioLogListEntry,
  StudioNormalizedRecord,
  StudioNormalizedRecordListItem,
  StudioStructuredGroupDetail,
} from "./types";

const EXPLICIT_GROUP_KEYS = [
  { key: "groupId", reason: "explicit-group-id" as const },
  { key: "requestId", reason: "request-id" as const },
  { key: "correlationId", reason: "correlation-id" as const },
  { key: "traceId", reason: "trace-id" as const },
  { key: "sessionId", reason: "heuristic" as const },
] as const;

interface GroupedRecordInfo {
  record: StudioNormalizedRecord;
  groupId: string;
  groupKey: string;
  groupingReason: StudioGroupingReason;
}

interface GroupBucket {
  id: string;
  key: string;
  reason: StudioGroupingReason;
  records: StudioNormalizedRecord[];
}

export function buildLogEntries(
  matchedRecords: StudioNormalizedRecord[],
  allRecords: StudioNormalizedRecord[],
  grouping: "flat" | "grouped",
): {
  entries: StudioLogListEntry[];
  groups: Map<string, StudioStructuredGroupDetail>;
} {
  if (grouping === "flat") {
    return {
      entries: matchedRecords.map(toRecordEntry),
      groups: new Map(),
    };
  }

  const allGroups = buildGroupBuckets(allRecords);
  const matchedGroups = buildMatchedGroupBuckets(matchedRecords, allGroups);
  const groupedRecordIds = new Set<string>();
  const entryByRecordId = new Map<string, StudioLogListEntry>();

  for (const group of matchedGroups.values()) {
    const detail = toStructuredGroupDetail(group, allGroups.get(group.id)?.records ?? group.records);
    for (const record of group.records) {
      groupedRecordIds.add(record.id);
      entryByRecordId.set(record.id, detail.group);
    }
  }

  for (const record of matchedRecords) {
    if (!groupedRecordIds.has(record.id)) {
      entryByRecordId.set(record.id, toRecordEntry(record));
    }
  }

  const seen = new Set<string>();
  const entries: StudioLogListEntry[] = [];

  for (const record of matchedRecords) {
    const entry = entryByRecordId.get(record.id);

    if (!entry || seen.has(entry.id)) {
      continue;
    }

    seen.add(entry.id);
    entries.push(entry);
  }

  const details = new Map<string, StudioStructuredGroupDetail>();
  for (const [groupId, group] of allGroups.entries()) {
    details.set(groupId, toStructuredGroupDetail(group, group.records));
  }

  return {
    entries,
    groups: details,
  };
}

export function buildGroupDetails(
  records: StudioNormalizedRecord[],
): Map<string, StudioStructuredGroupDetail> {
  const groups = buildGroupBuckets(records);
  const details = new Map<string, StudioStructuredGroupDetail>();

  for (const [groupId, group] of groups.entries()) {
    details.set(groupId, toStructuredGroupDetail(group, group.records));
  }

  return details;
}

function buildMatchedGroupBuckets(
  matchedRecords: StudioNormalizedRecord[],
  allGroups: Map<string, GroupBucket>,
): Map<string, GroupBucket> {
  const matched = new Map<string, GroupBucket>();

  for (const record of matchedRecords) {
    const grouped = resolveExplicitGroupInfo(record);

    if (!grouped) {
      continue;
    }

    const bucket = matched.get(grouped.groupId);

    if (bucket) {
      bucket.records.push(record);
      continue;
    }

    matched.set(grouped.groupId, {
      id: grouped.groupId,
      key: grouped.groupKey,
      reason: grouped.groupingReason,
      records: [record],
    });
  }

  const heuristicGroups = buildHeuristicMatchedBuckets(matchedRecords);
  for (const [groupId, group] of heuristicGroups.entries()) {
    matched.set(groupId, group);
  }

  for (const [groupId, group] of matched.entries()) {
    const fullGroup = allGroups.get(groupId);

    if (!fullGroup || group.reason !== "heuristic") {
      continue;
    }

    matched.set(groupId, {
      ...group,
      records: group.records.slice().sort(compareRecordsDescending),
    });

    fullGroup.records.sort(compareRecordsDescending);
  }

  return matched;
}

function buildGroupBuckets(records: StudioNormalizedRecord[]): Map<string, GroupBucket> {
  const groups = new Map<string, GroupBucket>();
  const heuristicCandidates = records.filter(
    (record) => record.source === "structured" && !resolveExplicitGroupInfo(record),
  );

  for (const record of records) {
    const grouped = resolveExplicitGroupInfo(record);

    if (!grouped) {
      continue;
    }

    const bucket = groups.get(grouped.groupId);

    if (bucket) {
      bucket.records.push(record);
      continue;
    }

    groups.set(grouped.groupId, {
      id: grouped.groupId,
      key: grouped.groupKey,
      reason: grouped.groupingReason,
      records: [record],
    });
  }

  const heuristicGroups = buildHeuristicBuckets(heuristicCandidates);
  for (const [groupId, group] of heuristicGroups.entries()) {
    groups.set(groupId, group);
  }

  return groups;
}

function buildHeuristicMatchedBuckets(
  records: StudioNormalizedRecord[],
): Map<string, GroupBucket> {
  return buildHeuristicBuckets(
    records.filter(
      (record) => record.source === "structured" && !resolveExplicitGroupInfo(record),
    ),
  );
}

function buildHeuristicBuckets(records: StudioNormalizedRecord[]): Map<string, GroupBucket> {
  const bySignature = new Map<string, StudioNormalizedRecord[]>();

  for (const record of records) {
    const signature = buildHeuristicSignature(record);

    if (!signature) {
      continue;
    }

    const group = bySignature.get(signature) ?? [];
    group.push(record);
    bySignature.set(signature, group);
  }

  const buckets = new Map<string, GroupBucket>();

  for (const [signature, signatureRecords] of bySignature.entries()) {
    const sorted = signatureRecords
      .slice()
      .sort((left, right) => compareRecordsAscending(left, right));

    let cluster: StudioNormalizedRecord[] = [];

    const flushCluster = () => {
      if (cluster.length < 2) {
        cluster = [];
        return;
      }

      const first = cluster[0];
      if (!first) {
        cluster = [];
        return;
      }

      const bucketId = `group:heuristic:${signature}:${first.id}`;
      buckets.set(bucketId, {
        id: bucketId,
        key: signature,
        reason: "heuristic",
        records: cluster.slice().sort(compareRecordsDescending),
      });
      cluster = [];
    };

    for (const record of sorted) {
      const previous = cluster[cluster.length - 1];

      if (!previous) {
        cluster.push(record);
        continue;
      }

      const previousTime = parseTimestamp(previous.timestamp);
      const currentTime = parseTimestamp(record.timestamp);

      if (
        Number.isFinite(previousTime) &&
        Number.isFinite(currentTime) &&
        Math.abs(currentTime - previousTime) <= 5_000
      ) {
        cluster.push(record);
        continue;
      }

      flushCluster();
      cluster.push(record);
    }

    flushCluster();
  }

  return buckets;
}

function toStructuredGroupDetail(
  matchedGroup: GroupBucket,
  fullGroupRecords: StudioNormalizedRecord[],
): StudioStructuredGroupDetail {
  const sortedFullRecords = fullGroupRecords.slice().sort(compareRecordsDescending);
  const sortedMatchedRecords = matchedGroup.records.slice().sort(compareRecordsDescending);
  const representative = sortedMatchedRecords[0] ?? sortedFullRecords[0];
  const previewMessages = Array.from(
    new Set(
      sortedMatchedRecords
        .flatMap((record) => extractStructuredPreviewMessages(record))
        .filter((message) => message.length > 0),
    ),
  ).slice(0, 3);
  const timestamps = fullGroupRecords
    .map((record) => record.timestamp)
    .filter((value): value is string => typeof value === "string");
  const files = Array.from(new Set(fullGroupRecords.map((record) => record.fileId)));
  const fileNames = Array.from(new Set(fullGroupRecords.map((record) => record.fileName)));
  const levels = Array.from(
    new Set(fullGroupRecords.map((record) => record.level).filter(Boolean)),
  );
  const nestedEventCount = fullGroupRecords.reduce(
    (count, record) => count + getNestedStructuredEventCount(record),
    0,
  );

  return {
    group: {
      kind: "structured-group",
      id: matchedGroup.id,
      groupKey: matchedGroup.key,
      groupingReason: matchedGroup.reason,
      title: buildGroupTitle(representative ?? null, matchedGroup.key, previewMessages),
      type:
        representative?.type && !isGenericStructuredType(representative.type)
          ? representative.type
          : null,
      source: "structured",
      recordCount: fullGroupRecords.length,
      matchedRecordCount: matchedGroup.records.length,
      timestampStart: timestamps.length > 0 ? timestamps.slice().sort()[0] ?? null : null,
      timestampEnd:
        timestamps.length > 0 ? timestamps.slice().sort().at(-1) ?? null : null,
      levelSummary: levels,
      fileIds: files,
      fileNames,
      representativeRecordId: representative?.id ?? matchedGroup.id,
      nestedEventCount,
      previewMessages,
    },
    records: sortedFullRecords,
  };
}

function buildGroupTitle(
  record: StudioNormalizedRecord | null,
  groupKey: string,
  previewMessages: string[],
): string {
  if (!record) {
    return "Structured log group";
  }

  if (record.http?.method && (record.http.path ?? record.http.url)) {
    return `${record.http.method} ${record.http.path ?? record.http.url}`;
  }

  const previewTitle = previewMessages[0];
  if (previewTitle) {
    return previewTitle;
  }

  if (record.message && !isGenericStructuredLabel(record.message, record.type)) {
    return record.message;
  }

  if (record.type && !isGenericStructuredType(record.type)) {
    return record.type;
  }

  if (groupKey.trim().length > 0) {
    return groupKey;
  }

  if (record.message) {
    return record.message;
  }

  return "Structured log group";
}

function extractStructuredPreviewMessages(record: StudioNormalizedRecord): string[] {
  const previews: string[] = [];

  const eventMessages = extractNestedEventMessages(record);
  if (eventMessages.length > 0) {
    previews.push(...eventMessages);
  }

  const httpPreview = buildHttpPreview(record);
  if (httpPreview) {
    previews.push(httpPreview);
  }

  if (record.message && !isGenericStructuredLabel(record.message, record.type)) {
    previews.push(record.message);
  }

  if (record.type && !isGenericStructuredType(record.type)) {
    previews.push(record.type);
  }

  return Array.from(new Set(previews)).slice(0, 3);
}

function getNestedStructuredEventCount(record: StudioNormalizedRecord): number {
  const raw = asPlainObject(record.raw);
  const events = readStructuredEvents(raw);
  return events.length;
}

function extractNestedEventMessages(record: StudioNormalizedRecord): string[] {
  const raw = asPlainObject(record.raw);
  const events = readStructuredEvents(raw);

  return events
    .map((event) => summarizeStructuredEvent(event))
    .filter((message): message is string => typeof message === "string" && message.length > 0);
}

function readStructuredEvents(value: Record<string, unknown> | null): unknown[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value.events)) {
    return value.events;
  }

  const data = asPlainObject(value.data);
  if (data && Array.isArray(data.events)) {
    return data.events;
  }

  return [];
}

function summarizeStructuredEvent(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim().length > 0 ? value.trim() : null;
  }

  const event = asPlainObject(value);
  if (!event) {
    return null;
  }

  const message = readFirstString(event, ["message", "summary", "title", "name", "event", "action", "step"]);
  const type = readFirstString(event, ["type", "kind"]);
  const method = readFirstString(event, ["method"]);
  const path = readFirstString(event, ["path", "url", "route"]);
  const status =
    typeof event.status === "number"
      ? String(event.status)
      : typeof event.statusCode === "number"
        ? String(event.statusCode)
        : null;
  const duration =
    typeof event.duration === "number"
      ? `${event.duration}ms`
      : typeof event.durationMs === "number"
        ? `${event.durationMs}ms`
        : null;

  if (method && path) {
    return [method, path, status, duration].filter(Boolean).join(" ");
  }

  if (message && type && !isGenericStructuredLabel(message, type)) {
    return `${message}`;
  }

  if (message) {
    return message;
  }

  if (type && !isGenericStructuredType(type)) {
    return type;
  }

  const keyValues = Object.entries(event)
    .filter(([, nested]) => typeof nested === "string" || typeof nested === "number")
    .slice(0, 3)
    .map(([key, nested]) => `${key}: ${String(nested)}`);

  return keyValues.length > 0 ? keyValues.join(" • ") : null;
}

function buildHttpPreview(record: StudioNormalizedRecord): string | null {
  if (!record.http?.method) {
    return null;
  }

  const target = record.http.path ?? record.http.url;
  if (!target) {
    return null;
  }

  const status = record.http.statusCode ? `${record.http.statusCode}` : null;
  const duration = record.http.durationMs ? `${record.http.durationMs}ms` : null;

  return [record.http.method, target, status, duration].filter(Boolean).join(" ");
}

function isGenericStructuredType(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["structured_log", "structured", "log"].includes(value.trim().toLowerCase());
}

function isGenericStructuredLabel(message: string | null | undefined, type: string | null | undefined): boolean {
  if (!message) {
    return false;
  }

  const normalizedMessage = message.trim().toLowerCase();
  if (isGenericStructuredType(normalizedMessage)) {
    return true;
  }

  if (!type) {
    return false;
  }

  return normalizedMessage === type.trim().toLowerCase();
}

function asPlainObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readFirstString(
  value: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function toRecordEntry(record: StudioNormalizedRecord): StudioNormalizedRecordListItem {
  return {
    kind: "record",
    ...record,
  };
}

function resolveExplicitGroupInfo(record: StudioNormalizedRecord): GroupedRecordInfo | null {
  for (const candidate of [record.raw, record.bindings, record.data]) {
    const keyMatch = findGroupKey(candidate);
    if (!keyMatch) {
      continue;
    }

    return {
      record,
      groupId: `group:${keyMatch.reason}:${keyMatch.value}`,
      groupKey: keyMatch.value,
      groupingReason: keyMatch.reason,
    };
  }

  return null;
}

function findGroupKey(value: unknown): { value: string; reason: StudioGroupingReason } | null {
  if (!isPlainObject(value)) {
    return null;
  }

  for (const candidate of EXPLICIT_GROUP_KEYS) {
    const match = value[candidate.key];

    if (typeof match === "string" && match.trim().length > 0) {
      return {
        value: match.trim(),
        reason: candidate.reason,
      };
    }
  }

  return null;
}

function buildHeuristicSignature(record: StudioNormalizedRecord): string | null {
  if (record.source !== "structured") {
    return null;
  }

  const timestamp = parseTimestamp(record.timestamp);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const method = record.http?.method ?? "";
  const path = record.http?.path ?? record.http?.url ?? "";
  const caller = record.caller ?? "";
  const type = record.type ?? "";
  const bucket = Math.floor(timestamp / 2_000);

  if (!caller && !type && !method && !path) {
    return null;
  }

  return [caller, type, method, path, String(bucket)].join("|");
}

function compareRecordsDescending(left: StudioNormalizedRecord, right: StudioNormalizedRecord): number {
  return compareRecordsAscending(right, left);
}

function compareRecordsAscending(left: StudioNormalizedRecord, right: StudioNormalizedRecord): number {
  const leftTime = parseTimestamp(left.timestamp);
  const rightTime = parseTimestamp(right.timestamp);

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  if (left.filePath !== right.filePath) {
    return left.filePath.localeCompare(right.filePath);
  }

  return left.lineNumber - right.lineNumber;
}

function parseTimestamp(timestamp: string | null): number {
  if (!timestamp) {
    return Number.NaN;
  }

  return Date.parse(timestamp);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
