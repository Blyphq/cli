import { readNumber, readString, readValue } from "./field-access";
import { sanitizeForTransport } from "./normalize";

import type {
  StudioAgentErrorKind,
  StudioAgentFailureItem,
  StudioAgentLlmCallRow,
  StudioAgentTaskDetail,
  StudioAgentTaskStatus,
  StudioAgentTaskStep,
  StudioAgentTaskSummary,
  StudioAgentToolCallRow,
  StudioAgentsOverview,
  StudioAgentsQueryInput,
  StudioNormalizedRecord,
} from "./types";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const SESSION_GAP_MS = 15_000;
const TIMEOUT_WINDOW_MS = 10 * 60_000;

const TASK_ID_KEYS = [
  "agent.task_id",
  "agent.taskId",
  "task_id",
  "taskId",
  "agent.id",
  "agent.runId",
] as const;
const TRACE_KEYS = [
  "trace_id",
  "traceId",
  "trace.id",
  "correlationId",
  "requestId",
] as const;
const SESSION_KEYS = [
  "session.id",
  "sessionId",
  "agent.session_id",
  "agent.sessionId",
] as const;
const DURATION_KEYS = [
  "durationMs",
  "duration",
  "llm.durationMs",
  "llm.duration",
  "tool.durationMs",
  "tool.duration",
  "agent.durationMs",
  "agent.duration",
  "retrieval.durationMs",
  "retrieval.duration",
  "latencyMs",
  "latency",
] as const;
const MODEL_KEYS = ["llm.model", "model", "completion.model"] as const;
const TOOL_NAME_KEYS = ["tool.name", "toolName", "function.name", "name"] as const;
const STEP_NAME_KEYS = [
  "agent.step",
  "agent.name",
  "llm.name",
  "tool.name",
  "retrieval.name",
  "function.name",
] as const;
const TITLE_KEYS = [
  "agent.task_name",
  "agent.taskName",
  "agent.title",
  "task_name",
  "taskName",
  "title",
  "input",
  "prompt",
  "agent.input",
  "agent.prompt",
] as const;
const STATUS_KEYS = [
  "agent.status",
  "status",
  "state",
  "tool.status",
  "llm.status",
  "retrieval.status",
  "completion.status",
] as const;
const ERROR_KEYS = [
  "error.message",
  "agent.error.message",
  "tool.error.message",
  "llm.error.message",
  "retrieval.error.message",
  "error",
  "agent.error",
  "tool.error",
  "llm.error",
  "retrieval.error",
];

interface CandidateStep {
  record: StudioNormalizedRecord;
  taskKey: string;
  correlationSource: StudioAgentTaskSummary["correlationSource"];
  taskId: string | null;
  traceKey: string | null;
  sessionKey: string | null;
  parsedTime: number | null;
  type: StudioAgentTaskStep["type"];
  name: string;
  status: string | null;
  durationMs: number | null;
  durationSource: StudioAgentTaskStep["durationSource"];
  model: string | null;
  toolName: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  resultCount: number | null;
  inputPreview: string | null;
  outputPreview: string | null;
  errorMessage: string | null;
  summary: string;
  rawDetails: unknown;
}

interface TaskBucket {
  id: string;
  correlationSource: StudioAgentTaskSummary["correlationSource"];
  steps: CandidateStep[];
}

