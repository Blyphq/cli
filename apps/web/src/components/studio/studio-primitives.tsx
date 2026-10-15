import type { ReactNode } from "react";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shared Studio building blocks. These mirror the visual language of
 * https://blyp.dev — ruled stat strips, eyebrow labels with a signal square,
 * Manrope headings and mono numerics — so every section feels like one product.
 */

export type StudioTone = "neutral" | "info" | "ok" | "warn" | "error";

const toneText: Record<StudioTone, string> = {
  neutral: "text-foreground",
  info: "text-level-info",
  ok: "text-level-ok",
  warn: "text-level-warn",
  error: "text-level-error",
};

const toneDot: Record<StudioTone, string> = {
  neutral: "bg-muted-foreground/50",
  info: "bg-level-info",
  ok: "bg-level-ok",
  warn: "bg-level-warn",
  error: "bg-level-error",
};

export function getToneTextClass(tone: StudioTone): string {
  return toneText[tone];
}

export function StatusDot({
  tone = "neutral",
  live = false,
  className,
}: {
  tone?: StudioTone;
  live?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        toneDot[tone],
        live && "blyp-live-dot",
        className,
      )}
    />
  );
}

/** Page-level heading for a Studio section: eyebrow, Manrope title, description, actions. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? <div className="blyp-eyebrow">{eyebrow}</div> : null}
        <h2 className="font-heading text-xl font-semibold leading-tight tracking-[-0.035em] text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="max-w-2xl text-pretty text-[0.8rem] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export interface StatCellProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StudioTone;
  /** Show a level dot next to the label. Defaults to true when tone is not neutral. */
  dot?: boolean;
  trend?: {
    direction: "up" | "down" | "flat";
    label: ReactNode;
    /** Whether "up" is good (e.g. throughput) or bad (e.g. error rate). */
    goodWhen?: "up" | "down";
  };
  footer?: ReactNode;
  className?: string;
}

/**
 * A ruled strip of metrics — one bordered surface divided by hairlines, like the
 * stats row on blyp.dev. Use instead of a grid of separate cards.
 */
export function StatStrip({
  children,
  className,
  columns,
}: {
  children: ReactNode;
  className?: string;
  /**
   * Tailwind grid-cols classes; defaults to an auto-fitting grid. The strip is a
   * container, so prefer container variants (`@2xl:`, `@5xl:`) over viewport ones —
   * the content column narrows when a detail panel is open.
   */
  columns?: string;
}) {
  return (
    <div className="@container min-w-0">
      <div
        className={cn(
          "grid overflow-hidden rounded-lg border border-border bg-border shadow-xs gap-px",
          columns ?? "grid-cols-2 @2xl:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function StatCell({
  label,
  value,
  hint,
  tone = "neutral",
  dot,
  trend,
  footer,
  className,
}: StatCellProps) {
  const showDot = dot ?? tone !== "neutral";
  const trendTone: StudioTone = !trend || trend.direction === "flat"
    ? "neutral"
    : trend.goodWhen
      ? trend.direction === trend.goodWhen
        ? "ok"
        : "error"
      : "neutral";

  return (
    <div className={cn("flex min-w-0 flex-col gap-2 bg-card px-4 py-3.5", className)}>
      <div className="flex min-w-0 items-center gap-1.5 text-[0.72rem] text-muted-foreground">
        {showDot ? <StatusDot tone={tone} /> : null}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          "truncate font-heading text-[1.6rem] font-semibold leading-none tracking-[-0.04em] tabular-nums",
          tone === "error" || tone === "warn" ? toneText[tone] : "text-foreground",
        )}
      >
        {value}
      </div>
      {trend || hint ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-muted-foreground">
          {trend ? (
            <span className={cn("inline-flex items-center gap-0.5 font-mono tabular-nums", toneText[trendTone])}>
              {trend.direction === "up" ? (
                <ArrowUpRight className="size-3" />
              ) : trend.direction === "down" ? (
                <ArrowDownRight className="size-3" />
              ) : (
                <ArrowRight className="size-3" />
              )}
              {trend.label}
            </span>
          ) : null}
          {hint ? <span className="min-w-0 truncate">{hint}</span> : null}
        </div>
      ) : null}
      {footer}
    </div>
  );
}

/** Thin horizontal proportion bar (e.g. status mix, retention), matching the docs' meter. */
export function MeterBar({
  segments,
  className,
}: {
  segments: Array<{ value: number; tone: StudioTone; label?: string }>;
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);

  return (
    <div className={cn("flex h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      {total > 0
        ? segments.map((segment, index) =>
            segment.value > 0 ? (
              <span
                key={index}
                title={segment.label}
                className={cn("h-full first:rounded-l-full last:rounded-r-full", toneDot[segment.tone])}
                style={{ width: `${(segment.value / total) * 100}%` }}
              />
            ) : null,
          )
        : null}
    </div>
  );
}

/** Uppercase mono key/value chip used for inline metadata (ids, durations, routes). */
export function MonoChip({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 max-w-full items-center truncate rounded-[4px] bg-muted px-1.5 font-mono text-[0.66rem] tabular-nums text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
