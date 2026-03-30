import { matchesDetectedSection } from "./sections";

import type {
  StudioCustomSectionDefinition,
  StudioNormalizedRecord,
  StudioPaymentAmount,
  StudioPaymentFailureBreakdownRow,
  StudioPaymentTraceDetail,
  StudioPaymentTraceEvent,
  StudioPaymentTraceField,
  StudioPaymentTraceSummary,
  StudioPaymentsOverview,
  StudioPaymentsQueryInput,
  StudioPaymentsStats,
  StudioPaymentTraceStatus,
  StudioPaymentWebhookEvent,
} from "./types";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const IDLE_GAP_MS = 120_000;
const WEBHOOK_GRACE_MS = 10 * 60_000;
const PAYMENT_SECRET_KEY_PATTERN =
  /(cvv|cvc|securitycode|cardnumber|paymentmethoddetails\.card|^card$|^number$|^pan$|expmonth|expyear|expiry)/i;
const PAN_LIKE_PATTERN = /\b\d{12,19}\b/;

type PaymentStage =
  | "checkout-started"
  | "checkout-http"
  | "payment-processing"
  | "payment-succeeded"
  | "payment-declined"
  | "payment-error"
  | "refund"
  | "subscription"
  | "webhook-received"
  | "webhook-processed"
  | "order-created"
  | "other";

interface CandidateEvent {
  record: StudioNormalizedRecord;
  primaryTraceId: string | null;
  correlationKeys: string[];
  correlationLabel: string | null;
  userId: string | null;
  amount: StudioPaymentAmount | null;
  routeFamily: string | null;
  route: string | null;
  stage: PaymentStage;
  failureReason: string | null;
  statusHint: StudioPaymentTraceStatus | null;
  eventKind: StudioPaymentTraceEvent["kind"];
  webhookEventType: string | null;
  webhookResult: StudioPaymentWebhookEvent["result"] | null;
  webhookPreview: string | null;
  displayFields: StudioPaymentTraceField[];
  startedLike: boolean;
  terminalLike: boolean;
  isWebhook: boolean;
}

interface TraceBucket {
  id: string;
  label: string;
  userId: string | null;
  events: CandidateEvent[];
  correlationSignals: string[];
}

interface AnalysisResult {
  traces: StudioPaymentTraceSummary[];
  traceDetails: Map<string, StudioPaymentTraceDetail>;
  failures: StudioPaymentFailureBreakdownRow[];
  webhooks: StudioPaymentWebhookEvent[];
  stats: StudioPaymentsStats;
}

export function buildPaymentsOverview(input: {
  records: StudioNormalizedRecord[];
  query: StudioPaymentsQueryInput;
  customSections?: StudioCustomSectionDefinition[];
  truncated?: boolean;
}): StudioPaymentsOverview {
  const analysis = analyzePaymentRecords(input.records, input.customSections ?? []);
  const limit = clampLimit(input.query.limit);
  const offset = Math.max(0, input.query.offset ?? 0);

  return {
    stats: analysis.stats,
    traces: analysis.traces.slice(offset, offset + limit),
    failures: analysis.failures,
    webhooks: analysis.webhooks,
    totalTraces: analysis.traces.length,
    offset,
    limit,
    truncated: input.truncated ?? false,
  };
}

export function buildPaymentTraceDetail(input: {
  traceId: string;
  records: StudioNormalizedRecord[];
  customSections?: StudioCustomSectionDefinition[];
}): StudioPaymentTraceDetail | null {
  const analysis = analyzePaymentRecords(input.records, input.customSections ?? []);
  return analysis.traceDetails.get(input.traceId) ?? null;
}

export function analyzePaymentRecords(
  records: StudioNormalizedRecord[],
  customSections: StudioCustomSectionDefinition[] = [],
): AnalysisResult {
  const candidates = records
    .filter((record) => matchesDetectedSection(record, "payments", customSections))
    .map(toCandidateEvent)
    .filter((event): event is CandidateEvent => event !== null)
    .sort(compareEventsAscending);

  const traceBuckets = buildTraceBuckets(candidates);
  const traceDetails = new Map<string, StudioPaymentTraceDetail>();

  for (const bucket of traceBuckets) {
    const detail = summarizeTrace(bucket);
    traceDetails.set(detail.trace.id, detail);
  }

  const traces = Array.from(traceDetails.values())
    .map((detail) => detail.trace)
    .sort(compareTracesDescending);
  const webhooks = buildWebhookRows(traceBuckets);
  const failures = buildFailureBreakdown(traces, traceBuckets);
  const stats = buildStats(traces, webhooks);

  return {
    traces,
    traceDetails,
    failures,
    webhooks,
    stats,
  };
}

