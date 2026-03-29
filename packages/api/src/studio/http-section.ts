import { buildGroupDetails } from "./grouping";

import type {
  StudioHttpEndpointPerformanceRow,
  StudioHttpOverview,
  StudioHttpQueryInput,
  StudioHttpRequestRow,
  StudioHttpStatusGroup,
  StudioHttpStatusTimeseriesBucket,
  StudioNormalizedRecord,
} from "./types";

const DEFAULT_HTTP_LIMIT = 100;
const MAX_HTTP_LIMIT = 500;
const MAX_ROUTE_FACETS = 200;
const REQUESTS_PER_MINUTE_WINDOW_MS = 5 * 60 * 1000;
const UUID_SEGMENT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_SEGMENT_PATTERN = /^[0-9a-f]{16,}$/i;
const NUMERIC_SEGMENT_PATTERN = /^\d+$/;
const OPAQUE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{16,}$/;

interface HttpCandidate {
  record: StudioNormalizedRecord;
  method: string;
  rawPath: string;
  route: string;
  statusCode: number;
  durationMs: number | null;
  timestamp: string | null;
  traceId: string | null;
  requestId: string | null;
  traceGroupId: string | null;
}

export function analyzeHttpRecords(
  records: StudioNormalizedRecord[],
  input: Pick<
    StudioHttpQueryInput,
    "offset" | "limit" | "method" | "statusGroup" | "route" | "minDurationMs"
  > = {},
): StudioHttpOverview {
  const traceGroupIdByKey = buildTraceGroupIdByKey(records);
  const httpRecords = records
    .map((record) => classifyHttpRecord(record, traceGroupIdByKey))
    .filter((item): item is HttpCandidate => item !== null);
  const filtered = httpRecords.filter((item) => matchesHttpFilters(item, input));
  const sorted = filtered.slice().sort(compareHttpCandidatesDescending);
  const offset = Math.max(0, input.offset ?? 0);
  const limit = clampLimit(input.limit);

  return {
    stats: buildStats(sorted),
    requests: sorted.slice(offset, offset + limit).map(toRequestRow),
    totalRequests: sorted.length,
    offset,
    limit,
    truncated: false,
    performance: buildPerformanceRows(sorted),
    timeseries: buildTimeseries(sorted),
    facets: buildFacets(httpRecords),
  };
}

export function normalizeHttpRoute(record: StudioNormalizedRecord): string | null {
  const explicitTemplate = record.http?.routeTemplate ?? getString(record, [
    "route",
    "http.route",
    "request.route",
    "routeTemplate",
  ]);

  if (explicitTemplate) {
    return normalizeRoutePath(explicitTemplate);
  }

  const rawPath = getRawPath(record);
  return rawPath ? normalizeRoutePath(rawPath) : null;
}

function classifyHttpRecord(
  record: StudioNormalizedRecord,
  traceGroupIdByKey: Map<string, string>,
): HttpCandidate | null {
  const method = getMethod(record);
  const rawPath = getRawPath(record);
  const statusCode = getStatusCode(record);
  const durationMs = getDurationMs(record);

  if (!method || !rawPath || statusCode === null) {
    return null;
  }

  const route = normalizeHttpRoute(record);
  if (!route) {
    return null;
  }

  const traceId = record.http?.traceId ?? getString(record, ["traceId", "trace.id"]);
  const requestId = record.http?.requestId ?? getString(record, ["requestId", "request.id"]);
  const traceGroupId =
    (traceId ? traceGroupIdByKey.get(`trace:${traceId}`) : null) ??
    (requestId ? traceGroupIdByKey.get(`request:${requestId}`) : null) ??
    null;

  return {
    record,
    method,
    rawPath,
    route,
    statusCode,
    durationMs,
    timestamp: record.timestamp,
    traceId,
    requestId,
    traceGroupId,
  };
}

