import { matchesDetectedSection } from "./sections";

import type {
  StudioBackgroundJobFailure,
  StudioBackgroundJobOutputField,
  StudioBackgroundJobPerformanceRow,
  StudioBackgroundJobRunDetail,
  StudioBackgroundJobRunSummary,
  StudioBackgroundJobsOverview,
  StudioBackgroundJobsQueryInput,
  StudioBackgroundJobsStats,
  StudioBackgroundJobStatus,
  StudioBackgroundJobTrend,
  StudioCustomSectionDefinition,
  StudioNormalizedRecord,
} from "./types";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const IDLE_GAP_MS = 120_000;
const TIMEOUT_WINDOW_MS = 10 * 60_000;
const TREND_THRESHOLD = 0.15;

const JOB_NAME_KEYS = [
  "job.name",
  "task.name",
  "queue.name",
  "cron.name",
  "worker.name",
  "schedule.name",
] as const;
const RUN_ID_KEYS = [
  "job.runId",
  "job.id",
  "task.runId",
  "task.id",
  "queue.runId",
  "queue.jobId",
  "cron.runId",
  "worker.runId",
  "schedule.runId",
] as const;
const STATUS_KEYS = [
  "job.status",
  "task.status",
  "queue.status",
  "cron.status",
  "worker.status",
  "schedule.status",
  "status",
  "state",
] as const;
const STEP_KEYS = [
  "job.step",
  "job.stage",
  "job.phase",
  "task.step",
  "task.stage",
  "queue.step",
  "worker.step",
  "schedule.step",
  "step",
  "stage",
  "phase",
] as const;
const DURATION_KEYS = [
  "durationMs",
  "duration",
  "job.durationMs",
  "task.durationMs",
  "queue.durationMs",
  "worker.durationMs",
] as const;
const FAILURE_MESSAGE_KEYS = [
  "error.message",
  "job.error.message",
  "task.error.message",
  "job.error",
  "task.error",
] as const;
const FAILURE_NAME_KEYS = [
  "error.name",
  "error.code",
  "job.error.name",
  "job.error.code",
  "task.error.name",
  "task.error.code",
] as const;
const STACK_KEYS = ["stack", "error.stack", "job.error.stack", "task.error.stack"] as const;
const OUTPUT_KEY_PATTERNS = [
  "records_processed",
  "emails_sent",
  "items_synced",
  "processed",
  "sent",
  "synced",
  "created",
  "updated",
  "deleted",
  "skipped",
  "retried",
] as const;

interface CandidateEvent {
  record: StudioNormalizedRecord;
  jobName: string;
  jobKey: string;
  runId: string | null;
  status: StudioBackgroundJobStatus | null;
  step: string | null;
  durationMs: number | null;
  outputFields: StudioBackgroundJobOutputField[];
  failureMessage: string | null;
  failureKind: string | null;
  stack: string | null;
}

interface RunBucket {
  id: string;
  jobName: string;
  jobKey: string;
  runId: string | null;
  events: CandidateEvent[];
}

interface AnalysisResult {
  runs: StudioBackgroundJobRunSummary[];
  runDetails: Map<string, StudioBackgroundJobRunDetail>;
  performance: StudioBackgroundJobPerformanceRow[];
  stats: StudioBackgroundJobsStats;
}

export function buildBackgroundJobsOverview(input: {
  records: StudioNormalizedRecord[];
  query: StudioBackgroundJobsQueryInput;
  customSections?: StudioCustomSectionDefinition[];
  truncated?: boolean;
}): StudioBackgroundJobsOverview {
  const analysis = analyzeBackgroundJobRecords(
    input.records,
    input.customSections ?? [],
  );
  const limit = clampLimit(input.query.limit);
  const offset = Math.max(0, input.query.offset ?? 0);

  return {
    stats: analysis.stats,
    runs: analysis.runs.slice(offset, offset + limit),
    performance: analysis.performance,
    totalRuns: analysis.runs.length,
    offset,
    limit,
    truncated: input.truncated ?? false,
  };
}

export function buildBackgroundJobRunDetail(input: {
  runId: string;
  records: StudioNormalizedRecord[];
  customSections?: StudioCustomSectionDefinition[];
}): StudioBackgroundJobRunDetail | null {
  const analysis = analyzeBackgroundJobRecords(
    input.records,
    input.customSections ?? [],
  );

  return analysis.runDetails.get(input.runId) ?? null;
}