function toCandidateEvent(record: StudioNormalizedRecord): CandidateEvent | null {
  const message = `${record.message} ${serialize(record.data)} ${serialize(record.bindings)}`.toLowerCase();
  const route = record.http?.path ?? record.http?.url ?? getString(record, ["path", "url", "route", "request.path"]);
  const routeFamily = inferRouteFamily(route);
  const traceId =
    getString(record, ["traceId", "trace_id", "trace.id", "payment.traceId"]) ?? null;
  const userId =
    getString(record, ["user.id", "userId", "customer.id", "payment.userId", "checkout.userId"]) ?? null;
  const correlationPairs = [
    ["checkout.id", getString(record, ["checkout.id", "checkoutId"])],
    ["checkout.sessionId", getString(record, ["checkout.sessionId", "checkout.session_id"])],
    ["payment.id", getString(record, ["payment.id", "paymentId"])],
    ["payment.intentId", getString(record, ["payment.intentId", "payment_intent", "stripe.payment_intent.id"])],
    ["sessionId", getString(record, ["sessionId", "session.id"])],
    ["requestId", getString(record, ["requestId", "request.id"])],
    ["correlationId", getString(record, ["correlationId"])],
    ["order.id", getString(record, ["order.id", "orderId"])],
    ["invoice.id", getString(record, ["invoice.id", "invoiceId"])],
    ["subscription.id", getString(record, ["subscription.id", "subscriptionId"])],
  ].filter((item): item is [string, string] => Boolean(item[1]));
  const correlationKeys = correlationPairs.map(([key, value]) => `${key}:${value}`);
  const amount = readAmount(record);
  const paymentStatus =
    getString(record, [
      "payment.status",
      "stripe.payment_intent.status",
      "invoice.status",
      "subscription.status",
      "status",
      "state",
    ]) ?? null;
  const stripeErrorCode =
    getString(record, ["stripe.error.code", "error.code", "payment.error.code"]) ?? null;
  const failureReason = normalizeFailureReason(record, paymentStatus, stripeErrorCode);
  const stage = inferStage(record, message, routeFamily, paymentStatus, failureReason);
  const isWebhook = routeFamily === "webhook" || message.includes("webhook") || hasField(record, "webhook.");
  const webhookEventType =
    getString(record, ["webhook.type", "stripe.event.type", "event.type", "type"]) ?? null;
  const webhookResult: StudioPaymentWebhookEvent["result"] | null = isWebhook
    ? inferWebhookResult(record, message)
    : null;
  const statusHint = inferStatusHint(record, message, paymentStatus, failureReason, stage);
  const displayFields = buildDisplayFields(record, amount, paymentStatus, stripeErrorCode, webhookEventType, userId);

  if (
    !traceId &&
    correlationKeys.length === 0 &&
    !routeFamily &&
    !message.includes("payment") &&
    !message.includes("checkout") &&
    !message.includes("invoice") &&
    !message.includes("subscription") &&
    !message.includes("refund")
  ) {
    return null;
  }

  return {
    record,
    primaryTraceId: traceId,
    correlationKeys,
    correlationLabel: traceId ?? correlationPairs[0]?.[1] ?? routeFamily ?? "payment-trace",
    userId,
    amount,
    routeFamily,
    route,
    stage,
    failureReason,
    statusHint,
    eventKind: inferEventKind(record, isWebhook),
    webhookEventType,
    webhookResult,
    webhookPreview: isWebhook ? buildPayloadPreview(record) : null,
    displayFields,
    startedLike: stage === "checkout-started",
    terminalLike: stage === "payment-succeeded" || stage === "payment-declined" || stage === "payment-error" || stage === "order-created",
    isWebhook,
  };
}

