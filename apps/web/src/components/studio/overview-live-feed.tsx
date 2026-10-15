import { useEffect, useMemo, useRef, useState } from "react";

import { ArrowUpRight, ChevronRight, Pause, Radio } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime, getLevelClasses, type StudioOverview } from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";
import { StatusDot } from "./studio-primitives";

type FeedItem = StudioOverview["liveFeed"][number];

interface OverviewLiveFeedProps {
  items: StudioOverview["liveFeed"];
  onOpen(target: FeedItem["target"]): void;
}

/** `12:04:31.002` — the docs' log-row clock format, in local time. */
function formatClock(value: string | null): string {
  if (!value) {
    return "--:--:--.---";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--:--.---";
  }
  const pad = (part: number, length = 2) => String(part).padStart(length, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function formatSource(target: FeedItem["target"]): string {
  if (!target) {
    return "—";
  }
  return target.sectionId === "all-logs" ? "logs" : target.sectionId;
}

/** Inline trailing context, docs-style: `POST /checkout 500 18ms user=…`. */
function formatInlineFields(fields: FeedItem["summaryFields"]): string {
  return fields
    .map((field) =>
      field.key === "HTTP" || field.key === "Status" || field.key === "Duration"
        ? field.value
        : `${field.key.toLowerCase()}=${field.value}`,
    )
    .join("  ");
}

export function OverviewLiveFeed({ items, onOpen }: OverviewLiveFeedProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (paused) {
      return;
    }
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [items, paused]);

  // Newest at the bottom, like a tailing terminal.
  const orderedItems = useMemo(() => items.slice().reverse(), [items]);
  const empty = items.length === 0;

  return (
    <Card className="min-h-[30rem] min-w-0 gap-0 py-0 xl:min-h-[34rem]">
      <PanelHeader
        className="py-3"
        title="Live activity feed"
        description={
          empty
            ? "Waiting for scoped events."
            : paused
              ? "Auto-scroll paused while you hover."
              : "Newest scoped events stream here in real time."
        }
        action={
          <Badge variant={paused ? "muted" : "success"} className="h-6 gap-1.5 px-2">
            {paused ? <Pause /> : <StatusDot tone="ok" live />}
            {paused ? "Paused" : "Live"}
          </Badge>
        }
      />

      {empty ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="w-full max-w-md">
            <EmptyState
              icon={<Radio />}
              title="Waiting for events"
              description="Recent events will stream here as soon as logs match the current overview scope."
            />
          </div>
        </div>
      ) : (
        <>
          {/* Column header */}
          <div
            aria-hidden
            className="flex h-8 shrink-0 items-center gap-3 border-b border-border bg-muted/40 pl-9 pr-3 text-[0.7rem] font-medium text-muted-foreground"
          >
            <span className="hidden w-[6.6rem] shrink-0 sm:block">Time</span>
            <span className="w-14 shrink-0 text-center">Level</span>
            <span className="hidden w-20 shrink-0 md:block">Source</span>
            <span className="min-w-0 flex-1">Message</span>
          </div>

          <div className="relative min-h-0 flex-1">
            <div
              ref={scrollRef}
              className="absolute inset-0 overflow-y-auto overscroll-contain"
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
            >
              <ol className="flex flex-col py-1">
                {orderedItems.map((item) => (
                  <FeedRow
                    key={item.recordId}
                    item={item}
                    expanded={expandedId === item.recordId}
                    onToggle={() =>
                      setExpandedId((current) => (current === item.recordId ? null : item.recordId))
                    }
                    onOpen={onOpen}
                  />
                ))}
              </ol>
            </div>
          </div>

          <div className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-border bg-muted/30 px-3 font-mono text-[0.66rem] tabular-nums text-muted-foreground">
            <span>
              {items.length} {items.length === 1 ? "event" : "events"} · newest last
            </span>
            <span className="hidden sm:inline">hover to pause · click a row to open</span>
          </div>
        </>
      )}
    </Card>
  );
}

function FeedRow({
  item,
  expanded,
  onToggle,
  onOpen,
}: {
  item: FeedItem;
  expanded: boolean;
  onToggle(): void;
  onOpen(target: FeedItem["target"]): void;
}) {
  const inline = formatInlineFields(item.summaryFields);

  return (
    <li className="group/row blyp-line-in">
      <div
        className={cn(
          "flex min-h-8 items-center gap-1 px-1.5 transition-colors duration-150 hover:bg-muted/60",
          expanded && "bg-muted/40",
        )}
      >
        <button
          type="button"
          aria-label={expanded ? "Collapse details" : "Expand details"}
          aria-expanded={expanded}
          onClick={onToggle}
          className="grid size-6 shrink-0 place-items-center rounded-[5px] text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform duration-150 ease-out-expo", expanded && "rotate-90")}
          />
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-[5px] py-1.5 pl-1 text-left font-mono text-[0.74rem] tabular-nums focus-visible:bg-muted focus-visible:outline-none"
          onClick={() => item.target && onOpen(item.target)}
        >
          <time
            dateTime={item.timestamp ?? undefined}
            title={formatDateTime(item.timestamp)}
            className="hidden w-[6.6rem] shrink-0 text-muted-foreground/80 sm:block"
          >
            {formatClock(item.timestamp)}
          </time>
          <Badge className={cn("w-14 shrink-0 justify-center", getLevelClasses(item.level))}>
            {item.level}
          </Badge>
          <span className="hidden w-20 shrink-0 truncate text-muted-foreground md:block">
            {formatSource(item.target)}
          </span>
          <span className="min-w-0 flex-1 truncate text-foreground">
            {item.message}
            {inline ? <span className="text-muted-foreground">{`  ${inline}`}</span> : null}
          </span>
        </button>
        <Button
          variant="ghost"
          size="xs"
          className="shrink-0 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          onClick={() => item.target && onOpen(item.target)}
          disabled={!item.target}
        >
          Open
          <ArrowUpRight />
        </Button>
      </div>
      {expanded ? (
        <div className="mb-1.5 ml-9 mr-3 mt-0.5 rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-[0.7rem] leading-5 text-muted-foreground">
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4">
            <dt>Record ID</dt>
            <dd className="truncate text-foreground">{item.recordId}</dd>
            {item.target ? (
              <>
                <dt>Section</dt>
                <dd className="truncate text-foreground">{item.target.sectionId}</dd>
              </>
            ) : null}
            {item.summaryFields.map((field) => (
              <div key={`${field.key}:${field.value}`} className="contents">
                <dt>{field.key}</dt>
                <dd className="truncate text-foreground">{field.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-1 whitespace-pre-wrap break-words font-sans text-[0.75rem] leading-relaxed text-foreground/90">
            {item.message}
          </p>
        </div>
      ) : null}
    </li>
  );
}