function buildTraceGroupIdByKey(records: StudioNormalizedRecord[]): Map<string, string> {
  const groups = buildGroupDetails(records);
  const byKey = new Map<string, string>();

  for (const [groupId, detail] of groups.entries()) {
    const group = detail.group;
    if (group.groupingReason === "trace-id") {
      byKey.set(`trace:${group.groupKey}`, groupId);
    }
    if (group.groupingReason === "request-id") {
      byKey.set(`request:${group.groupKey}`, groupId);
    }
  }

  return byKey;
}

function matchesHttpFilters(
  item: HttpCandidate,
  input: Pick<StudioHttpQueryInput, "method" | "statusGroup" | "route" | "minDurationMs">,
): boolean {
  if (input.method && item.method.toLowerCase() !== input.method.toLowerCase()) {
    return false;
  }

  if (input.statusGroup && toStatusGroup(item.statusCode) !== input.statusGroup) {
    return false;
  }

  if (input.route && item.route !== input.route) {
    return false;
  }

  if (
    typeof input.minDurationMs === "number" &&
    Number.isFinite(input.minDurationMs) &&
    (item.durationMs === null || item.durationMs < input.minDurationMs)
  ) {
    return false;
  }

  return true;
}

function buildStats(records: HttpCandidate[]): StudioHttpOverview["stats"] {
  const durations = records
    .map((record) => record.durationMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => left - right);
  const totalRequests = records.length;
  const errorCount = records.filter((record) => record.statusCode >= 500).length;
  const statusGroups = buildStatusGroupCounts(records);
  const latestTimestampMs = records
    .map((record) => parseTimestamp(record.timestamp))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => right - left)[0] ?? Number.NaN;
  const requestsPerMinute = Number.isFinite(latestTimestampMs)
    ? buildRequestsPerMinute(records, latestTimestampMs)
    : 0;

  return {
    totalRequests,
    errorRate: totalRequests > 0 ? errorCount / totalRequests : 0,
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
    requestsPerMinute,
    statusGroups,
  };
}

function buildRequestsPerMinute(records: HttpCandidate[], latestTimestampMs: number): number {
  const windowStart = latestTimestampMs - REQUESTS_PER_MINUTE_WINDOW_MS;
  const inWindow = records.filter((record) => {
    const timestampMs = parseTimestamp(record.timestamp);
    return Number.isFinite(timestampMs) && timestampMs >= windowStart && timestampMs <= latestTimestampMs;
  });

  if (inWindow.length === 0) {
    return 0;
  }

  const earliestTimestampMs = inWindow
    .map((record) => parseTimestamp(record.timestamp))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)[0] ?? Number.NaN;
  const elapsedMinutes = Number.isFinite(earliestTimestampMs)
    ? Math.max((latestTimestampMs - earliestTimestampMs) / 60_000, 1)
    : 1;

  return inWindow.length / elapsedMinutes;
}

function buildPerformanceRows(records: HttpCandidate[]): StudioHttpEndpointPerformanceRow[] {
  const byRoute = new Map<string, HttpCandidate[]>();

  for (const record of records) {
    const bucket = byRoute.get(record.route) ?? [];
    bucket.push(record);
    byRoute.set(record.route, bucket);
  }

  return Array.from(byRoute.entries())
    .map(([route, routeRecords]) => {
      const durations = routeRecords
        .map((record) => record.durationMs)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
        .sort((left, right) => left - right);
      const requestCount = routeRecords.length;
      const errorRate =
        requestCount > 0
          ? routeRecords.filter((record) => record.statusCode >= 500).length / requestCount
          : 0;
      const p95DurationMs = percentile(durations, 0.95);

      return {
        route,
        requests: requestCount,
        p50DurationMs: percentile(durations, 0.5),
        p95DurationMs,
        errorRate,
        lastSeenAt: routeRecords
          .map((record) => record.timestamp)
          .sort(compareTimestampsDescending)[0] ?? null,
        highlight:
          errorRate > 0.05
            ? ("error" as const)
            : (p95DurationMs ?? 0) > 1000
              ? ("slow" as const)
              : ("none" as const),
      };
    })
    .sort((left, right) => {
      const durationCompare = (right.p95DurationMs ?? -1) - (left.p95DurationMs ?? -1);
      if (durationCompare !== 0) {
        return durationCompare;
      }

      return right.requests - left.requests;
    });
}