function buildTraceBuckets(events: CandidateEvent[]): TraceBucket[] {
  const explicit = new Map<string, TraceBucket>();
  const keyed = new Map<string, TraceBucket>();
  const inferredBySignature = new Map<string, TraceBucket[]>();

  for (const event of events) {
    if (event.primaryTraceId) {
      const traceId = `payment:trace:${event.primaryTraceId}`;
      const bucket = ensureBucket(explicit, traceId, event);
      bucket.events.push(event);
      addSignals(bucket, event);
      for (const key of event.correlationKeys) {
        keyed.set(key, bucket);
      }
      continue;
    }

    let matched: TraceBucket | null = null;
    for (const key of event.correlationKeys) {
      const candidate = keyed.get(key);
      if (candidate && canAttachToBucket(candidate, event)) {
        matched = candidate;
        break;
      }
    }

    if (!matched) {
      const signature = buildHeuristicSignature(event);
      const candidates = inferredBySignature.get(signature) ?? [];
      matched = candidates.find((candidate) => canAttachToBucket(candidate, event)) ?? null;
      if (!matched) {
        matched = {
          id: `payment:${signature}:${event.record.id}`,
          label: event.correlationLabel ?? signature,
          userId: event.userId,
          events: [],
          correlationSignals: [],
        };
        candidates.push(matched);
        inferredBySignature.set(signature, candidates);
      }
    }

    matched.events.push(event);
    addSignals(matched, event);
    for (const key of event.correlationKeys) {
      keyed.set(key, matched);
    }
  }

  return [
    ...Array.from(explicit.values()),
    ...Array.from(inferredBySignature.values()).flat(),
  ].map((bucket) => ({
    ...bucket,
    events: bucket.events.slice().sort(compareEventsAscending),
    correlationSignals: Array.from(new Set(bucket.correlationSignals)),
  }));
}

function summarizeTrace(bucket: TraceBucket): StudioPaymentTraceDetail {
  const events = bucket.events.slice().sort(compareEventsAscending);
  const startedAt = events[0]?.record.timestamp ?? null;
  const finishedAt = events.at(-1)?.record.timestamp ?? null;
  const amount =
    events
      .map((event) => event.amount)
      .find((value): value is StudioPaymentAmount => value !== null) ?? null;
  const failureReason =
    events
      .slice()
      .reverse()
      .map((event) => event.failureReason)
      .find((value): value is string => Boolean(value)) ?? null;
  const webhookEvents = events.filter((event) => event.isWebhook);
  const status = deriveTraceStatus(events, failureReason);
  const summary: StudioPaymentTraceSummary = {
    id: bucket.id,
    correlationLabel: bucket.label,
    userId:
      events.map((event) => event.userId).find((value): value is string => Boolean(value)) ?? bucket.userId,
    amount,
    durationMs: computeDuration(startedAt, finishedAt),
    status,
    startedAt,
    finishedAt,
    recordCount: events.length,
    failureReason,
    webhookEventCount: webhookEvents.length,
    representativeRecordId: events.at(-1)?.record.id ?? events[0]?.record.id ?? null,
  };

  return {
    trace: summary,
    timeline: events.map((event) => toTimelineEvent(event, startedAt, status)),
    webhooks: webhookEvents.map((event) => toWebhookRow(event, bucket.id)),
    correlationSignals: bucket.correlationSignals.map((signal) => ({
      key: signal.split(":")[0] ?? "signal",
      value: signal.slice(signal.indexOf(":") + 1),
    })),
  };
}

function buildWebhookRows(buckets: TraceBucket[]): StudioPaymentWebhookEvent[] {
  return buckets
    .flatMap((bucket) =>
      bucket.events
        .filter((event) => event.isWebhook)
        .map((event) => toWebhookRow(event, bucket.id)),
    )
    .sort((left, right) => compareTimestampsDescending(left.timestamp, right.timestamp));
}