export function analyzeAgentRecords(input: {
  records: StudioNormalizedRecord[];
  query: StudioAgentsQueryInput;
  truncated?: boolean;
}): StudioAgentsOverview {
  const candidates = input.records
    .filter(isAgentCandidate)
    .map(toCandidate)
    .filter((candidate): candidate is CandidateStep => candidate !== null)
    .sort(compareStepsAscending);
  const sessionLatestTimestamp = candidates.reduce(
    (latest, candidate) =>
      candidate.record.timestamp && (!latest || compareTimestamp(candidate.record.timestamp, latest) > 0)
        ? candidate.record.timestamp
        : latest,
    null as string | null,
  );
  const tasks = buildTasks(candidates, sessionLatestTimestamp);
  const limit = Math.min(Math.max(input.query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(0, input.query.offset ?? 0);

  return {
    stats: buildStats(tasks),
    tasks: tasks.map((task) => task.task).slice(offset, offset + limit),
    totalTasks: tasks.length,
    offset,
    limit,
    truncated: input.truncated ?? false,
    llmCalls: tasks.flatMap((task) => task.llmCalls),
    toolCalls: tasks.flatMap((task) => task.toolCalls),
    toolSummary: buildToolSummary(tasks.flatMap((task) => task.toolCalls)),
    failures: tasks
      .map((task) => task.failure)
      .filter((failure): failure is StudioAgentFailureItem => failure !== null),
  };
}

export function getAgentTaskDetail(input: {
  records: StudioNormalizedRecord[];
  taskId: string;
}): StudioAgentTaskDetail | null {
  const task = buildTasks(
    input.records
      .filter(isAgentCandidate)
      .map(toCandidate)
      .filter((candidate): candidate is CandidateStep => candidate !== null)
      .sort(compareStepsAscending),
    input.records.reduce(
      (latest, record) =>
        record.timestamp && (!latest || compareTimestamp(record.timestamp, latest) > 0)
          ? record.timestamp
          : latest,
      null as string | null,
    ),
  ).find((candidate) => candidate.task.id === input.taskId);

  return task
    ? {
        task: task.task,
        steps: task.steps,
        failure: task.failure,
      }
    : null;
}

function buildTasks(
  candidates: CandidateStep[],
  sessionLatestTimestamp: string | null,
): Array<{
  task: StudioAgentTaskSummary;
  steps: StudioAgentTaskStep[];
  llmCalls: StudioAgentLlmCallRow[];
  toolCalls: StudioAgentToolCallRow[];
  failure: StudioAgentFailureItem | null;
}> {
  const explicit = new Map<string, TaskBucket>();
  const traces = new Map<string, TaskBucket>();
  const bySession = new Map<string, CandidateStep[]>();

  for (const candidate of candidates) {
    if (candidate.taskId) {
      const id = `agent:task:${candidate.taskId}`;
      const bucket = explicit.get(id) ?? {
        id,
        correlationSource: "task_id" as const,
        steps: [],
      };
      bucket.steps.push(candidate);
      explicit.set(id, bucket);
      continue;
    }

    if (candidate.traceKey) {
      const id = `agent:trace:${candidate.traceKey}`;
      const bucket = traces.get(id) ?? {
        id,
        correlationSource: "trace_id" as const,
        steps: [],
      };
      bucket.steps.push(candidate);
      traces.set(id, bucket);
      continue;
    }

    const sessionKey = candidate.sessionKey ?? candidate.record.fileId;
    const list = bySession.get(sessionKey) ?? [];
    list.push(candidate);
    bySession.set(sessionKey, list);
  }

  const inferred: TaskBucket[] = [];
  for (const [sessionKey, sessionSteps] of bySession.entries()) {
    const sorted = sessionSteps.slice().sort(compareStepsAscending);
    let current: TaskBucket | null = null;

    for (const step of sorted) {
      if (!current || shouldStartNewSessionTask(current.steps[current.steps.length - 1] ?? null, step)) {
        current = {
          id: `agent:session:${sessionKey}:${step.record.id}`,
          correlationSource: "session_proximity",
          steps: [step],
        };
        inferred.push(current);
      } else {
        current.steps.push(step);
      }
    }
  }

  return [...explicit.values(), ...traces.values(), ...inferred]
    .map((bucket) => finalizeTask(bucket, sessionLatestTimestamp))
    .sort((left, right) => compareTimestamp(right.task.startedAt, left.task.startedAt));
}

function finalizeTask(
  bucket: TaskBucket,
  sessionLatestTimestamp: string | null,
): {
  task: StudioAgentTaskSummary;
  steps: StudioAgentTaskStep[];
  llmCalls: StudioAgentLlmCallRow[];
  toolCalls: StudioAgentToolCallRow[];
  failure: StudioAgentFailureItem | null;
} {
  const sorted = bucket.steps.slice().sort(compareStepsAscending);
  const first = sorted[0] ?? null;
  const startedAt = first?.record.timestamp ?? null;
  const finishedAt = inferFinishedAt(sorted);
  const status = inferTaskStatus(sorted, finishedAt, sessionLatestTimestamp);
  const resolvedSteps = sorted.map((step, index) =>
    toTaskStep(step, index, sorted, startedAt, finishedAt),
  );
  const title = inferTaskTitle(sorted);
  const totalTokens = resolvedSteps.reduce((sum, step) => sum + (step.totalTokens ?? 0), 0);
  const failure = buildFailure(bucket.id, title, status, resolvedSteps);
  const task: StudioAgentTaskSummary = {
    id: bucket.id,
    title,
    status,
    startedAt,
    finishedAt,
    durationMs: diffMs(startedAt, finishedAt),
    stepCount: resolvedSteps.length,
    llmCallCount: resolvedSteps.filter((step) => step.type === "LLM").length,
    toolCallCount: resolvedSteps.filter((step) => step.type === "TOOL").length,
    retrievalCount: resolvedSteps.filter((step) => step.type === "RETRIEVAL").length,
    totalTokens,
    failureKind: failure?.errorKind ?? null,
    failureMessage: failure?.errorMessage ?? null,
    recordIds: resolvedSteps.map((step) => step.recordId),
    correlationSource: bucket.correlationSource,
  };

  const llmCalls = resolvedSteps
    .filter((step) => step.type === "LLM")
    .map<StudioAgentLlmCallRow>((step) => ({
      id: step.id,
      taskId: bucket.id,
      taskTitle: title,
      recordId: step.recordId,
      timestamp: step.timestamp,
      model: step.model,
      promptTokens: step.promptTokens,
      completionTokens: step.completionTokens,
      totalTokens: step.totalTokens,
      durationMs: step.durationMs,
      approxCostUsd: estimateCostUsd(step.model, step.promptTokens, step.completionTokens),
    }))
    .sort((left, right) => compareNullableNumberDescending(left.durationMs, right.durationMs));

  const toolCalls = resolvedSteps
    .filter((step) => step.type === "TOOL")
    .map<StudioAgentToolCallRow>((step) => ({
      id: step.id,
      taskId: bucket.id,
      taskTitle: title,
      recordId: step.recordId,
      timestamp: step.timestamp,
      name: step.toolName ?? step.name,
      durationMs: step.durationMs,
      outcome: inferToolOutcome(step),
      errorMessage: step.errorMessage,
    }));

  return { task, steps: resolvedSteps, llmCalls, toolCalls, failure };
}

function toTaskStep(
  candidate: CandidateStep,
  index: number,
  allSteps: CandidateStep[],
  startedAt: string | null,
  finishedAt: string | null,
): StudioAgentTaskStep {
  const next = allSteps[index + 1] ?? null;
  let durationMs = candidate.durationMs;
  let durationSource = candidate.durationSource;

  if (durationMs === null && next?.record.timestamp && candidate.record.timestamp) {
    durationMs = diffMs(candidate.record.timestamp, next.record.timestamp);
    durationSource = durationMs === null ? "unknown" : "inferred-next-step";
  }

  if (
    durationMs === null &&
    candidate.type === "AGENT" &&
    finishedAt &&
    candidate.record.timestamp &&
    index === allSteps.length - 1
  ) {
    durationMs = diffMs(candidate.record.timestamp, finishedAt);
    durationSource = durationMs === null ? "unknown" : "task-boundary";
  }

  return {
    id: `${candidate.record.id}:${candidate.type.toLowerCase()}`,
    recordId: candidate.record.id,
    timestamp: candidate.record.timestamp,
    offsetMs: diffMs(startedAt, candidate.record.timestamp),
    type: candidate.type,
    name: candidate.name,
    summary: candidate.summary,
    durationMs,
    durationSource: durationSource ?? "unknown",
    status: candidate.status,
    model: candidate.model,
    toolName: candidate.toolName,
    promptTokens: candidate.promptTokens,
    completionTokens: candidate.completionTokens,
    totalTokens: candidate.totalTokens,
    resultCount: candidate.resultCount,
    inputPreview: candidate.inputPreview,
    outputPreview: candidate.outputPreview,
    errorMessage: candidate.errorMessage,
    rawDetails: candidate.rawDetails,
  };
}

function buildFailure(
  taskId: string,
  taskTitle: string,
  status: StudioAgentTaskStatus,
  steps: StudioAgentTaskStep[],
): StudioAgentFailureItem | null {
  if (status !== "FAILED" && status !== "TIMEOUT") {
    return null;
  }

  const failedStep =
    steps
      .slice()
      .reverse()
      .find((step) => step.errorMessage || isFailureStatus(step.status)) ?? steps[steps.length - 1] ?? null;

  return {
    taskId,
    taskTitle,
    status,
    errorKind: failedStep ? inferErrorKind(failedStep) : "unknown",
    errorMessage: failedStep?.errorMessage ?? (status === "TIMEOUT" ? "Task timed out." : null),
    failedStepId: failedStep?.id ?? null,
    failedStepName: failedStep?.name ?? null,
    failedAt: failedStep?.timestamp ?? null,
  };
}

function buildStats(tasks: Array<{ task: StudioAgentTaskSummary }>): StudioAgentsOverview["stats"] {
  const durations = tasks
    .map((task) => task.task.durationMs)
    .filter((value): value is number => typeof value === "number");

  return {
    agentTasks: tasks.length,
    llmCalls: tasks.reduce((sum, task) => sum + task.task.llmCallCount, 0),
    avgTaskDurationMs:
      durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
    toolCalls: tasks.reduce((sum, task) => sum + task.task.toolCallCount, 0),
    failedTasks: tasks.filter((task) => task.task.status === "FAILED").length,
    totalTokens: tasks.reduce((sum, task) => sum + task.task.totalTokens, 0),
  };
}

function buildToolSummary(toolCalls: StudioAgentToolCallRow[]): StudioAgentsOverview["toolSummary"] {
  const byName = new Map<string, number[]>();

  for (const call of toolCalls) {
    const list = byName.get(call.name) ?? [];
    if (typeof call.durationMs === "number") {
      list.push(call.durationMs);
    }
    byName.set(call.name, list);
  }

  return {
    mostFrequentlyCalled: Array.from(byName.entries())
      .map(([name]) => ({ name, count: toolCalls.filter((call) => call.name === name).length }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
      .slice(0, 5),
    slowestByP95: Array.from(byName.entries())
      .map(([name, durations]) => ({
        name,
        p95DurationMs: percentile95(durations),
        sampleCount: toolCalls.filter((call) => call.name === name).length,
      }))
      .sort((left, right) => compareNullableNumberDescending(left.p95DurationMs, right.p95DurationMs))
      .slice(0, 5),
  };
}

function toCandidate(record: StudioNormalizedRecord): CandidateStep | null {
  const type = inferStepType(record);
  const model = readFromRecordString(record, MODEL_KEYS);
  const toolName = readFromRecordString(record, TOOL_NAME_KEYS);
  const taskId = readFromRecordString(record, TASK_ID_KEYS);
  const traceKey = readFromRecordString(record, TRACE_KEYS);
  const sessionKey = readFromRecordString(record, SESSION_KEYS);
  const promptTokens = readToken(record, ["tokens.prompt", "prompt.tokens", "prompt_tokens"]);
  const completionTokens = readToken(record, [
    "tokens.completion",
    "completion.tokens",
    "completion_tokens",
  ]);
  const explicitTotalTokens = readToken(record, ["tokens.total", "total_tokens", "tokens.used"]);
  const durationMs = readDuration(record);
  const inputPreview = preview(readFromRecordValue(record, [
    "input",
    "agent.input",
    "prompt",
    "agent.prompt",
    "tool.input",
    "retrieval.query",
    "query",
  ]));
  const outputPreview = preview(readFromRecordValue(record, [
    "output",
    "agent.output",
    "completion",
    "completion.text",
    "tool.output",
    "retrieval.output",
    "result",
    "results",
  ]));
  const errorMessage = readErrorMessage(record);
  const name =
    readFromRecordString(record, STEP_NAME_KEYS) ??
    (type === "LLM" ? model : null) ??
    (type === "TOOL" ? toolName : null) ??
    inferNameFromMessage(record.message, type) ??
    "step";

  return {
    record,
    taskKey: taskId ?? traceKey ?? sessionKey ?? record.fileId,
    correlationSource: taskId ? "task_id" : traceKey ? "trace_id" : "session_proximity",
    taskId,
    traceKey,
    sessionKey,
    parsedTime: parseTimestamp(record.timestamp),
    type,
    name,
    status: readFromRecordString(record, STATUS_KEYS),
    durationMs,
    durationSource: durationMs === null ? "unknown" : "explicit",
    model,
    toolName,
    promptTokens,
    completionTokens,
    totalTokens:
      explicitTotalTokens ?? (promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : null),
    resultCount: readFromRecordNumber(record, ["result_count", "results.count", "retrieval.count", "docs.count"]),
    inputPreview,
    outputPreview,
    errorMessage,
    summary: buildSummary({ type, name, model, toolName, totalTokens: explicitTotalTokens, errorMessage, resultCount: readFromRecordNumber(record, ["result_count", "results.count", "retrieval.count", "docs.count"]) }),
    rawDetails: sanitizeForTransport({
      raw: record.raw,
      data: record.data,
      bindings: record.bindings,
    }),
  };
}

function inferTaskTitle(steps: CandidateStep[]): string {
  for (const step of steps) {
    const explicit = readFromRecordString(step.record, TITLE_KEYS);
    if (explicit) {
      return preview(explicit, 80) ?? step.name;
    }
  }

  const llm = steps.find((step) => step.type === "LLM" && step.inputPreview);
  if (llm?.inputPreview) {
    return llm.inputPreview;
  }

  return steps[0]?.name ?? "Agent task";
}

function inferTaskStatus(
  steps: CandidateStep[],
  finishedAt: string | null,
  sessionLatestTimestamp: string | null,
): StudioAgentTaskStatus {
  const lastTerminal = steps
    .filter((step) => isTerminalStep(step))
    .sort((left, right) => compareTimestamp(left.record.timestamp, right.record.timestamp))
    .pop();

  if (lastTerminal) {
    if (isTimeoutStatus(lastTerminal.status) || includesAny(lastTerminal.record.message, ["timeout", "timed out"])) {
      return "TIMEOUT";
    }
    if (lastTerminal.errorMessage || isFailureStatus(lastTerminal.status) || includesAny(lastTerminal.record.message, ["error", "failed", "failure"])) {
      return "FAILED";
    }
    if (isSuccessStatus(lastTerminal.status) || includesAny(lastTerminal.record.message, ["completed", "complete", "finished", "succeeded"])) {
      return "COMPLETED";
    }
  }

  if (finishedAt && diffMs(finishedAt, sessionLatestTimestamp) !== null && diffMs(finishedAt, sessionLatestTimestamp)! >= TIMEOUT_WINDOW_MS) {
    return "TIMEOUT";
  }

  const last = steps[steps.length - 1] ?? null;
  if (last?.record.timestamp && sessionLatestTimestamp) {
    const staleMs = diffMs(last.record.timestamp, sessionLatestTimestamp);
    if (staleMs !== null && staleMs >= TIMEOUT_WINDOW_MS) {
      return "TIMEOUT";
    }
  }

  return "IN_PROGRESS";
}

function inferFinishedAt(steps: CandidateStep[]): string | null {
  const withTimestamp = steps
    .map((step) => step.record.timestamp)
    .filter((timestamp): timestamp is string => Boolean(timestamp));
  return withTimestamp.length > 0 ? withTimestamp[withTimestamp.length - 1] ?? null : null;
}

function shouldStartNewSessionTask(previous: CandidateStep | null, current: CandidateStep): boolean {
  if (!previous) {
    return true;
  }

  if (isStartLike(current)) {
    return true;
  }

  if (isTerminalStep(previous)) {
    return true;
  }

  if (previous.parsedTime !== null && current.parsedTime !== null) {
    return current.parsedTime - previous.parsedTime > SESSION_GAP_MS;
  }

  return false;
}

function isAgentCandidate(record: StudioNormalizedRecord): boolean {
  if (
    readFromRecordString(record, ["agent.task_id", "agent.taskId", "llm.model", "tool.name"])
  ) {
    return true;
  }

  if (
    hasAnyPath(record, [
      "agent",
      "llm",
      "tool",
      "tokens",
      "prompt",
      "completion",
      "model",
    ])
  ) {
    return true;
  }

  return includesAny(record.message, [
    "tool call",
    "function call",
    "completion",
    "prompt",
    "agent task",
    "retrieval",
  ]);
}

function inferStepType(record: StudioNormalizedRecord): CandidateStep["type"] {
  if (
    hasAnyPath(record, ["llm", "tokens", "prompt", "completion"]) ||
    readFromRecordString(record, ["llm.model", "model", "completion.model"])
  ) {
    return "LLM";
  }

  if (hasAnyPath(record, ["tool", "function"]) || includesAny(record.message, ["tool call", "function call"])) {
    return "TOOL";
  }

  if (
    hasAnyPath(record, ["retrieval", "rag", "docs", "documents", "vector", "search"]) ||
    includesAny(record.message, ["retrieval", "document", "vector", "rag", "search"])
  ) {
    return "RETRIEVAL";
  }

  return "AGENT";
}

function buildSummary(input: {
  type: CandidateStep["type"];
  name: string;
  model: string | null;
  toolName: string | null;
  totalTokens: number | null;
  errorMessage: string | null;
  resultCount: number | null;
}): string {
  const parts = [
    input.type === "LLM" && input.model ? `model=${input.model}` : null,
    input.type === "TOOL" && input.toolName ? `tool=${input.toolName}` : null,
    typeof input.totalTokens === "number" ? `tokens=${input.totalTokens}` : null,
    typeof input.resultCount === "number" ? `results=${input.resultCount}` : null,
    input.errorMessage ? `error=${input.errorMessage}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? `${input.name} · ${parts.join(" · ")}` : input.name;
}

function inferNameFromMessage(message: string, type: CandidateStep["type"]): string | null {
  if (type === "RETRIEVAL" && includesAny(message, ["retrieval", "search"])) {
    return "retrieve_documents";
  }

  if (type === "AGENT" && includesAny(message, ["completed", "complete", "finished"])) {
    return "task completed";
  }

  if (type === "AGENT" && includesAny(message, ["started", "starting", "begin"])) {
    return "task started";
  }

  return message ? preview(message, 80) : null;
}

function inferToolOutcome(step: StudioAgentTaskStep): "success" | "failure" | "unknown" {
  if (step.errorMessage || isFailureStatus(step.status)) {
    return "failure";
  }
  if (isSuccessStatus(step.status)) {
    return "success";
  }
  return "unknown";
}

function inferErrorKind(step: StudioAgentTaskStep): StudioAgentErrorKind {
  switch (step.type) {
    case "LLM":
      return "llm";
    case "TOOL":
      return "tool";
    case "AGENT":
      return "agent";
    default:
      return "unknown";
  }
}

function readDuration(record: StudioNormalizedRecord): number | null {
  return readFromRecordNumber(record, DURATION_KEYS);
}

function readToken(record: StudioNormalizedRecord, keys: readonly string[]): number | null {
  return readFromRecordNumber(record, keys);
}

function readErrorMessage(record: StudioNormalizedRecord): string | null {
  const errorValue = readFromRecordValue(record, ERROR_KEYS);
  if (typeof errorValue === "string" && errorValue.length > 0) {
    return errorValue;
  }
  if (errorValue && typeof errorValue === "object") {
    const message = readString(errorValue as Record<string, unknown>, ["message"]);
    if (message) {
      return message;
    }
  }
  if (record.error && typeof record.error === "object") {
    return readString(record.error as Record<string, unknown>, ["message"]) ?? null;
  }
  return null;
}

function readFromRecordString(record: StudioNormalizedRecord, keys: readonly string[]): string | null {
  for (const source of getSources(record)) {
    const value = readString(source, keys);
    if (value) {
      return value;
    }
  }

  return null;
}

function readFromRecordNumber(record: StudioNormalizedRecord, keys: readonly string[]): number | null {
  for (const source of getSources(record)) {
    const value = readNumber(source, keys);
    if (typeof value === "number") {
      return value;
    }
  }

  return null;
}

function readFromRecordValue(record: StudioNormalizedRecord, keys: readonly string[]): unknown {
  for (const source of getSources(record)) {
    const value = readValue(source, keys);
    if (value !== null && value !== undefined) {
      return value;
    }
  }

  return null;
}

function getSources(record: StudioNormalizedRecord): Array<StudioNormalizedRecord | Record<string, unknown>> {
  const sources: Array<StudioNormalizedRecord | Record<string, unknown>> = [record];
  if (record.raw && typeof record.raw === "object") {
    sources.push(record.raw as Record<string, unknown>);
  }
  if (record.data && typeof record.data === "object") {
    sources.push(record.data as Record<string, unknown>);
  }
  if (record.bindings && typeof record.bindings === "object") {
    sources.push(record.bindings);
  }
  if (record.error && typeof record.error === "object") {
    sources.push(record.error as Record<string, unknown>);
  }
  return sources;
}

function hasAnyPath(record: StudioNormalizedRecord, keys: readonly string[]): boolean {
  for (const source of getSources(record)) {
    for (const key of keys) {
      const value = readValue(source, [key]);
      if (value !== null && value !== undefined) {
        return true;
      }
    }
  }
  return false;
}

function isStartLike(step: CandidateStep): boolean {
  return includesAny(`${step.status ?? ""} ${step.record.message}`, ["start", "started", "begin"]);
}

function isTerminalStep(step: CandidateStep): boolean {
  return (
    isFailureStatus(step.status) ||
    isSuccessStatus(step.status) ||
    isTimeoutStatus(step.status) ||
    includesAny(step.record.message, ["completed", "complete", "finished", "failed", "error", "timeout", "timed out"])
  );
}

function isFailureStatus(status: string | null): boolean {
  return includesAny(status ?? "", ["failed", "error"]);
}

function isSuccessStatus(status: string | null): boolean {
  return includesAny(status ?? "", ["completed", "complete", "success", "succeeded", "finished"]);
}

function isTimeoutStatus(status: string | null): boolean {
  return includesAny(status ?? "", ["timeout", "timed out"]);
}

function preview(value: unknown, max = 120): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text =
    typeof value === "string"
      ? value
      : (() => {
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        })();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function diffMs(start: string | null | undefined, end: string | null | undefined): number | null {
  const startTime = parseTimestamp(start);
  const endTime = parseTimestamp(end);
  if (startTime === null || endTime === null) {
    return null;
  }
  return Math.max(0, endTime - startTime);
}

function compareStepsAscending(left: CandidateStep, right: CandidateStep): number {
  if (left.parsedTime !== null && right.parsedTime !== null && left.parsedTime !== right.parsedTime) {
    return left.parsedTime - right.parsedTime;
  }
  if (left.parsedTime !== null) {
    return -1;
  }
  if (right.parsedTime !== null) {
    return 1;
  }
  return left.record.id.localeCompare(right.record.id);
}

function compareTimestamp(left: string | null | undefined, right: string | null | undefined): number {
  const leftTime = parseTimestamp(left);
  const rightTime = parseTimestamp(right);
  if (leftTime !== null && rightTime !== null) {
    return leftTime - rightTime;
  }
  if (leftTime !== null) {
    return 1;
  }
  if (rightTime !== null) {
    return -1;
  }
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function compareNullableNumberDescending(left: number | null, right: number | null): number {
  if (typeof left === "number" && typeof right === "number") {
    return right - left;
  }
  if (typeof left === "number") {
    return -1;
  }
  if (typeof right === "number") {
    return 1;
  }
  return 0;
}

function percentile95(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? null;
}

function includesAny(value: string, terms: readonly string[]): boolean {
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

type PricingRule = {
  match: string;
  promptPerMillion: number;
  completionPerMillion: number;
  exact?: boolean;
};

const PRICING_RULES: PricingRule[] = [
  { match: "openai/gpt-4o-mini", promptPerMillion: 0.15, completionPerMillion: 0.6, exact: true },
  { match: "openai/gpt-4o", promptPerMillion: 2.5, completionPerMillion: 10, exact: true },
  { match: "anthropic/claude-3.5-sonnet", promptPerMillion: 3, completionPerMillion: 15 },
  { match: "anthropic/claude-3.7-sonnet", promptPerMillion: 3, completionPerMillion: 15 },
  { match: "anthropic/claude-sonnet", promptPerMillion: 3, completionPerMillion: 15 },
  { match: "openai/gpt-4.1", promptPerMillion: 2, completionPerMillion: 8 },
];

function estimateCostUsd(
  model: string | null,
  promptTokens: number | null,
  completionTokens: number | null,
): number | null {
  if (!model || promptTokens === null || completionTokens === null) {
    return null;
  }

  const rule = PRICING_RULES.find((candidate) =>
    candidate.exact ? model === candidate.match : model.startsWith(candidate.match),
  );
  if (!rule) {
    return null;
  }

  return (
    (promptTokens / 1_000_000) * rule.promptPerMillion +
    (completionTokens / 1_000_000) * rule.completionPerMillion
  );
}