function buildTimeseries(records: HttpCandidate[]): StudioHttpStatusTimeseriesBucket[] {
  const timestamps = records
    .map((record) => parseTimestamp(record.timestamp))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (timestamps.length === 0) {
    return [];
  }

  const start = timestamps[0]!;
  const end = timestamps[timestamps.length - 1]!;
  const bucketSizeMs = getBucketSizeMs(end - start);
  const buckets = new Map<number, StudioHttpStatusTimeseriesBucket>();

  for (const record of records) {
    const timestamp = parseTimestamp(record.timestamp);
    if (!Number.isFinite(timestamp)) {
      continue;
    }

    const bucketStart = Math.floor(timestamp / bucketSizeMs) * bucketSizeMs;
    const bucket = buckets.get(bucketStart) ?? {
      start: new Date(bucketStart).toISOString(),
      end: new Date(bucketStart + bucketSizeMs).toISOString(),
      counts: emptyStatusGroupCounts(),
    };
    bucket.counts[toStatusGroup(record.statusCode)] += 1;
    buckets.set(bucketStart, bucket);
  }

  return Array.from(buckets.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, bucket]) => bucket);
}

function buildFacets(records: HttpCandidate[]): StudioHttpOverview["facets"] {
  const methods = new Set<string>();
  const routes = new Set<string>();
  let minDuration: number | null = null;
  let maxDuration: number | null = null;

  for (const record of records) {
    methods.add(record.method);
    routes.add(record.route);

    if (typeof record.durationMs === "number" && Number.isFinite(record.durationMs)) {
      minDuration = minDuration === null ? record.durationMs : Math.min(minDuration, record.durationMs);
      maxDuration = maxDuration === null ? record.durationMs : Math.max(maxDuration, record.durationMs);
    }
  }

  return {
    methods: Array.from(methods).sort(),
    routes: Array.from(routes).sort().slice(0, MAX_ROUTE_FACETS),
    statusGroups: ["2xx", "3xx", "4xx", "5xx"],
    durationRange: {
      min: minDuration,
      max: maxDuration,
    },
  };
}

function toRequestRow(record: HttpCandidate): StudioHttpRequestRow {
  return {
    id: `http:${record.record.id}`,
    recordId: record.record.id,
    timestamp: record.timestamp,
    method: record.method,
    route: record.route,
    rawPath: record.rawPath,
    statusCode: record.statusCode,
    statusGroup: toStatusGroup(record.statusCode),
    durationMs: record.durationMs,
    traceGroupId: record.traceGroupId,
    traceId: record.traceId,
    requestId: record.requestId,
  };
}

function getMethod(record: StudioNormalizedRecord): string | null {
  return (
    record.http?.method?.toUpperCase() ??
    getString(record, ["method", "request.method", "http.method"])?.toUpperCase() ??
    null
  );
}

function getRawPath(record: StudioNormalizedRecord): string | null {
  const candidate =
    record.http?.path ??
    record.http?.url ??
    getString(record, ["path", "url", "request.path", "request.url", "http.path", "http.url"]) ??
    null;

  if (!candidate) {
    return null;
  }

  return toPathname(candidate);
}

function getStatusCode(record: StudioNormalizedRecord): number | null {
  return (
    record.http?.statusCode ??
    getNumber(record, ["statusCode", "status", "response.statusCode", "http.statusCode"]) ??
    null
  );
}

function getDurationMs(record: StudioNormalizedRecord): number | null {
  return (
    record.http?.durationMs ??
    getNumber(record, [
      "responseTime",
      "duration",
      "durationMs",
      "response.durationMs",
      "response.duration",
      "http.durationMs",
      "http.duration",
    ]) ??
    null
  );
}