function buildFailureBreakdown(
  traces: StudioPaymentTraceSummary[],
  buckets: TraceBucket[],
): StudioPaymentFailureBreakdownRow[] {
  const byTraceId = new Map(buckets.map((bucket) => [bucket.id, bucket] as const));
  const rows = new Map<string, StudioPaymentFailureBreakdownRow>();

  for (const trace of traces) {
    if (trace.status !== "DECLINED" && trace.status !== "ERROR") {
      continue;
    }

    const reason = trace.failureReason ?? "Unknown payment failure";
    const existing = rows.get(reason);
    const userId = trace.userId;
    const nextRecent = maxTimestamp(existing?.mostRecentAt ?? null, trace.finishedAt ?? trace.startedAt);

    if (existing) {
      existing.count += 1;
      existing.mostRecentAt = nextRecent;
      if (userId && !existing.affectedUserIds.includes(userId)) {
        existing.affectedUserIds.push(userId);
      }
      continue;
    }

    rows.set(reason, {
      reason,
      count: 1,
      mostRecentAt: nextRecent,
      affectedUserIds: userId ? [userId] : [],
    });

    const bucket = byTraceId.get(trace.id);
    if (bucket && !userId) {
      rows.get(reason)!.affectedUserIds = Array.from(
        new Set(
          bucket.events
            .map((event) => event.userId)
            .filter((value): value is string => Boolean(value)),
        ),
      );
    }
  }

  return Array.from(rows.values()).sort((left, right) => {
    if (left.count !== right.count) {
      return right.count - left.count;
    }
    return compareTimestampsDescending(left.mostRecentAt, right.mostRecentAt);
  });
}

function buildStats(
  traces: StudioPaymentTraceSummary[],
  webhooks: StudioPaymentWebhookEvent[],
): StudioPaymentsStats {
  const checkoutAttempts = traces.length;
  const completed = traces.filter((trace) => trace.status === "COMPLETED").length;
  const failed = traces.filter((trace) => trace.status === "DECLINED" || trace.status === "ERROR");
  const successRate = checkoutAttempts > 0 ? completed / checkoutAttempts : 0;
  const mostCommonFailureReason = buildFailureBreakdown(traces, [])[0]?.reason ?? null;
  const successfulAmounts = traces
    .filter((trace) => trace.status === "COMPLETED" && trace.amount)
    .map((trace) => trace.amount!);
  const revenueProcessed = sumAmounts(successfulAmounts);

  return {
    checkoutAttempts,
    successRate,
    successRateTrend: "flat",
    successRateDeltaPercent: null,
    successRateComparisonWindowLabel: "vs previous session window",
    failedPayments: failed.length,
    mostCommonFailureReason,
    revenueProcessed,
    currency: revenueProcessed?.currency ?? null,
    webhookEvents: webhooks.length,
  };
}

function sumAmounts(amounts: StudioPaymentAmount[]): StudioPaymentAmount | null {
  if (amounts.length === 0) {
    return null;
  }

  const currencies = new Set(amounts.map((amount) => amount.currency ?? null));
  if (currencies.size > 1) {
    return null;
  }

  const currency = amounts[0]?.currency ?? null;
  const value = amounts.reduce((sum, amount) => sum + amount.value, 0);
  return toAmount(value, currency, true);
}

function toTimelineEvent(
  event: CandidateEvent,
  startedAt: string | null,
  traceStatus: StudioPaymentTraceStatus,
): StudioPaymentTraceEvent {
  return {
    id: `${event.record.id}:${event.stage}`,
    recordId: event.record.id,
    timestamp: event.record.timestamp,
    offsetMs: computeOffsetMs(startedAt, event.record.timestamp),
    level: event.record.level,
    message: event.record.message,
    kind: event.eventKind,
    status: event.statusHint ?? (event.terminalLike ? traceStatus : null),
    route: event.route,
    durationMs: event.record.http?.durationMs ?? null,
    fields: event.displayFields,
  };
}

function toWebhookRow(event: CandidateEvent, traceId: string): StudioPaymentWebhookEvent {
  return {
    id: `${event.record.id}:webhook`,
    recordId: event.record.id,
    timestamp: event.record.timestamp,
    eventType: event.webhookEventType,
    route: event.route,
    result: event.webhookResult ?? "success",
    traceId,
    payloadPreview: event.webhookPreview,
  };
}