export function analyzeBackgroundJobRecords(
  records: StudioNormalizedRecord[],
  customSections: StudioCustomSectionDefinition[] = [],
): AnalysisResult {
  const candidates = records
    .filter((record) => matchesDetectedSection(record, "background", customSections))
    .map(toCandidateEvent)
    .filter((event): event is CandidateEvent => event !== null);
  const sorted = candidates.slice().sort(compareEventsAscending);
  const sessionLatestTimestamp = sorted.reduce(
    (latest, event) => maxTimestamp(latest, event.record.timestamp),
    null as string | null,
  );
  const buckets = buildRunBuckets(sorted);
  const runDetails = new Map<string, StudioBackgroundJobRunDetail>();

  for (const bucket of buckets) {
    const detail = summarizeRun(bucket, sessionLatestTimestamp);
    runDetails.set(detail.run.id, detail);
  }

  const runs = Array.from(runDetails.values())
    .map((detail) => detail.run)
    .sort(compareRunsDescending);
  const performance = buildPerformanceRows(runs);
  const stats = buildStats(runs);

  return {
    runs,
    runDetails,
    performance,
    stats,
  };
}

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function toCandidateEvent(record: StudioNormalizedRecord): CandidateEvent | null {
  const jobName =
    readFirstString(record, JOB_NAME_KEYS) ??
    inferJobNameFromMessage(record.message);

  if (!jobName) {
    return null;
  }

  return {
    record,
    jobName,
    jobKey: normalizeKey(jobName),
    runId: readFirstString(record, RUN_ID_KEYS),
    status: readStatus(record),
    step: readFirstString(record, STEP_KEYS) ?? inferStepFromMessage(record.message),
    durationMs: readFirstNumber(record, DURATION_KEYS),
    outputFields: collectOutputFields(record),
    failureMessage: readFailureMessage(record),
    failureKind: readFirstString(record, FAILURE_NAME_KEYS),
    stack: readFirstString(record, STACK_KEYS) ?? record.stack,
  };
}

function buildRunBuckets(events: CandidateEvent[]): RunBucket[] {
  const explicit = new Map<string, RunBucket>();
  const noIdByJob = new Map<string, CandidateEvent[]>();

  for (const event of events) {
    if (event.runId) {
      const id = `background:${event.jobKey}:${event.runId}`;
      const existing = explicit.get(id);
      if (existing) {
        existing.events.push(event);
      } else {
        explicit.set(id, {
          id,
          jobName: event.jobName,
          jobKey: event.jobKey,
          runId: event.runId,
          events: [event],
        });
      }
      continue;
    }

    const list = noIdByJob.get(event.jobKey) ?? [];
    list.push(event);
    noIdByJob.set(event.jobKey, list);
  }

  const inferred: RunBucket[] = [];
  for (const [jobKey, jobEvents] of noIdByJob.entries()) {
    const sorted = jobEvents.slice().sort(compareEventsAscending);
    let current: RunBucket | null = null;

    for (const event of sorted) {
      if (shouldStartNewNoIdRun(current, event)) {
        current = {
          id: `background:${jobKey}:inferred:${event.record.id}`,
          jobName: event.jobName,
          jobKey,
          runId: null,
          events: [event],
        };
        inferred.push(current);
        continue;
      }

      if (current) {
        current.events.push(event);
      }
    }
  }

  return [...Array.from(explicit.values()), ...inferred].map((bucket) => ({
    ...bucket,
    events: bucket.events.slice().sort(compareEventsAscending),
  }));
}

function shouldStartNewNoIdRun(current: RunBucket | null, event: CandidateEvent): boolean {
  if (!current) {
    return true;
  }

  const previous = current.events[current.events.length - 1] ?? null;
  if (!previous) {
    return true;
  }

  if (isStartLike(event.status, event.record.message)) {
    return true;
  }

  if (isTerminalLike(previous.status, previous.record.message)) {
    return true;
  }

  const previousTime = parseTimestamp(previous.record.timestamp);
  const currentTime = parseTimestamp(event.record.timestamp);
  if (Number.isFinite(previousTime) && Number.isFinite(currentTime) && currentTime - previousTime > IDLE_GAP_MS) {
    return true;
  }

  return false;
}

