import type {
  StudioCustomSectionDefinition,
  StudioDetectedSection,
  StudioNormalizedRecord,
  StudioSectionId,
} from "./types";

interface SectionDefinition {
  id: StudioSectionId;
  label: string;
  icon: string;
  kind: "builtin" | "custom";
  match(record: StudioNormalizedRecord): { score: number; unreadError: boolean } | null;
}

const wildcardRegexCache = new Map<string, RegExp>();

const BUILTIN_SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    id: "errors",
    label: "Errors",
    icon: "⚠",
    kind: "builtin",
    match(record) {
      const status = record.http?.statusCode ?? getNumber(record, ["statusCode", "status"]);
      const fieldHit = hasFieldPattern(record, ["error.*", "stack", "exception"]);
      const messageHit = hasMessagePattern(record, ["error", "exception", "failed", "crash", "unhandled"]);
      const errorTypeHit = hasErrorTypePattern(record, ["error", "exception", "panic", "prisma"]);
      const statusHit = typeof status === "number" && status >= 500;
      if (!fieldHit && !messageHit && !errorTypeHit && !statusHit) {
        return null;
      }
      return {
        score: (fieldHit ? 5 : 0) + (statusHit ? 3 : 0) + (messageHit ? 2 : 0) + (errorTypeHit ? 2 : 0),
        unreadError: true,
      };
    },
  },
  {
    id: "auth",
    label: "Auth",
    icon: "🔐",
    kind: "builtin",
    match(record) {
      return buildDomainMatch(record, {
        routes: ["/auth/*", "/login", "/logout", "/oauth/*", "/session/*"],
        fields: ["auth.*", "session.*", "token.*", "user.id"],
        statuses: [401, 403],
        messages: ["unauthorized", "forbidden", "invalid token", "login"],
      });
    },
  },
  {
    id: "payments",
    label: "Payments",
    icon: "💳",
    kind: "builtin",
    match(record) {
      return buildDomainMatch(record, {
        routes: ["/checkout/*", "/payment/*", "/webhook/stripe", "/billing/*"],
        fields: ["payment.*", "cart.*", "order.*", "stripe.*", "invoice.*"],
        statuses: [402],
        messages: ["payment", "charge", "invoice", "subscription", "declined"],
      });
    },
  },
  {
    id: "http",
    label: "HTTP / API",
    icon: "🌐",
    kind: "builtin",
    match(record) {
      const fieldHit = Boolean(record.http) || hasFieldPattern(record, ["method", "path", "status", "duration", "response_time"]);
      if (!fieldHit) {
        return null;
      }
      return { score: record.http ? 5 : 3, unreadError: isErrorRecord(record) };
    },
  },
  {
    id: "agents",
    label: "Agents",
    icon: "🤖",
    kind: "builtin",
    match(record) {
      return buildDomainMatch(record, {
        routes: [],
        fields: ["agent.*", "llm.*", "tool.*", "tokens.*", "prompt.*"],
        statuses: [],
        messages: ["tool call", "completion", "prompt", "agent", "function call"],
      });
    },
  },
  {
    id: "background",
    label: "Background Jobs",
    icon: "⚙",
    kind: "builtin",
    match(record) {
      return buildDomainMatch(record, {
        routes: [],
        fields: ["job.*", "task.*", "queue.*", "cron.*", "worker.*", "schedule.*"],
        statuses: [],
        messages: ["job started", "job completed", "job failed", "scheduled", "worker", "queue", "cron", "processing"],
      });
    },
  },
  {
    id: "database",
    label: "Database",
    icon: "🗄",
    kind: "builtin",
    match(record) {
      return buildDomainMatch(record, {
        routes: [],
        fields: ["db.*", "query.*", "prisma.*", "drizzle.*", "sql.*"],
        statuses: [],
        messages: ["query", "transaction", "migration", "slow query"],
      });
    },
  },
];

export function buildDetectedSections(
  records: StudioNormalizedRecord[],
  customSections: StudioCustomSectionDefinition[] = [],
): StudioDetectedSection[] {
  const definitions = [
    ...BUILTIN_SECTION_DEFINITIONS,
    ...customSections.map(toCustomDefinition),
  ];

  const detected: StudioDetectedSection[] = [];

  for (const definition of definitions) {
    let count = 0;
    let unreadErrorCount = 0;
    let lastMatchedAt: string | null = null;
    let lastErrorAt: string | null = null;

    for (const record of records) {
      const matched = definition.match(record);
      if (!matched) {
        continue;
      }
      count += 1;
      lastMatchedAt = maxTimestamp(lastMatchedAt, record.timestamp);
      if (matched.unreadError) {
        unreadErrorCount += 1;
        lastErrorAt = maxTimestamp(lastErrorAt, record.timestamp);
      }
    }

    if (count === 0) {
      continue;
    }

    detected.push({
      id: definition.id,
      label: definition.label,
      icon: definition.icon,
      count,
      kind: definition.kind,
      highlighted: definition.id === "errors",
      unreadErrorCount,
      lastMatchedAt,
      lastErrorAt,
    });
  }

  return sortSections(detected);
}