function canAttachToBucket(bucket: TraceBucket, event: CandidateEvent): boolean {
  const previous = bucket.events.at(-1) ?? null;
  if (!previous) {
    return true;
  }

  const conflictingSignals = event.correlationKeys.some((key) => {
    const [prefix, value] = splitSignal(key);
    return bucket.correlationSignals.some((signal) => {
      const [existingPrefix, existingValue] = splitSignal(signal);
      return prefix === existingPrefix && value !== existingValue;
    });
  });
  if (conflictingSignals) {
    return false;
  }

  if (previous.terminalLike && event.startedLike) {
    return false;
  }

  const previousTime = parseTimestamp(previous.record.timestamp);
  const currentTime = parseTimestamp(event.record.timestamp);
  if (Number.isFinite(previousTime) && Number.isFinite(currentTime)) {
    const gap = currentTime - previousTime;
    if (event.isWebhook) {
      return gap <= WEBHOOK_GRACE_MS;
    }
    if (gap > IDLE_GAP_MS) {
      return false;
    }
  }

  if (bucket.userId && event.userId && bucket.userId !== event.userId) {
    return false;
  }

  return true;
}

function buildHeuristicSignature(event: CandidateEvent): string {
  return [
    event.userId ?? "anon",
    event.routeFamily ?? "payment",
    event.amount?.currency ?? "currency",
  ].join(":");
}

function ensureBucket(map: Map<string, TraceBucket>, id: string, event: CandidateEvent): TraceBucket {
  const existing = map.get(id);
  if (existing) {
    return existing;
  }

  const created: TraceBucket = {
    id,
    label: event.correlationLabel ?? id,
    userId: event.userId,
    events: [],
    correlationSignals: [],
  };
  map.set(id, created);
  return created;
}

function addSignals(bucket: TraceBucket, event: CandidateEvent) {
  if (event.primaryTraceId) {
    bucket.correlationSignals.push(`traceId:${event.primaryTraceId}`);
  }
  bucket.correlationSignals.push(...event.correlationKeys);
}

function inferStage(
  record: StudioNormalizedRecord,
  message: string,
  routeFamily: string | null,
  paymentStatus: string | null,
  failureReason: string | null,
): PaymentStage {
  if (routeFamily === "webhook" || message.includes("webhook")) {
    if (failureReason || record.level === "error") {
      return "webhook-processed";
    }
    return "webhook-received";
  }
  if (message.includes("checkout started") || message.includes("checkout start")) return "checkout-started";
  if (routeFamily === "checkout" && record.http) return "checkout-http";
  if (message.includes("order created") || hasField(record, "order.")) return "order-created";
  if (message.includes("refund")) return "refund";
  if (message.includes("subscription")) return "subscription";
  if (paymentStatus && /(processing|authorized|requires_action|pending)/i.test(paymentStatus)) return "payment-processing";
  if (paymentStatus && /(succeeded|paid|completed|success)/i.test(paymentStatus)) return "payment-succeeded";
  if (failureReason && /declined|funds|expired|incorrect|blocked/i.test(failureReason)) return "payment-declined";
  if (failureReason || record.level === "error") return "payment-error";
  return "other";
}

function inferStatusHint(
  record: StudioNormalizedRecord,
  message: string,
  paymentStatus: string | null,
  failureReason: string | null,
  stage: PaymentStage,
): StudioPaymentTraceStatus | null {
  const statusCode = record.http?.statusCode ?? getNumber(record, ["statusCode", "status"]);
  if (
    stage === "payment-declined" ||
    (typeof statusCode === "number" && statusCode === 402 && (message.includes("payment") || message.includes("checkout"))) ||
    Boolean(failureReason && /declined|funds|expired|incorrect|blocked/i.test(failureReason))
  ) {
    return "DECLINED";
  }
  if (stage === "payment-error" || (stage === "webhook-processed" && record.level === "error")) {
    return "ERROR";
  }
  if (stage === "payment-succeeded" || stage === "order-created") {
    return "COMPLETED";
  }
  if (paymentStatus && /(processing|authorized|pending)/i.test(paymentStatus)) {
    return "PENDING";
  }
  return null;
}

function deriveTraceStatus(
  events: CandidateEvent[],
  failureReason: string | null,
): StudioPaymentTraceStatus {
  if (events.some((event) => event.statusHint === "DECLINED")) return "DECLINED";
  if (events.some((event) => event.statusHint === "ERROR")) return "ERROR";
  if (events.some((event) => event.statusHint === "COMPLETED")) return "COMPLETED";
  if (events.some((event) => event.statusHint === "PENDING")) return "PENDING";
  if (failureReason) return "ERROR";
  return "PENDING";
}