function summarizeRun(
  bucket: RunBucket,
  sessionLatestTimestamp: string | null,
): StudioBackgroundJobRunDetail {
  const events = bucket.events.slice().sort(compareEventsAscending);
  const first = events[0] ?? null;
  const last = events[events.length - 1] ?? null;
  const explicitTerminal = events
    .slice()
    .reverse()
    .find((event) => isTerminalLike(event.status, event.record.message)) ?? null;
  const status = resolveRunStatus(events, sessionLatestTimestamp);
  const startedAt = first?.record.timestamp ?? null;
  const finishedAt =
    status === "IN_PROGRESS" ? null : (explicitTerminal?.record.timestamp ?? last?.record.timestamp ?? null);
  const durationMs =
    explicitTerminal?.durationMs ??
    last?.durationMs ??
    diffMs(startedAt, explicitTerminal?.record.timestamp ?? last?.record.timestamp ?? null);
  const failure = buildFailure(events, status);
  const outputFields = pickRunOutputFields(events);
  const run: StudioBackgroundJobRunSummary = {
    id: bucket.id,
    jobName: bucket.jobName,
    runId: bucket.runId,
    status,
    startedAt,
    finishedAt,
    durationMs,
    outputFields,
    failure,
    recordCount: events.length,
  };

  return {
    run,
    timeline: events.map((event) => ({
      id: `${bucket.id}:${event.record.id}`,
      recordId: event.record.id,
      timestamp: event.record.timestamp,
      level: event.record.level,
      message: event.record.message,
      status: event.status,
      step: event.step,
      structuredFields: event.outputFields,
    })),
  };
}

function resolveRunStatus(
  events: CandidateEvent[],
  sessionLatestTimestamp: string | null,
): StudioBackgroundJobStatus {
  const lastExplicit = events
    .slice()
    .reverse()
    .find((event) => event.status !== null)?.status;

  if (lastExplicit) {
    if (lastExplicit === "IN_PROGRESS") {
      return inferInFlightStatus(events, sessionLatestTimestamp);
    }
    return lastExplicit;
  }

  return inferInFlightStatus(events, sessionLatestTimestamp);
}

function inferInFlightStatus(
  events: CandidateEvent[],
  sessionLatestTimestamp: string | null,
): StudioBackgroundJobStatus {
  const firstStartLike = events.some((event) => isStartLike(event.status, event.record.message));
  if (!firstStartLike) {
    return "IN_PROGRESS";
  }

  const latestEventTime = parseTimestamp(events[events.length - 1]?.record.timestamp ?? null);
  const sessionLatestTime = parseTimestamp(sessionLatestTimestamp);
  if (Number.isFinite(latestEventTime) && Number.isFinite(sessionLatestTime)) {
    return sessionLatestTime - latestEventTime <= TIMEOUT_WINDOW_MS
      ? "IN_PROGRESS"
      : "TIMEOUT";
  }

  return "IN_PROGRESS";
}

function buildFailure(
  events: CandidateEvent[],
  status: StudioBackgroundJobStatus,
): StudioBackgroundJobFailure | null {
  if (status !== "FAILED" && status !== "TIMEOUT") {
    return null;
  }

  const terminal = events
    .slice()
    .reverse()
    .find((event) => event.status === status || isTerminalLike(event.status, event.record.message)) ?? null;
  const message =
    terminal?.failureMessage ??
    events.map((event) => event.failureMessage).find((value): value is string => Boolean(value)) ??
    firstLine(terminal?.record.message ?? events[events.length - 1]?.record.message ?? "Unknown failure");
  const step =
    terminal?.step ??
    events
      .slice()
      .reverse()
      .map((event) => event.step)
      .find((value): value is string => Boolean(value)) ??
    null;
  const stack =
    terminal?.stack ??
    events.map((event) => event.stack).find((value): value is string => Boolean(value)) ??
    null;

  return {
    message,
    reasonKey: normalizeFailureReason(message),
    step,
    stack,
  };
}

function pickRunOutputFields(events: CandidateEvent[]): StudioBackgroundJobOutputField[] {
  for (const event of events.slice().reverse()) {
    if (event.outputFields.length > 0) {
      return event.outputFields;
    }
  }

  return [];
}

function buildPerformanceRows(
  runs: StudioBackgroundJobRunSummary[],
): StudioBackgroundJobPerformanceRow[] {
  const byJob = new Map<string, StudioBackgroundJobRunSummary[]>();

  for (const run of runs) {
    const list = byJob.get(run.jobName) ?? [];
    list.push(run);
    byJob.set(run.jobName, list);
  }

  return Array.from(byJob.entries())
    .map(([jobName, jobRuns]) => {
      const durations = jobRuns
        .filter((run) => run.durationMs !== null && run.status !== "IN_PROGRESS")
        .map((run) => run.durationMs as number);
      const successfulRuns = jobRuns.filter((run) => run.status === "COMPLETED").length;
      const trend = computeTrend(jobRuns);

      return {
        jobName,
        totalRuns: jobRuns.length,
        successRate: jobRuns.length > 0 ? successfulRuns / jobRuns.length : 0,
        avgDurationMs: durations.length > 0 ? average(durations) : null,
        p95DurationMs: durations.length > 0 ? percentileNearestRank(durations, 0.95) : null,
        lastRunTimestamp: jobRuns.reduce(
          (latest, run) => maxTimestamp(latest, run.finishedAt ?? run.startedAt),
          null as string | null,
        ),
        trend,
      };
    })
    .sort((left, right) => left.jobName.localeCompare(right.jobName));
}

