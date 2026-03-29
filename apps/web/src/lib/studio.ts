import type { AppRouter } from "@blyp-cli/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";
import type { UIMessage } from "ai";

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type StudioMeta = RouterOutputs["studio"]["meta"];
export type StudioConfig = RouterOutputs["studio"]["config"];
export type StudioFiles = RouterOutputs["studio"]["files"];
export type StudioFile = StudioFiles["files"][number];
export type StudioLogsPage = RouterOutputs["studio"]["logs"];
export type StudioAuthOverview = RouterOutputs["studio"]["auth"];
export type StudioDatabaseOverview = RouterOutputs["studio"]["database"];
export type StudioAuthEvent = StudioAuthOverview["timeline"][number];
export type StudioAuthSuspiciousPattern = StudioAuthOverview["suspiciousPatterns"][number];
export type StudioAuthUserSummary = StudioAuthOverview["users"][number];
export type StudioDatabaseQueryEvent = StudioDatabaseOverview["queries"][number];
export type StudioDatabaseTransactionSummary = StudioDatabaseOverview["transactions"][number];
export type StudioDatabaseMigrationEvent = StudioDatabaseOverview["migrationEvents"][number];
export type StudioRecord = StudioLogsPage["records"][number];
export type StudioRecordSourceContext = RouterOutputs["studio"]["recordSource"];
export type StudioLogEntry = StudioLogsPage["entries"][number];
export type StudioGroupDetail = NonNullable<RouterOutputs["studio"]["group"]>;
export type StudioFacets = RouterOutputs["studio"]["facets"];
export type StudioAssistantStatus = RouterOutputs["studio"]["assistantStatus"];
export type StudioAssistantMessage = RouterOutputs["studio"]["assistantReply"];
export type StudioAssistantReference = StudioAssistantMessage["references"][number];
export type StudioGroupingMode = "grouped" | "flat";
export type StudioDetectedSection = StudioMeta["sections"][number];
export type StudioSectionId = StudioDetectedSection["id"] | "overview" | "all-logs";
export type StudioChatStatus = "submitted" | "streaming" | "ready" | "error";
export type StudioBadgeVariant =
  | "default"
  | "secondary"
  | "muted"
  | "outline"
  | "destructive";

export interface StudioAssistantMessageMetadata {
  references?: StudioAssistantReference[];
  model?: string;
}

export type StudioChatMessage = UIMessage<StudioAssistantMessageMetadata>;

export type StudioSelection =
  | { kind: "record"; id: string }
  | { kind: "group"; id: string }
  | null;

export interface StudioFilters {
  level: string;
  type: string;
  search: string;
  fileId: string;
  from: string;
  to: string;
}

export interface StudioAuthUiState {
  selectedUserId: string | null;
  selectedPatternId: string | null;
}

export interface StudioSidebarState {
  selectedSection: StudioSectionId;
  visitedAtBySection: Record<string, string>;
}

export const LEVEL_OPTIONS = [
  "all",
  "critical",
  "error",
  "warning",
  "info",
  "success",
  "debug",
  "unknown",
] as const;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatCompactDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export function formatRotation(maxSizeBytes: number, maxArchives: number): string {
  return `${formatBytes(maxSizeBytes)} max, ${maxArchives} archives`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const diffMs = parsed.getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const divisions: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 1000 * 60 * 60 * 24],
    ["hour", 1000 * 60 * 60],
    ["minute", 1000 * 60],
    ["second", 1000],
  ];

  for (const [unit, size] of divisions) {
    if (Math.abs(diffMs) >= size || unit === "second") {
      return formatter.format(Math.round(diffMs / size), unit);
    }
  }

  return value;
}