function inferWebhookResult(
  record: StudioNormalizedRecord,
  message: string,
): StudioPaymentWebhookEvent["result"] {
  if (record.level === "error" || /failed|error/.test(message)) {
    return "error";
  }
  return "success";
}

function inferEventKind(
  record: StudioNormalizedRecord,
  isWebhook: boolean,
): StudioPaymentTraceEvent["kind"] {
  if (isWebhook) return "WEBHOOK";
  if (record.level === "error") return "ERROR";
  if (record.http) return "HTTP";
  if (record.source === "structured") return "STRUCT";
  return "INFO";
}

function buildDisplayFields(
  record: StudioNormalizedRecord,
  amount: StudioPaymentAmount | null,
  paymentStatus: string | null,
  stripeErrorCode: string | null,
  webhookEventType: string | null,
  userId: string | null,
): StudioPaymentTraceField[] {
  const fields: StudioPaymentTraceField[] = [];

  if (userId) fields.push({ key: "user.id", value: userId });
  if (amount) fields.push({ key: "amount", value: amount.display });
  if (paymentStatus) fields.push({ key: "payment.status", value: paymentStatus });
  if (stripeErrorCode) fields.push({ key: "stripe.error", value: stripeErrorCode });
  if (record.http?.statusCode) fields.push({ key: "http.status", value: String(record.http.statusCode) });
  if (record.http?.method && (record.http.path ?? record.http.url)) {
    fields.push({
      key: "http",
      value: [record.http.method, record.http.path ?? record.http.url].filter(Boolean).join(" "),
    });
  }
  if (record.http?.durationMs != null) fields.push({ key: "duration", value: `${Math.round(record.http.durationMs)}ms` });
  if (webhookEventType) fields.push({ key: "webhook.type", value: webhookEventType });

  return fields.slice(0, 6);
}

function readAmount(record: StudioNormalizedRecord): StudioPaymentAmount | null {
  const amount =
    getNumber(record, [
      "payment.amount",
      "payment.amount_total",
      "cart.total",
      "amount",
      "amount_total",
      "invoice.amount_paid",
    ]) ?? null;
  if (amount === null) {
    return null;
  }

  const currency =
    getString(record, ["payment.currency", "currency", "invoice.currency", "cart.currency"]) ?? null;
  return toAmount(amount, currency, true);
}

function toAmount(value: number, currency: string | null, inferredMinorUnits: boolean): StudioPaymentAmount {
  const majorValue = inferredMinorUnits ? value / 100 : value;
  const display = currency
    ? new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency.toUpperCase(),
      }).format(majorValue)
    : inferredMinorUnits
      ? `${majorValue.toFixed(2)}`
      : String(value);

  return {
    value,
    currency: currency ? currency.toUpperCase() : null,
    display,
    inferredMinorUnits,
  };
}

function buildPayloadPreview(record: StudioNormalizedRecord): string | null {
  const payload =
    sanitizePaymentPreview(getNestedValue(record.raw, "data")) ??
    sanitizePaymentPreview(record.data) ??
    sanitizePaymentPreview(record.raw);

  if (payload == null) {
    return null;
  }

  const serialized = serialize(payload);
  return serialized.length > 400 ? `${serialized.slice(0, 397)}...` : serialized;
}

function sanitizePaymentPreview(value: unknown): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return PAN_LIKE_PATTERN.test(value) ? "[redacted]" : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePaymentPreview(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (PAYMENT_SECRET_KEY_PATTERN.test(key)) {
      next[key] = "[redacted]";
      continue;
    }
    next[key] = sanitizePaymentPreview(nested);
  }
  return next;
}

function normalizeFailureReason(
  record: StudioNormalizedRecord,
  paymentStatus: string | null,
  stripeErrorCode: string | null,
): string | null {
  const candidates = [
    stripeErrorCode,
    paymentStatus,
    getString(record, ["invoice.status", "error.code", "error.message", "payment.error.message"]),
    record.message,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const value = candidate.toLowerCase();
    if (value.includes("card_declined") || value.includes("declined")) return "Card declined";
    if (value.includes("insufficient_funds")) return "Insufficient funds";
    if (value.includes("expired")) return "Card expired";
    if (value.includes("incorrect_cvc") || value.includes("cvc")) return "Incorrect CVC";
    if (value.includes("payment_failed") || value.includes("failed")) return "Payment failed";
  }

  return null;
}