export function matchesDetectedSection(
  record: StudioNormalizedRecord,
  sectionId: string | undefined,
  customSections: StudioCustomSectionDefinition[] = [],
): boolean {
  if (!sectionId || sectionId === "all-logs" || sectionId === "overview") {
    return true;
  }

  const definition = [
    ...BUILTIN_SECTION_DEFINITIONS,
    ...customSections.map(toCustomDefinition),
  ].find((item) => item.id === sectionId);

  return definition ? Boolean(definition.match(record)) : true;
}

export function getMatchedSectionIds(
  record: StudioNormalizedRecord,
  customSections: StudioCustomSectionDefinition[] = [],
): StudioSectionId[] {
  return [
    ...BUILTIN_SECTION_DEFINITIONS,
    ...customSections.map(toCustomDefinition),
  ]
    .filter((definition) => Boolean(definition.match(record)))
    .map((definition) => definition.id);
}

function toCustomDefinition(section: StudioCustomSectionDefinition): SectionDefinition {
  return {
    id: section.id,
    label: section.name,
    icon: section.icon,
    kind: "custom",
    match(record) {
      return buildDomainMatch(record, {
        routes: section.match.routes,
        fields: section.match.fields,
        statuses: [],
        messages: section.match.messages,
      });
    },
  };
}

function buildDomainMatch(
  record: StudioNormalizedRecord,
  input: {
    routes: string[];
    fields: string[];
    statuses: number[];
    messages: string[];
  },
): { score: number; unreadError: boolean } | null {
  const fieldHit = hasFieldPattern(record, input.fields);
  const routeHit = hasRoutePattern(record, input.routes);
  const status = record.http?.statusCode ?? getNumber(record, ["statusCode", "status"]);
  const statusHit = typeof status === "number" && input.statuses.includes(status);
  const messageHit = hasMessagePattern(record, input.messages);
  const corroborated = fieldHit || routeHit || messageHit;

  if (statusHit && !corroborated) {
    return null;
  }

  const score = (fieldHit ? 5 : 0) + (routeHit ? 4 : 0) + (statusHit ? 3 : 0) + (messageHit ? 2 : 0);
  return score > 0 ? { score, unreadError: isErrorRecord(record) } : null;
}

function hasRoutePattern(record: StudioNormalizedRecord, patterns: string[]): boolean {
  if (!patterns.length) {
    return false;
  }
  const route =
    record.http?.path ??
    record.http?.url ??
    getString(record, ["route", "path", "url", "request.path", "request.url"]);

  if (!route) {
    return false;
  }

  return patterns.some((pattern) => wildcardMatch(route, pattern));
}

function hasFieldPattern(record: StudioNormalizedRecord, patterns: string[]): boolean {
  if (!patterns.length) {
    return false;
  }

  const keys = new Set<string>();
  collectKeys(record.raw, "", keys);
  collectKeys(record.data, "data", keys);
  collectKeys(record.bindings, "bindings", keys);
  if (record.http) {
    for (const key of Object.keys(record.http)) {
      keys.add(key);
      keys.add(`http.${key}`);
    }
  }

  return Array.from(keys).some((key) => patterns.some((pattern) => wildcardMatch(key, pattern)));
}

function hasMessagePattern(record: StudioNormalizedRecord, patterns: string[]): boolean {
  if (!patterns.length) {
    return false;
  }

  const haystack = `${record.message} ${record.type ?? ""} ${serialize(record.error)}`.toLowerCase();
  return patterns.some((pattern) => haystack.includes(pattern.toLowerCase()));
}

function hasErrorTypePattern(record: StudioNormalizedRecord, patterns: string[]): boolean {
  const name = getString(record, ["error.name", "error.code", "code"]);
  if (!name) {
    return false;
  }
  const normalized = name.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

function collectKeys(value: unknown, prefix: string, target: Set<string>) {
  if (!isPlainObject(value)) {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    target.add(key);
    target.add(next);
    collectKeys(nested, next, target);
  }
}

function wildcardMatch(value: string, pattern: string): boolean {
  let matcher = wildcardRegexCache.get(pattern);

  if (!matcher) {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    matcher = new RegExp(`^${escaped}$`, "i");
    wildcardRegexCache.set(pattern, matcher);
  }

  return matcher.test(value);
}

function sortSections(sections: StudioDetectedSection[]): StudioDetectedSection[] {
  return sections.sort((left, right) => {
    if (left.id === "errors") {
      return -1;
    }
    if (right.id === "errors") {
      return 1;
    }
    if (left.count !== right.count) {
      return right.count - left.count;
    }
    return left.label.localeCompare(right.label);
  });
}

export function isErrorRecord(record: StudioNormalizedRecord): boolean {
  const status = record.http?.statusCode ?? getNumber(record, ["statusCode", "status"]);
  return (
    record.level === "error" ||
    record.level === "critical" ||
    Boolean(record.error) ||
    Boolean(record.stack) ||
    (typeof status === "number" && status >= 500)
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
  for (const source of [record.raw, record.data, record.bindings]) {
    const value = getNestedValue(source, dottedKey);
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

  if (dottedKey in value) {
    return value[dottedKey];
  }

  let current: unknown = value;
  for (const part of dottedKey.split(".")) {
    if (!isPlainObject(current) || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

function serialize(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value ?? "");
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
  const leftValid = Number.isFinite(leftTime);
  const rightValid = Number.isFinite(rightTime);

  if (!leftValid) {
    return rightValid ? right : left;
  }
  if (!rightValid) {
    return left;
  }

  return leftTime >= rightTime ? left : right;
}