export function formatDurationMs(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

export function formatCalendarDate(value: Date | null | undefined): string {
  if (!value) {
    return "Pick a date";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export function toCalendarFilterValue(
  value: Date | null | undefined,
  boundary: "start" | "end",
): string {
  if (!value) {
    return "";
  }

  const next = new Date(value);

  if (boundary === "start") {
    next.setHours(0, 0, 0, 0);
  } else {
    next.setHours(23, 59, 59, 999);
  }

  return next.toISOString();
}

export function fromCalendarFilterValue(value: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

export function getLevelClasses(level: string): string {
  switch (level.toLowerCase()) {
    case "critical":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "error":
      return "border-destructive/20 bg-destructive/5 text-destructive";
    case "warning":
    case "warn":
      return "border-secondary bg-secondary text-secondary-foreground";
    case "success":
      return "border-primary/20 bg-primary/5 text-primary";
    case "debug":
      return "border-border bg-accent text-accent-foreground";
    case "info":
      return "border-primary/30 bg-primary/10 text-primary";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function getStatusClasses(
  status: "found" | "not-found" | "error" | "valid" | "invalid",
): string {
  switch (status) {
    case "found":
    case "valid":
      return "border-primary/30 bg-primary/10 text-primary";
    case "not-found":
      return "border-secondary bg-secondary text-secondary-foreground";
    case "error":
    case "invalid":
      return "border-destructive/30 bg-destructive/10 text-destructive";
  }
}

export function getFileKindBadgeVariant(
  kind: StudioFile["kind"],
): StudioBadgeVariant {
  return kind === "archive" ? "secondary" : "muted";
}

export function getFileStreamBadgeVariant(
  stream: StudioFile["stream"],
): StudioBadgeVariant {
  switch (stream) {
    case "error":
      return "destructive";
    case "combined":
      return "outline";
    default:
      return "muted";
  }
}

export function getSourceBadgeVariant(
  source: StudioRecord["source"],
): StudioBadgeVariant {
  switch (source) {
    case "http":
      return "outline";
    case "structured":
      return "secondary";
    case "client":
      return "default";
    case "unknown":
      return "muted";
    default:
      return "muted";
  }
}

export function getDurationClasses(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "text-muted-foreground";
  }

  if (value > 500) {
    return "text-destructive";
  }

  if (value > 100) {
    return "text-amber-600";
  }

  return "text-foreground";
}

export function getAssistantStatusLabel(status: StudioAssistantStatus): string {
  if (status.enabled) {
    return status.model ?? "Configured";
  }

  switch (status.reason) {
    case "missing_api_key":
      return "Missing OPENROUTER_API_KEY";
    case "missing_model":
      return "Missing AI model";
    default:
      return "Unavailable";
  }
}

export function shouldShowProjectContextAdvisory(
  status: StudioAssistantStatus | undefined,
): boolean {
  return Boolean(status?.enabled && !status.projectContext.claudeMdPresent);
}

export function getMessageText(message: StudioChatMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function getMessageReasoning(message: StudioChatMessage): string {
  return message.parts
    .filter((part) => part.type === "reasoning")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function getMessageReferences(
  message: StudioChatMessage,
): StudioAssistantReference[] {
  return message.metadata?.references ?? [];
}

export function getMessageModel(message: StudioChatMessage): string | null {
  return message.metadata?.model ?? null;
}

export function isMessageStreaming(message: StudioChatMessage): boolean {
  return message.parts.some(
    (part) =>
      (part.type === "text" || part.type === "reasoning") &&
      part.state === "streaming",
  );
}

export function getGroupingReasonLabel(reason: StudioGroupDetail["group"]["groupingReason"]): string {
  switch (reason) {
    case "explicit-group-id":
      return "groupId";
    case "request-id":
      return "requestId";
    case "correlation-id":
      return "correlationId";
    case "trace-id":
      return "traceId";
    case "heuristic":
      return "Heuristic";
  }
}

export function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function buildHttpPreview(record: StudioRecord): string {
  const method = record.http?.method ?? "GET";
  const target = record.http?.path ?? record.http?.url ?? "/";
  const status = record.http?.statusCode ?? 0;
  const duration = record.http?.durationMs ?? 0;
  const headerLines = [
    `X-Blyp-Source: ${record.source}`,
    record.http?.hostname ? `Host: ${record.http.hostname}` : null,
    record.http?.ip ? `X-Client-IP: ${record.http.ip}` : null,
    record.http?.userAgent ? `User-Agent: ${record.http.userAgent}` : null,
  ].filter(Boolean);

  const body = record.data !== undefined ? stringifyJson(record.data) : "";

  return [
    `${method} ${target} HTTP/1.1`,
    ...headerLines,
    "",
    `HTTP/1.1 ${status}`,
    `X-Response-Time: ${duration}ms`,
    "",
    body,
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n");
}

export function isGroupEntry(
  entry: StudioLogEntry,
): entry is Extract<StudioLogEntry, { kind: "structured-group" }> {
  return entry.kind === "structured-group";
}

export function isRecordEntry(
  entry: StudioLogEntry,
): entry is Extract<StudioLogEntry, { kind: "record" }> {
  return entry.kind === "record";
}

export function getStructuredRecordLabel(record: StudioRecord): string {
  const eventSummary = getStructuredEventSummaries(record)[0];
  if (eventSummary) {
    return eventSummary;
  }

  if (!isGenericStructuredLabel(record.message, record.type)) {
    return record.message;
  }

  if (record.http?.method && (record.http.path ?? record.http.url)) {
    const target = record.http.path ?? record.http.url;
    const status = record.http.statusCode ? ` ${record.http.statusCode}` : "";
    return `${record.http.method} ${target}${status}`;
  }

  if (record.type && !isGenericStructuredType(record.type)) {
    return record.type;
  }

  return record.message;
}

export function getStructuredEventSummaries(record: StudioRecord): string[] {
  const raw = asPlainObject(record.raw);
  if (!raw) {
    return [];
  }

  const events = readStructuredEvents(raw);
  return events
    .map((event) => summarizeStructuredEvent(event))
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

export function getStructuredEvents(record: StudioRecord): unknown[] {
  const raw = asPlainObject(record.raw);
  if (!raw) {
    return [];
  }

  return readStructuredEvents(raw);
}

export function getAuthEventKindLabel(kind: StudioAuthEvent["kind"]): string {
  switch (kind) {
    case "login":
      return "Login";
    case "session":
      return "Session";
    case "token":
      return "Token";
    case "permission":
      return "Permission";
    case "oauth":
      return "OAuth";
    default:
      return "Auth";
  }
}

export function getAuthOutcomeBadgeVariant(
  outcome: StudioAuthEvent["outcome"],
): StudioBadgeVariant {
  switch (outcome) {
    case "success":
      return "default";
    case "failure":
      return "destructive";
    default:
      return "muted";
  }
}

export function isOverviewSection(section: StudioSectionId): boolean {
  return section === "overview";
}

export function isAllLogsSection(section: StudioSectionId): boolean {
  return section === "all-logs";
}

export function isAuthSection(section: StudioSectionId): boolean {
  return section === "auth";
}

export function isDatabaseSection(section: StudioSectionId): boolean {
  return section === "database";
}

function readStructuredEvents(value: Record<string, unknown>): unknown[] {
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
    const next = value.trim();
    return next.length > 0 ? next : null;
  }

  const event = asPlainObject(value);
  if (!event) {
    return null;
  }

  const message = readFirstString(event, [
    "message",
    "summary",
    "title",
    "name",
    "event",
    "action",
    "step",
  ]);
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

  if (message && !isGenericStructuredLabel(message, type)) {
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

function readFirstString(value: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}
