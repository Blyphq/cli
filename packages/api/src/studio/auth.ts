import type {
  StudioAuthEvent,
  StudioAuthEventKind,
  StudioAuthOverview,
  StudioAuthQueryInput,
  StudioAuthSuspiciousPattern,
  StudioAuthUserSummary,
  StudioNormalizedRecord,
} from "./types";

const AUTH_ROUTE_PREFIXES = [
  "/auth/",
  "/login",
  "/logout",
  "/oauth/",
  "/session/",
  "/token/",
  "/verify/",
] as const;

const AUTH_MESSAGE_PATTERNS = [
  "unauthorized",
  "forbidden",
  "invalid token",
  "login",
  "logout",
  "session expired",
  "authentication failed",
  "signin",
  "permission denied",
] as const;

const AUTH_TYPE_PATTERNS = [
  "auth",
  "login",
  "logout",
  "oauth",
  "session",
  "token",
  "verify",
  "permission",
  "signin",
  "unauthorized",
  "forbidden",
];

const SENSITIVE_KEY_PATTERN =
  /(password|passcode|access[_-]?token|refresh[_-]?token|authorization|cookie|secret|^token$|\.token$|_token$)/i;

const REDACTED_VALUE_PATTERN = /(\*{2,}|\[redacted\]|redacted|masked)/i;

const DEFAULT_AUTH_LIMIT = 100;
const MAX_AUTH_LIMIT = 500;

export function analyzeAuthRecords(
  records: StudioNormalizedRecord[],
  input: Pick<StudioAuthQueryInput, "offset" | "limit" | "userId"> = {},
): StudioAuthOverview {
  const matched = records.filter(isAuthRecord);
  const events = matched
    .map(toAuthEvent)
    .sort(compareEventsDescending);
  const scopedEvents = input.userId
    ? events.filter((event) => event.userId === input.userId)
    : events;
  const suspiciousPatterns = detectSuspiciousPatterns(events).filter((pattern) =>
    input.userId ? pattern.affectedUserId === input.userId : true,
  );
  const stats = buildStats(scopedEvents, suspiciousPatterns);
  const users = buildUserSummaries(scopedEvents);
  const offset = Math.max(0, input.offset ?? 0);
  const limit = clampLimit(input.limit);

  return {
    stats,
    timeline: scopedEvents.slice(offset, offset + limit),
    totalTimelineEvents: scopedEvents.length,
    suspiciousPatterns,
    users,
  };
}

export function isAuthRecord(record: StudioNormalizedRecord): boolean {
  const route = getRoute(record);
  const text = `${record.message} ${record.type ?? ""}`.toLowerCase();
  const statusCode = getStatusCode(record);
  const authFieldPresence = hasAuthField(record);
  const routeMatch = Boolean(route && AUTH_ROUTE_PREFIXES.some((prefix) => route.startsWith(prefix)));
  const authMessage = AUTH_MESSAGE_PATTERNS.some((pattern) => text.includes(pattern));
  const typeMatch = AUTH_TYPE_PATTERNS.some((pattern) =>
    (record.type ?? "").toLowerCase().includes(pattern),
  );
  const userField = Boolean(
    getSafeString(record, ["user.id", "userId", "auth.userId"]) ||
      getSafeString(record, ["user.email", "userEmail"]),
  );
  const authError = (statusCode === 401 || statusCode === 403) && (routeMatch || authMessage);

  if (routeMatch || authFieldPresence || authError) {
    return true;
  }

  const weakSignals = [authMessage, typeMatch, userField && (routeMatch || authMessage)].filter(Boolean);
  return weakSignals.length >= 2;
}

