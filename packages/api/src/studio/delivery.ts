import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  StudioConfigDiscovery,
  StudioConnectorDeliveryStatus,
  StudioConnectorHealth,
  StudioDeadLetterRecord,
  StudioDeliveryStatus,
  StudioResolvedConnectorsSummary,
} from "./types";

type DatabaseInstance = unknown;
type StatementInstance = unknown;

interface SqliteAdapter {
  create(filePath: string): DatabaseInstance;
  prepare(instance: DatabaseInstance, sql: string): StatementInstance;
  all(statement: StatementInstance, params: unknown[]): any[];
  run(statement: StatementInstance, params: unknown[]): void;
  exec(instance: DatabaseInstance, sql: string): void;
  close(instance: DatabaseInstance): void;
}

interface QueueStatusRow {
  connectorType: string;
  connectorTarget: string | null;
  pendingCount: number;
  deadLetterCount: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
}

interface QueueDeadLetterRow {
  id: string;
  connectorType: string;
  connectorTarget: string | null;
  payloadJson: string;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  deadLetteredAt: number;
}

export function getStudioQueuePath(): string {
  return path.join(os.homedir(), ".blyp", "queue.db");
}

export async function getStudioDeliveryStatus(
  config: StudioConfigDiscovery,
  input: {
    limit?: number;
    offset?: number;
    connectorKey?: string;
  } = {},
): Promise<StudioDeliveryStatus> {
  const enabledConnectors = getConfiguredConnectors(config.resolved.connectors);
  const queuePath = getStudioQueuePath();

  if (enabledConnectors.length === 0) {
    return {
      connectors: [],
      deadLetters: { items: [], total: 0, offset: input.offset ?? 0, limit: input.limit ?? 50 },
      queuePath,
      available: false,
      unavailableReason: "delivery_disabled",
    };
  }

  if (!fs.existsSync(queuePath)) {
    return {
      connectors: enabledConnectors,
      deadLetters: { items: [], total: 0, offset: input.offset ?? 0, limit: input.limit ?? 50 },
      queuePath,
      available: false,
      unavailableReason: "queue_missing",
    };
  }

  try {
    const adapter = await loadSqliteAdapter();
    const database = adapter.create(queuePath);

    try {
      const statusRows = listStatusRows(adapter, database);
      const deadLetterPage = listDeadLetterRows(adapter, database, input);
      const statusByKey = new Map(statusRows.map((row) => [buildConnectorKey(row.connectorType, row.connectorTarget), row]));
      const connectorMap = new Map<string, StudioConnectorDeliveryStatus>();

      for (const connector of enabledConnectors) {
        const row = statusByKey.get(connector.key);
        connectorMap.set(connector.key, mergeConnectorStatus(connector, row));
      }

      for (const row of statusRows) {
        const key = buildConnectorKey(row.connectorType, row.connectorTarget);
        if (!connectorMap.has(key)) {
          connectorMap.set(key, mergeConnectorStatus(buildUnknownConnector(key, row), row));
        }
      }

      return {
        connectors: [...connectorMap.values()].sort((left, right) => left.label.localeCompare(right.label)),
        deadLetters: {
          items: deadLetterPage.items.map((row) => toDeadLetterRecord(row, connectorMap.get(buildConnectorKey(row.connectorType, row.connectorTarget)))),
          total: deadLetterPage.total,
          offset: input.offset ?? 0,
          limit: input.limit ?? 50,
        },
        queuePath,
        available: true,
        unavailableReason: null,
      };
    } finally {
      adapter.close(database);
    }
  } catch {
    return {
      connectors: enabledConnectors,
      deadLetters: { items: [], total: 0, offset: input.offset ?? 0, limit: input.limit ?? 50 },
      queuePath,
      available: false,
      unavailableReason: "sqlite_unavailable",
    };
  }
}