function getString(record: StudioNormalizedRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = getValue(record, key);
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getNumber(record: StudioNormalizedRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = getValue(record, key);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getValue(record: StudioNormalizedRecord, dottedKey: string): unknown {
  const candidates = [record.raw, record.data, record.bindings];
  for (const candidate of candidates) {
    const value = getNestedValue(candidate, dottedKey);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function getNestedValue(value: unknown, dottedKey: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  if (dottedKey in value) {
    return (value as Record<string, unknown>)[dottedKey];
  }

  return dottedKey.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    return (current as Record<string, unknown>)[part];
  }, value);
}

function normalizeRoutePath(input: string): string {
  const pathname = toPathname(input);
  if (!pathname) {
    return "/";
  }

  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => normalizeRouteSegment(segment));

  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function normalizeRouteSegment(segment: string): string {
  if (
    NUMERIC_SEGMENT_PATTERN.test(segment) ||
    UUID_SEGMENT_PATTERN.test(segment) ||
    HEX_SEGMENT_PATTERN.test(segment) ||
    looksOpaqueSegment(segment)
  ) {
    return ":id";
  }

  return segment;
}

function looksOpaqueSegment(segment: string): boolean {
  if (!OPAQUE_SEGMENT_PATTERN.test(segment)) {
    return false;
  }

  return !/^[a-z0-9-]+$/i.test(segment) || /[A-Z_]/.test(segment);
}

function toPathname(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = parseAsUrl(trimmed);
  const pathname = parsed?.pathname ?? trimmed.split("?")[0]!.split("#")[0]!;
  const normalized = pathname.replace(/\/+/g, "/");

  if (normalized === "/") {
    return normalized;
  }

  return normalized.replace(/\/$/, "") || "/";
}

function parseAsUrl(value: string): URL | null {
  try {
    return value.startsWith("http://") || value.startsWith("https://")
      ? new URL(value)
      : null;
  } catch {
    return null;
  }
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const index = Math.max(0, Math.ceil(percentileValue * values.length) - 1);
  return Math.round(values[index]!);
}

function buildStatusGroupCounts(
  records: HttpCandidate[],
): Record<StudioHttpStatusGroup, number> {
  const counts = emptyStatusGroupCounts();

  for (const record of records) {
    counts[toStatusGroup(record.statusCode)] += 1;
  }

  return counts;
}

function emptyStatusGroupCounts(): Record<StudioHttpStatusGroup, number> {
  return {
    "2xx": 0,
    "3xx": 0,
    "4xx": 0,
    "5xx": 0,
  };
}

function toStatusGroup(statusCode: number): StudioHttpStatusGroup {
  if (statusCode >= 500) return "5xx";
  if (statusCode >= 400) return "4xx";
  if (statusCode >= 300) return "3xx";
  return "2xx";
}

function getBucketSizeMs(spanMs: number): number {
  if (spanMs <= 30 * 60 * 1000) {
    return 60 * 1000;
  }
  if (spanMs <= 6 * 60 * 60 * 1000) {
    return 5 * 60 * 1000;
  }
  if (spanMs <= 24 * 60 * 60 * 1000) {
    return 15 * 60 * 1000;
  }
  return 60 * 60 * 1000;
}

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_HTTP_LIMIT, 1), MAX_HTTP_LIMIT);
}

function parseTimestamp(value: string | null | undefined): number {
  if (!value) {
    return Number.NaN;
  }

  return Date.parse(value);
}

function compareHttpCandidatesDescending(left: HttpCandidate, right: HttpCandidate): number {
  const leftTime = parseTimestamp(left.timestamp);
  const rightTime = parseTimestamp(right.timestamp);

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  if (Number.isFinite(leftTime)) {
    return -1;
  }
  if (Number.isFinite(rightTime)) {
    return 1;
  }

  return right.record.id.localeCompare(left.record.id);
}

function compareTimestampsDescending(left: string | null, right: string | null): number {
  const leftTime = parseTimestamp(left);
  const rightTime = parseTimestamp(right);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  if (Number.isFinite(leftTime)) return -1;
  if (Number.isFinite(rightTime)) return 1;
  return 0;
}