function computeTrend(runs: StudioBackgroundJobRunSummary[]): StudioBackgroundJobTrend {
  const points = runs
    .filter((run) => run.durationMs !== null && run.status !== "IN_PROGRESS")
    .slice()
    .sort((left, right) => compareTimestamps(left.finishedAt ?? left.startedAt, right.finishedAt ?? right.startedAt))
    .map((run) => run.durationMs as number);

  if (points.length < 3) {
    return "insufficient_data";
  }

  const avg = average(points);
  if (!Number.isFinite(avg) || avg <= 0) {
    return "insufficient_data";
  }

  const slope = leastSquaresSlope(points);
  const projectedChange = slope * (points.length - 1);
  if (projectedChange >= avg * TREND_THRESHOLD) {
    return "slower";
  }
  if (projectedChange <= -avg * TREND_THRESHOLD) {
    return "faster";
  }
  return "stable";
}

function buildStats(runs: StudioBackgroundJobRunSummary[]): StudioBackgroundJobsStats {
  const jobsDetected = new Set(runs.map((run) => normalizeKey(run.jobName))).size;
  const totalRuns = runs.length;
  const successfulRuns = runs.filter((run) => run.status === "COMPLETED").length;
  const failedRuns = runs.filter((run) => run.status === "FAILED" || run.status === "TIMEOUT");
  const avgDurationCandidates = runs
    .map((run) => run.durationMs)
    .filter((value): value is number => value !== null);
  const failureCounts = new Map<string, { count: number; label: string }>();

  for (const run of failedRuns) {
    const label = run.failure?.message ?? "Unknown failure";
    const key = run.failure?.reasonKey ?? normalizeFailureReason(label);
    const existing = failureCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      failureCounts.set(key, { count: 1, label });
    }
  }

  const mostCommonFailureReason =
    Array.from(failureCounts.values()).sort((left, right) => right.count - left.count)[0]?.label ?? null;

  return {
    jobsDetected,
    totalRuns,
    successRate: totalRuns > 0 ? successfulRuns / totalRuns : 0,
    failedRuns: failedRuns.length,
    mostCommonFailureReason,
    avgDurationMs: avgDurationCandidates.length > 0 ? average(avgDurationCandidates) : null,
  };
}

function readStatus(record: StudioNormalizedRecord): StudioBackgroundJobStatus | null {
  const explicit = readFirstString(record, STATUS_KEYS);
  const normalizedExplicit = classifyStatus(explicit);
  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  return classifyStatus(record.message);
}

function classifyStatus(value: string | null | undefined): StudioBackgroundJobStatus | null {
  const normalized = normalizeKey(value ?? "");
  if (!normalized) {
    return null;
  }
  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("timed_out")
  ) {
    return "TIMEOUT";
  }
  if (
    normalized.includes("failed") ||
    normalized.includes("error") ||
    normalized.includes("exception")
  ) {
    return "FAILED";
  }
  if (
    normalized.includes("completed") ||
    normalized.includes("success") ||
    normalized.includes("succeeded") ||
    normalized.includes("done")
  ) {
    return "COMPLETED";
  }
  if (
    normalized.includes("started") ||
    normalized.includes("running") ||
    normalized.includes("processing") ||
    normalized.includes("in progress") ||
    normalized.includes("in_progress")
  ) {
    return "IN_PROGRESS";
  }
  return null;
}

function isStartLike(status: StudioBackgroundJobStatus | null, message: string): boolean {
  return status === "IN_PROGRESS" || /job started|started|processing/i.test(message);
}

function isTerminalLike(status: StudioBackgroundJobStatus | null, message: string): boolean {
  return status === "COMPLETED" || status === "FAILED" || status === "TIMEOUT" || /job completed|job failed|timeout|timed out/i.test(message);
}

