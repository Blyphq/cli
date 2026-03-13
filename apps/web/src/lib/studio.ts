import type { AppRouter } from "@blyp-cli/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";
import type { UIMessage } from "ai";

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type StudioMeta = RouterOutputs["studio"]["meta"];
export type StudioConfig = RouterOutputs["studio"]["config"];
export type StudioFiles = RouterOutputs["studio"]["files"];
export type StudioFile = StudioFiles["files"][number];
export type StudioLogsPage = RouterOutputs["studio"]["logs"];
export type StudioRecord = StudioLogsPage["records"][number];
export type StudioRecordSourceContext = RouterOutputs["studio"]["recordSource"];
export type StudioLogEntry = StudioLogsPage["entries"][number];
export type StudioGroupDetail = NonNullable<RouterOutputs["studio"]["group"]>;
export type StudioFacets = RouterOutputs["studio"]["facets"];
export type StudioAssistantStatus = RouterOutputs["studio"]["assistantStatus"];
export type StudioAssistantMessage = RouterOutputs["studio"]["assistantReply"];
export type StudioAssistantReference = StudioAssistantMessage["references"][number];
export type StudioGroupingMode = "grouped" | "flat";
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