function toAuthEvent(record: StudioNormalizedRecord): StudioAuthEvent {
  const lowerText = `${record.message} ${record.type ?? ""}`.toLowerCase();
  const route = getRoute(record);
  const statusCode = getStatusCode(record);
  const kind = classifyKind(lowerText, route, statusCode);
  const action = classifyAction(kind, lowerText, route);
  const outcome = classifyOutcome(kind, lowerText, statusCode);
  const userId = getSafeString(record, ["user.id", "userId", "auth.userId"]);
  const userEmail = getUserEmail(record);
  const ip = getSafeString(record, ["ip", "clientIp", "auth.ip", "request.ip"]) ?? record.http?.ip ?? null;
  const provider = getSafeString(record, ["provider", "oauth.provider", "auth.provider"]);
  const scope = getSafeString(record, ["scope", "oauth.scope", "auth.scope"]);
  const requiredPermission = getSafeString(record, [
    "requiredPermission",
    "permission",
    "auth.requiredPermission",
    "auth.permission",
  ]);
  const durationMs = getNumber(record, ["durationMs", "duration", "responseTime", "auth.durationMs"]) ?? record.http?.durationMs ?? null;
  const sessionId = normalizeSessionId(
    getSafeString(record, ["session.id", "sessionId", "auth.sessionId"]),
  );

  return {
    id: `auth:${record.id}`,
    recordId: record.id,
    timestamp: record.timestamp,
    kind,
    action,
    outcome,
    userId,
    userEmail,
    ip,
    route,
    method: record.http?.method ?? getSafeString(record, ["method", "http.method"]),
    provider,
    scope,
    requiredPermission,
    statusCode,
    durationMs,
    sessionId,
    summary: buildSummary({
      action,
      outcome,
      userId,
      userEmail,
      route,
      provider,
      scope,
      statusCode,
      durationMs,
      sessionId,
    }),
  };
}

function classifyKind(
  lowerText: string,
  route: string | null,
  statusCode: number | null,
): StudioAuthEventKind {
  if (route?.startsWith("/oauth/") || lowerText.includes("oauth") || lowerText.includes("callback")) {
    return "oauth";
  }
  if (
    route?.startsWith("/login") ||
    route?.startsWith("/logout") ||
    route?.startsWith("/auth/login") ||
    lowerText.includes("login") ||
    lowerText.includes("signin") ||
    lowerText.includes("authenticate")
  ) {
    return "login";
  }
  if (route?.startsWith("/session/") || lowerText.includes("session")) {
    return "session";
  }
  if (route?.startsWith("/token/") || lowerText.includes("token")) {
    return "token";
  }
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    lowerText.includes("forbidden") ||
    lowerText.includes("unauthorized") ||
    lowerText.includes("permission denied")
  ) {
    return "permission";
  }
  return "other";
}

function classifyAction(kind: StudioAuthEventKind, lowerText: string, route: string | null): string {
  if (kind === "session") {
    if (lowerText.includes("expired")) return "expired";
    if (lowerText.includes("refresh")) return "refreshed";
    if (lowerText.includes("destroy") || lowerText.includes("logout") || lowerText.includes("revoke")) return "destroyed";
    if (lowerText.includes("create") || lowerText.includes("issued") || route?.includes("create")) return "created";
    return "session";
  }

  if (kind === "token") {
    if (lowerText.includes("expired")) return "expired";
    if (lowerText.includes("reject") || lowerText.includes("invalid")) return "rejected";
    if (lowerText.includes("valid")) return "validated";
    if (lowerText.includes("issue") || lowerText.includes("mint")) return "issued";
    return "token";
  }

  if (kind === "oauth") {
    if (lowerText.includes("callback")) return "callback";
    if (lowerText.includes("authorize")) return "authorize";
    return "oauth";
  }

  if (kind === "permission") {
    return "permission";
  }

  if (kind === "login") {
    if (lowerText.includes("logout")) return "logout";
    if (lowerText.includes("magic link")) return "magic link";
    if (lowerText.includes("oauth")) return "oauth";
    if (lowerText.includes("password")) return "password";
    return "login";
  }

  return route ?? "auth";
}