function inferJobNameFromMessage(message: string): string | null {
  const patterns = [
    /^(.*?) job started/i,
    /^(.*?) job completed/i,
    /^(.*?) job failed/i,
    /processing ([a-z0-9:_-]+)/i,
    /worker ([a-z0-9:_-]+)/i,
    /cron ([a-z0-9:_-]+)/i,
  ];

  for (const pattern of patterns) {
    const matched = pattern.exec(message);
    const value = matched?.[1]?.trim();
    if (value) {
      return normalizeDisplayName(value);
    }
  }

  return null;
}

function inferStepFromMessage(message: string): string | null {
  const matched = /\b(step|stage|phase)\s*:?\s*([a-z0-9:_ -]+)/i.exec(message);
  return matched?.[2] ? normalizeDisplayName(matched[2]) : null;
}

function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeFailureReason(value: string): string {
  return normalizeKey(firstLine(value)) || "unknown failure";
}

function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function firstLine(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? value.trim();
}

function collectOutputFields(record: StudioNormalizedRecord): StudioBackgroundJobOutputField[] {
  const leaves = new Map<string, string>();

  for (const source of [record.raw, record.bindings, record.data]) {
    collectLeafFields(source, "", leaves);
  }

  return Array.from(leaves.entries())
    .filter(([key]) => OUTPUT_KEY_PATTERNS.some((pattern) => normalizeKey(key).includes(pattern)))
    .slice(0, 4)
    .map(([key, value]) => ({ key, value }));
}

function collectLeafFields(
  value: unknown,
  prefix: string,
  target: Map<string, string>,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (value == null) {
    return;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (prefix) {
      target.set(prefix, String(value));
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    if (prefix && value.length > 0 && value.every((item) => typeof item !== "object" || item === null)) {
      target.set(prefix, value.map(String).join(", "));
    }
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    collectLeafFields(nested, prefix ? `${prefix}.${key}` : key, target, seen);
  }
}

function readFailureMessage(record: StudioNormalizedRecord): string | null {
  const message = readFirstString(record, FAILURE_MESSAGE_KEYS);
  if (message) {
    return firstLine(message);
  }

  const fallback = readFirstString(record, FAILURE_NAME_KEYS);
  return fallback ? firstLine(fallback) : null;
}

function readFirstString(
  record: StudioNormalizedRecord,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = getNestedValue(record, key);
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }

  return null;
}

function readFirstNumber(
  record: StudioNormalizedRecord,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = getNestedValue(record, key);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getNestedValue(record: StudioNormalizedRecord, dottedKey: string): unknown {
  for (const source of [record.raw, record.bindings, record.data]) {
    const value = getValue(source, dottedKey);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function getValue(value: unknown, dottedKey: string): unknown {
  const segments = dottedKey.split(".");
  let current: unknown = value;

  for (const segment of segments) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentileNearestRank(values: number[], percentile: number): number {
  const sorted = values.slice().sort((left, right) => left - right);
  const rank = Math.max(1, Math.ceil(percentile * sorted.length));
  return sorted[rank - 1] ?? sorted[sorted.length - 1] ?? 0;
}

function leastSquaresSlope(values: number[]): number {
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = average(values);
  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < values.length; index += 1) {
    const x = index - meanX;
    const y = values[index]! - meanY;
    numerator += x * y;
    denominator += x * x;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

function compareEventsAscending(left: CandidateEvent, right: CandidateEvent): number {
  return compareTimestamps(left.record.timestamp, right.record.timestamp) || left.record.id.localeCompare(right.record.id);
}

function compareRunsDescending(left: StudioBackgroundJobRunSummary, right: StudioBackgroundJobRunSummary): number {
  return (
    compareTimestamps(right.finishedAt ?? right.startedAt, left.finishedAt ?? left.startedAt) ||
    right.id.localeCompare(left.id)
  );
}

function compareTimestamps(left: string | null, right: string | null): number {
  const leftTime = parseTimestamp(left);
  const rightTime = parseTimestamp(right);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return 0;
  }
  if (Number.isFinite(leftTime)) {
    return 1;
  }
  if (Number.isFinite(rightTime)) {
    return -1;
  }
  return 0;
}

function parseTimestamp(value: string | null | undefined): number {
  if (!value) {
    return Number.NaN;
  }
  return Date.parse(value);
}

function diffMs(start: string | null, end: string | null): number | null {
  const startTime = parseTimestamp(start);
  const endTime = parseTimestamp(end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return null;
  }
  return Math.max(0, endTime - startTime);
}

function maxTimestamp(current: string | null, candidate: string | null): string | null {
  if (!candidate) {
    return current;
  }
  if (!current) {
    return candidate;
  }
  return compareTimestamps(current, candidate) >= 0 ? current : candidate;
}