export async function retryStudioDeadLetters(ids: string[]): Promise<{ retriedCount: number }> {
  const retriedCount = await withWritableDatabase((adapter, database) => {
    if (ids.length === 0) {
      return 0;
    }

    adapter.exec(database, "BEGIN");
    try {
      const select = adapter.prepare(database, "SELECT * FROM connector_dead_letters WHERE id = ?");
      const insert = adapter.prepare(
        database,
        "INSERT OR REPLACE INTO connector_jobs (id, connector_type, connector_target, operation, payload_json, attempt_count, max_attempts, next_attempt_at, state, last_error, created_at, updated_at, claimed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      const remove = adapter.prepare(database, "DELETE FROM connector_dead_letters WHERE id = ?");
      let count = 0;
      const now = Date.now();

      for (const id of ids) {
        const row = adapter.all(select, [id])[0];
        if (!row) {
          continue;
        }

        adapter.run(insert, [
          row.id,
          row.connector_type,
          row.connector_target ?? null,
          row.operation,
          row.payload_json,
          0,
          row.max_attempts,
          now,
          "pending",
          null,
          row.first_enqueued_at,
          now,
          null,
        ]);
        adapter.run(remove, [id]);
        count += 1;
      }

      adapter.exec(database, "COMMIT");
      return count;
    } catch (error) {
      adapter.exec(database, "ROLLBACK");
      throw error;
    }
  });

  return { retriedCount };
}

export async function clearStudioDeadLetters(ids: string[]): Promise<{ clearedCount: number }> {
  const clearedCount = await withWritableDatabase((adapter, database) => {
    if (ids.length === 0) {
      return 0;
    }

    adapter.exec(database, "BEGIN");
    try {
      const select = adapter.prepare(database, "SELECT id FROM connector_dead_letters WHERE id = ?");
      const remove = adapter.prepare(database, "DELETE FROM connector_dead_letters WHERE id = ?");
      let count = 0;

      for (const id of ids) {
        const row = adapter.all(select, [id])[0];
        if (!row) {
          continue;
        }
        adapter.run(remove, [id]);
        count += 1;
      }

      adapter.exec(database, "COMMIT");
      return count;
    } catch (error) {
      adapter.exec(database, "ROLLBACK");
      throw error;
    }
  });

  return { clearedCount };
}

async function withWritableDatabase<TResult>(
  callback: (adapter: SqliteAdapter, database: DatabaseInstance) => TResult | Promise<TResult>,
): Promise<TResult> {
  const queuePath = getStudioQueuePath();
  const adapter = await loadSqliteAdapter();
  const database = adapter.create(queuePath);

  try {
    return await callback(adapter, database);
  } finally {
    adapter.close(database);
  }
}

function listStatusRows(adapter: SqliteAdapter, database: DatabaseInstance): QueueStatusRow[] {
  const statusRows = adapter.all(
    adapter.prepare(
      database,
      "SELECT connector_type, connector_target, last_success_at, last_failure_at, last_error FROM connector_delivery_status",
    ),
    [],
  );
  const rows = new Map<string, QueueStatusRow>();

  for (const row of statusRows) {
    rows.set(buildConnectorKey(row.connector_type, row.connector_target ?? null), {
      connectorType: row.connector_type,
      connectorTarget: row.connector_target ?? null,
      pendingCount: 0,
      deadLetterCount: 0,
      lastSuccessAt: toNullableNumber(row.last_success_at),
      lastFailureAt: toNullableNumber(row.last_failure_at),
      lastError: typeof row.last_error === "string" ? row.last_error : null,
    });
  }

  for (const row of adapter.all(
    adapter.prepare(
      database,
      "SELECT connector_type, connector_target, COUNT(*) AS count FROM connector_jobs WHERE state = ? GROUP BY connector_type, connector_target",
    ),
    ["pending"],
  )) {
    const key = buildConnectorKey(row.connector_type, row.connector_target ?? null);
    const current = rows.get(key) ?? {
      connectorType: row.connector_type,
      connectorTarget: row.connector_target ?? null,
      pendingCount: 0,
      deadLetterCount: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
    };
    current.pendingCount = Number(row.count ?? 0);
    rows.set(key, current);
  }

  for (const row of adapter.all(
    adapter.prepare(
      database,
      "SELECT connector_type, connector_target, COUNT(*) AS count FROM connector_dead_letters GROUP BY connector_type, connector_target",
    ),
    [],
  )) {
    const key = buildConnectorKey(row.connector_type, row.connector_target ?? null);
    const current = rows.get(key) ?? {
      connectorType: row.connector_type,
      connectorTarget: row.connector_target ?? null,
      pendingCount: 0,
      deadLetterCount: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
    };
    current.deadLetterCount = Number(row.count ?? 0);
    rows.set(key, current);
  }

  return [...rows.values()];
}

function listDeadLetterRows(
  adapter: SqliteAdapter,
  database: DatabaseInstance,
  input: { limit?: number; offset?: number; connectorKey?: string },
): { items: QueueDeadLetterRow[]; total: number } {
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  const connectorFilter = parseConnectorKey(input.connectorKey);
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (connectorFilter) {
    clauses.push("connector_type = ?");
    params.push(connectorFilter.connectorType);
    if (connectorFilter.connectorTarget === null) {
      clauses.push("connector_target IS NULL");
    } else {
      clauses.push("connector_target = ?");
      params.push(connectorFilter.connectorTarget);
    }
  }

  const whereSql = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  const total = Number(
    adapter.all(
      adapter.prepare(
        database,
        `SELECT COUNT(*) AS count FROM connector_dead_letters${whereSql}`,
      ),
      params,
    )[0]?.count ?? 0,
  );
  const items = adapter.all(
    adapter.prepare(
      database,
      `SELECT id, connector_type, connector_target, payload_json, attempt_count, max_attempts, last_error, dead_lettered_at FROM connector_dead_letters${whereSql} ORDER BY dead_lettered_at DESC LIMIT ? OFFSET ?`,
    ),
    [...params, limit, offset],
  );

  return {
    items: items.map((row) => ({
      id: row.id,
      connectorType: row.connector_type,
      connectorTarget: row.connector_target ?? null,
      payloadJson: row.payload_json,
      attemptCount: Number(row.attempt_count ?? 0),
      maxAttempts: Number(row.max_attempts ?? 0),
      lastError: typeof row.last_error === "string" ? row.last_error : null,
      deadLetteredAt: Number(row.dead_lettered_at ?? 0),
    })),
    total,
  };
}

function getConfiguredConnectors(
  connectors: StudioResolvedConnectorsSummary,
): StudioConnectorDeliveryStatus[] {
  const items: StudioConnectorDeliveryStatus[] = [];

  if (connectors.betterstack.enabled) {
    items.push(createConfiguredConnector("betterstack", null, "Better Stack"));
  }
  if (connectors.databuddy.enabled) {
    items.push(createConfiguredConnector("databuddy", null, "Databuddy"));
  }
  if (connectors.posthog.enabled) {
    items.push(createConfiguredConnector("posthog", null, "PostHog"));
  }
  if (connectors.sentry.enabled) {
    items.push(createConfiguredConnector("sentry", null, "Sentry"));
  }
  for (const connector of connectors.otlp) {
    if (!connector.enabled) {
      continue;
    }
    items.push(createConfiguredConnector("otlp", connector.name, `OTLP ${connector.name}`));
  }

  return items;
}

function createConfiguredConnector(
  connectorType: string,
  connectorTarget: string | null,
  label: string,
): StudioConnectorDeliveryStatus {
  return {
    key: buildConnectorKey(connectorType, connectorTarget),
    connectorType,
    connectorTarget,
    label,
    enabled: true,
    health: "healthy",
    pendingCount: 0,
    deadLetterCount: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
  };
}

function buildUnknownConnector(
  key: string,
  row: QueueStatusRow,
): StudioConnectorDeliveryStatus {
  return {
    key,
    connectorType: row.connectorType,
    connectorTarget: row.connectorTarget,
    label: formatConnectorLabel(row.connectorType, row.connectorTarget),
    enabled: false,
    health: "inactive",
    pendingCount: 0,
    deadLetterCount: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
  };
}

function mergeConnectorStatus(
  connector: StudioConnectorDeliveryStatus,
  row: QueueStatusRow | undefined,
): StudioConnectorDeliveryStatus {
  const pendingCount = row?.pendingCount ?? 0;
  const deadLetterCount = row?.deadLetterCount ?? 0;
  const lastSuccessAt = toIso(row?.lastSuccessAt ?? null);
  const lastFailureAt = toIso(row?.lastFailureAt ?? null);
  const lastError = row?.lastError ?? null;

  return {
    ...connector,
    pendingCount,
    deadLetterCount,
    lastSuccessAt,
    lastFailureAt,
    lastError,
    health: getConnectorHealth({
      enabled: connector.enabled,
      pendingCount,
      deadLetterCount,
      lastSuccessAt,
      lastFailureAt,
    }),
  };
}

function getConnectorHealth(input: {
  enabled: boolean;
  pendingCount: number;
  deadLetterCount: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
}): StudioConnectorHealth {
  if (input.deadLetterCount > 0) {
    return "dead-lettered";
  }
  if (input.pendingCount > 0) {
    return "retrying";
  }
  if (!input.enabled) {
    return "inactive";
  }
  if (
    input.lastFailureAt &&
    (!input.lastSuccessAt || new Date(input.lastFailureAt).getTime() > new Date(input.lastSuccessAt).getTime())
  ) {
    return "retrying";
  }
  return "healthy";
}

function toDeadLetterRecord(
  row: QueueDeadLetterRow,
  connector: StudioConnectorDeliveryStatus | undefined,
): StudioDeadLetterRecord {
  const connectorKey = buildConnectorKey(row.connectorType, row.connectorTarget);

  return {
    id: row.id,
    timestamp: new Date(row.deadLetteredAt).toISOString(),
    connectorKey,
    connectorLabel: connector?.label ?? formatConnectorLabel(row.connectorType, row.connectorTarget),
    connectorType: row.connectorType,
    connectorTarget: row.connectorTarget,
    payloadPreview: buildPayloadPreview(row.payloadJson),
    lastError: row.lastError,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
  };
}

function buildPayloadPreview(payloadJson: string): string {
  try {
    const parsed = JSON.parse(payloadJson) as {
      record?: { message?: unknown };
    };
    const message = parsed.record?.message;
    if (typeof message === "string" && message.trim().length > 0) {
      return truncatePreview(message.trim());
    }

    return truncatePreview(JSON.stringify(parsed));
  } catch {
    return truncatePreview(payloadJson);
  }
}

function truncatePreview(value: string): string {
  return value.length <= 160 ? value : `${value.slice(0, 157)}...`;
}

function formatConnectorLabel(connectorType: string, connectorTarget: string | null): string {
  switch (connectorType) {
    case "betterstack":
      return "Better Stack";
    case "databuddy":
      return "Databuddy";
    case "posthog":
      return "PostHog";
    case "sentry":
      return "Sentry";
    case "otlp":
      return connectorTarget ? `OTLP ${connectorTarget}` : "OTLP";
    default:
      return connectorTarget ? `${connectorType}:${connectorTarget}` : connectorType;
  }
}

function buildConnectorKey(connectorType: string, connectorTarget: string | null): string {
  return connectorType === "otlp" && connectorTarget
    ? `otlp:${connectorTarget}`
    : connectorType;
}

function parseConnectorKey(
  connectorKey: string | undefined,
): { connectorType: string; connectorTarget: string | null } | null {
  if (!connectorKey) {
    return null;
  }

  if (connectorKey.startsWith("otlp:")) {
    return {
      connectorType: "otlp",
      connectorTarget: connectorKey.slice("otlp:".length) || null,
    };
  }

  return { connectorType: connectorKey, connectorTarget: null };
}

function toIso(value: number | null): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value).toISOString()
    : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