function inferRouteFamily(route: string | null): string | null {
  if (!route) return null;
  if (/\/webhooks?(?:\/|$)/.test(route)) return "webhook";
  if (route.includes("/checkout")) return "checkout";
  if (route.includes("/payment")) return "payment";
  if (route.includes("/billing")) return "billing";
  if (route.includes("/order")) return "order";
  if (route.includes("/subscribe")) return "subscribe";
  return null;
}

function hasField(record: StudioNormalizedRecord, prefix: string): boolean {
  return Boolean(
    getString(record, [prefix.replace(/\.$/, "")]) ??
      searchObjectForPrefix(record.data, prefix) ??
      searchObjectForPrefix(record.bindings, prefix) ??
      searchObjectForPrefix(record.raw, prefix),
  );
}

function searchObjectForPrefix(value: unknown, prefix: string): string | null {
  if (!isPlainObject(value)) return null;
  return Object.keys(value).some((key) => key.startsWith(prefix.replace(/\.$/, ""))) ? prefix : null;
}

function getString(record: StudioNormalizedRecord, paths: string[]): string | null {
  for (const path of paths) {
    const value = getNestedValue(record, path);
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function getNumber(record: StudioNormalizedRecord, paths: string[]): number | null {
  for (const path of paths) {
    const value = getNestedValue(record, path);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function getNestedValue(source: unknown, path: string): unknown {
  if (!path.includes(".")) {
    if (isPlainObject(source) && path in source) {
      return source[path];
    }
    if (isPlainObject(source) && "data" in source) {
      const nested = getNestedValue(source.data, path);
      if (nested !== undefined) return nested;
    }
    if (isPlainObject(source) && "bindings" in source) {
      const nested = getNestedValue(source.bindings, path);
      if (nested !== undefined) return nested;
    }
    if (isPlainObject(source) && "raw" in source) {
      const nested = getNestedValue(source.raw, path);
      if (nested !== undefined) return nested;
    }
  }

  const segments = path.split(".");
  const roots = isPlainObject(source)
    ? [source, source.data, source.bindings, source.raw]
    : [source];

  for (const root of roots) {
    let current: unknown = root;
    let found = true;
    for (const segment of segments) {
      if (!isPlainObject(current) || !(segment in current)) {
        found = false;
        break;
      }
      current = current[segment];
    }
    if (found) {
      return current;
    }
  }

  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function compareEventsAscending(left: CandidateEvent, right: CandidateEvent): number {
  return compareTimestampsAscending(left.record.timestamp, right.record.timestamp);
}

function compareTracesDescending(left: StudioPaymentTraceSummary, right: StudioPaymentTraceSummary): number {
  return compareTimestampsDescending(left.finishedAt ?? left.startedAt, right.finishedAt ?? right.startedAt);
}

function compareTimestampsDescending(left: string | null, right: string | null): number {
  const leftMs = parseTimestamp(left);
  const rightMs = parseTimestamp(right);
  if (Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs !== rightMs) {
    return rightMs - leftMs;
  }
  if (Number.isFinite(leftMs)) return -1;
  if (Number.isFinite(rightMs)) return 1;
  return 0;
}

function compareTimestampsAscending(left: string | null, right: string | null): number {
  return compareTimestampsDescending(right, left);
}

function parseTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

function computeDuration(start: string | null, end: string | null): number | null {
  const startMs = parseTimestamp(start);
  const endMs = parseTimestamp(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.max(0, endMs - startMs);
}

function computeOffsetMs(start: string | null, end: string | null): number | null {
  return computeDuration(start, end);
}

function splitSignal(signal: string): [string, string] {
  const index = signal.indexOf(":");
  if (index < 0) return [signal, ""];
  return [signal.slice(0, index), signal.slice(index + 1)];
}

function maxTimestamp(current: string | null, next: string | null): string | null {
  if (!current) return next;
  if (!next) return current;
  return compareTimestampsDescending(current, next) > 0 ? next : current;
}

function serialize(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