function classifyOutcome(
  kind: StudioAuthEventKind,
  lowerText: string,
  statusCode: number | null,
): StudioAuthEvent["outcome"] {
  const explicitFailure =
    lowerText.includes("failed") ||
    lowerText.includes("failure") ||
    lowerText.includes("invalid") ||
    lowerText.includes("rejected") ||
    lowerText.includes("denied") ||
    lowerText.includes("unauthorized") ||
    lowerText.includes("forbidden") ||
    lowerText.includes("expired");
  const explicitSuccess =
    lowerText.includes("success") ||
    lowerText.includes("succeeded") ||
    lowerText.includes("validated") ||
    lowerText.includes("issued") ||
    lowerText.includes("created") ||
    lowerText.includes("refreshed");

  if (explicitFailure) {
    return "failure";
  }

  if (explicitSuccess) {
    return "success";
  }

  if (statusCode !== null) {
    if (statusCode >= 400) {
      return "failure";
    }
    if (statusCode >= 200 && statusCode < 400) {
      return kind === "permission" ? "unknown" : "success";
    }
  }

  return "unknown";
}

function buildStats(
  events: StudioAuthEvent[],
  suspiciousPatterns: StudioAuthSuspiciousPattern[],
): StudioAuthOverview["stats"] {
  const logins = events.filter((event) => event.kind === "login");
  const loginSuccessCount = logins.filter((event) => event.outcome === "success").length;
  const loginFailureCount = logins.filter((event) => event.outcome === "failure").length;
  const sessionIds = new Set<string>();
  const fallbackUserIds = new Set<string>();

  for (const event of events) {
    if (event.sessionId) {
      sessionIds.add(event.sessionId);
      continue;
    }

    if (event.userId) {
      fallbackUserIds.add(event.userId);
    }
  }

  return {
    loginAttemptsTotal: logins.length,
    loginSuccessCount,
    loginFailureCount,
    activeSessionCount: sessionIds.size + fallbackUserIds.size,
    authErrorCount: events.filter((event) => event.statusCode === 401 || event.statusCode === 403).length,
    suspiciousActivityCount: suspiciousPatterns.length,
  };
}

function buildUserSummaries(events: StudioAuthEvent[]): StudioAuthUserSummary[] {
  const byUser = new Map<string, StudioAuthUserSummary>();

  for (const event of events) {
    if (!event.userId) {
      continue;
    }

    const current =
      byUser.get(event.userId) ??
      {
        userId: event.userId,
        loginCount: 0,
        lastSeen: null,
        errorCount: 0,
      };

    if (event.kind === "login") {
      current.loginCount += 1;
    }
    if (event.outcome === "failure" || event.kind === "permission") {
      current.errorCount += 1;
    }
    current.lastSeen = maxTimestamp(current.lastSeen, event.timestamp);
    byUser.set(event.userId, current);
  }

  return Array.from(byUser.values()).sort((left, right) => {
    const timeDelta = compareTimestamps(right.lastSeen, left.lastSeen);
    if (timeDelta !== 0) {
      return timeDelta;
    }
    return left.userId.localeCompare(right.userId);
  });
}

function detectSuspiciousPatterns(events: StudioAuthEvent[]): StudioAuthSuspiciousPattern[] {
  return [
    ...detectBruteForce(events),
    ...detectInvalidTokenSpikes(events),
    ...detectConcurrentSessions(events),
  ].sort((left, right) => compareTimestamps(right.timestampStart, left.timestampStart));
}