async function loadSqliteAdapter(): Promise<SqliteAdapter> {
  try {
    const bunSqliteModule = "bun:sqlite";
    const mod = await import(bunSqliteModule);
    const Database = mod.default;
    return {
      create(filePath) {
        return new Database(filePath);
      },
      prepare(instance, sql) {
        return (instance as { prepare(sql: string): StatementInstance }).prepare(sql);
      },
      all(statement, params) {
        return (statement as { all(...params: unknown[]): any[] }).all(...params);
      },
      run(statement, params) {
        (statement as { run(...params: unknown[]): void }).run(...params);
      },
      exec(instance, sql) {
        (instance as { exec(sql: string): void }).exec(sql);
      },
      close(instance) {
        (instance as { close(): void }).close();
      },
    };
  } catch {}

  const mod = await import("node:sqlite");
  return {
    create(filePath) {
      return new mod.DatabaseSync(filePath);
    },
    prepare(instance, sql) {
      return (instance as { prepare(sql: string): StatementInstance }).prepare(sql);
    },
    all(statement, params) {
      return (statement as { all(...params: unknown[]): any[] }).all(...params);
    },
    run(statement, params) {
      (statement as { run(...params: unknown[]): void }).run(...params);
    },
    exec(instance, sql) {
      (instance as { exec(sql: string): void }).exec(sql);
    },
    close(instance) {
      (instance as { close(): void }).close();
    },
  };
}