function detectBruteForce(events: StudioAuthEvent[]): StudioAuthSuspiciousPattern[] {
  const failures = events.filter(
    (event) => event.kind === "login" && event.outcome === "failure" && (event.ip || event.userId),
  );
  const groups = new Map<string, StudioAuthEvent[]>();

  for (const event of failures) {
    const key = event.ip ? `ip:${event.ip}` : `user:${event.userId}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(event);
    groups.set(key, bucket);
  }

  return detectWindowedPatterns(groups, 3, "brute-force", (key, windowEvents) => {
    const first = windowEvents[0]!;
    const title = first.ip ? `Brute force indicator from ${first.ip}` : `Brute force indicator for ${first.userId}`;
    return {
      title,
      description: `${windowEvents.length} failed login attempts within 5 minutes.`,
      affectedIp: first.ip,
      affectedUserId: first.userId,
    };
  });
}

function detectInvalidTokenSpikes(events: StudioAuthEvent[]): StudioAuthSuspiciousPattern[] {
  const failures = events.filter(
    (event) =>
      event.kind === "token" &&
      event.outcome === "failure" &&
      (event.action === "rejected" || event.summary.toLowerCase().includes("invalid token")),
  );
  const groups = new Map<string, StudioAuthEvent[]>();

  for (const event of failures) {
    const key = event.route ? `route:${event.route}` : "global";
    const bucket = groups.get(key) ?? [];
    bucket.push(event);
    groups.set(key, bucket);
  }

  return detectWindowedPatterns(groups, 5, "invalid-token-spike", (key, windowEvents) => {
    const first = windowEvents[0]!;
    return {
      title: "Invalid token spike",
      description: `${windowEvents.length} token validation failures within 5 minutes${first.route ? ` on ${first.route}` : ""}.`,
      affectedIp: null,
      affectedUserId: null,
    };
  });
}

function detectConcurrentSessions(events: StudioAuthEvent[]): StudioAuthSuspiciousPattern[] {
  const candidates = events.filter(
    (event) =>
      Boolean(event.userId && event.ip) &&
      (event.kind === "session" || (event.kind === "login" && event.outcome === "success")),
  );
  const byUser = new Map<string, StudioAuthEvent[]>();

  for (const event of candidates) {
    const bucket = byUser.get(event.userId!) ?? [];
    bucket.push(event);
    byUser.set(event.userId!, bucket);
  }

  const patterns: StudioAuthSuspiciousPattern[] = [];

  for (const [userId, userEvents] of byUser.entries()) {
    const sorted = userEvents.slice().sort(compareEventsAscending);
    for (let start = 0; start < sorted.length; start += 1) {
      const windowStart = sorted[start];
      if (!windowStart?.timestamp) {
        continue;
      }
      const startTime = Date.parse(windowStart.timestamp);
      const windowEvents = sorted.filter((event) => {
        const time = event.timestamp ? Date.parse(event.timestamp) : Number.NaN;
        return Number.isFinite(time) && time - startTime <= 30 * 60_000 && time >= startTime;
      });
      const ips = new Set(windowEvents.map((event) => event.ip).filter(Boolean));
      if (ips.size < 2) {
        continue;
      }
      const recordIds = Array.from(new Set(windowEvents.map((event) => event.recordId)));
      patterns.push({
        id: `concurrent:${userId}:${windowStart.recordId}`,
        kind: "concurrent-sessions",
        title: `Concurrent sessions for ${userId}`,
        description: `Activity from ${ips.size} IPs within 30 minutes suggests concurrent sessions.`,
        affectedUserId: userId,
        affectedIp: null,
        eventCount: windowEvents.length,
        timestampStart: windowEvents[0]?.timestamp ?? null,
        timestampEnd: windowEvents[windowEvents.length - 1]?.timestamp ?? null,
        recordIds,
      });
      break;
    }
  }

  return patterns;
}

function detectWindowedPatterns(
  groups: Map<string, StudioAuthEvent[]>,
  threshold: number,
  kind: StudioAuthSuspiciousPattern["kind"],
  buildMeta: (
    key: string,
    windowEvents: StudioAuthEvent[],
  ) => Pick<StudioAuthSuspiciousPattern, "title" | "description" | "affectedIp" | "affectedUserId">,
): StudioAuthSuspiciousPattern[] {
  const patterns: StudioAuthSuspiciousPattern[] = [];

  for (const [key, group] of groups.entries()) {
    const sorted = group.slice().sort(compareEventsAscending);
    for (let start = 0; start < sorted.length; start += 1) {
      const base = sorted[start];
      if (!base?.timestamp) {
        continue;
      }
      const startTime = Date.parse(base.timestamp);
      const windowEvents = sorted.filter((event) => {
        const time = event.timestamp ? Date.parse(event.timestamp) : Number.NaN;
        return Number.isFinite(time) && time >= startTime && time - startTime <= 5 * 60_000;
      });
      if (windowEvents.length < threshold) {
        continue;
      }
      const meta = buildMeta(key, windowEvents);
      patterns.push({
        id: `${kind}:${key}:${base.recordId}`,
        kind,
        title: meta.title,
        description: meta.description,
        affectedUserId: meta.affectedUserId,
        affectedIp: meta.affectedIp,
        eventCount: windowEvents.length,
        timestampStart: windowEvents[0]?.timestamp ?? null,
        timestampEnd: windowEvents[windowEvents.length - 1]?.timestamp ?? null,
        recordIds: Array.from(new Set(windowEvents.map((event) => event.recordId))),
      });
      break;
    }
  }

  return patterns;
}

function getUserEmail(record: StudioNormalizedRecord): string | null {
  const email = getSafeString(record, ["user.email", "userEmail", "auth.userEmail"]);
  if (!email) {
    return null;
  }
  if (REDACTED_VALUE_PATTERN.test(email)) {
    return email;
  }
  return email;
}

function buildSummary(input: {
  action: string;
  outcome: StudioAuthEvent["outcome"];
  userId: string | null;
  userEmail: string | null;
  route: string | null;
  provider: string | null;
  scope: string | null;
  statusCode: number | null;
  durationMs: number | null;
  sessionId: string | null;
}): string {
  const parts = [input.action, input.outcome !== "unknown" ? input.outcome : null];
  const context = [
    input.userId,
    input.userEmail,
    input.route,
    input.provider,
    input.scope ? `scope ${input.scope}` : null,
    input.statusCode !== null ? `status ${input.statusCode}` : null,
    input.durationMs !== null ? `${input.durationMs}ms` : null,
    input.sessionId ? `session ${input.sessionId}` : null,
  ].filter(Boolean);

  return `${parts.filter(Boolean).join(" ")}${context.length ? ` - ${context.join(" | ")}` : ""}`;
}

function getRoute(record: StudioNormalizedRecord): string | null {
  const route =
    record.http?.path ??
    record.http?.url ??
    getSafeString(record, ["route", "path", "url", "request.path", "request.url", "auth.route"]);
  return typeof route === "string" ? route : null;
}

function getStatusCode(record: StudioNormalizedRecord): number | null {
  return record.http?.statusCode ?? getNumber(record, ["statusCode", "status", "http.statusCode"]);
}

function getSafeString(record: StudioNormalizedRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = getValue(record, key);
    if (typeof value === "string" && value.length > 0) {
      return value;
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
  if (!isPlainObject(value)) {
    return undefined;
  }

  if (SENSITIVE_KEY_PATTERN.test(dottedKey)) {
    return undefined;
  }

  if (dottedKey in value && !SENSITIVE_KEY_PATTERN.test(dottedKey)) {
    return value[dottedKey];
  }

  const parts = dottedKey.split(".");
  let current: unknown = value;
  for (const part of parts) {
    if (!isPlainObject(current) || !(part in current)) {
      return undefined;
    }
    const currentKey = part.toLowerCase();
    if (SENSITIVE_KEY_PATTERN.test(currentKey)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function hasAuthField(record: StudioNormalizedRecord): boolean {
  const roots = [record.raw, record.data, record.bindings];
  return roots.some((root) => containsAuthField(root));
}

function containsAuthField(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (
      key === "auth" ||
      key === "session" ||
      key === "token" ||
      key === "user.id" ||
      key === "user.email"
    ) {
      return true;
    }
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }
    if (
      key === "user" &&
      isPlainObject(nested) &&
      (typeof nested.id === "string" || typeof nested.email === "string")
    ) {
      return true;
    }
    if (isPlainObject(nested) && containsAuthField(nested)) {
      return true;
    }
  }

  return false;
}

function normalizeSessionId(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.length > 12 ? value.slice(0, 8) : value;
}

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_AUTH_LIMIT, 1), MAX_AUTH_LIMIT);
}

function compareEventsDescending(left: StudioAuthEvent, right: StudioAuthEvent): number {
  return compareTimestamps(right.timestamp, left.timestamp);
}

function compareEventsAscending(left: StudioAuthEvent, right: StudioAuthEvent): number {
  return compareTimestamps(left.timestamp, right.timestamp);
}

function compareTimestamps(left: string | null, right: string | null): number {
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

function maxTimestamp(left: string | null, right: string | null): string | null {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return leftTime >= rightTime ? left : right;
  }
  if (Number.isFinite(leftTime)) {
    return left;
  }
  if (Number.isFinite(rightTime)) {
    return right;
  }
  return left;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
