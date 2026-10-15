import type { ReactNode } from "react";

import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Circle,
  CreditCard,
  Database,
  Globe,
  LayoutGrid,
  Logs,
  Shield,
  Timer,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  formatCompactDateTime,
  type StudioOverview,
  type StudioSectionId,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";
import { StatusDot, type StudioTone } from "./studio-primitives";

type SectionCard = StudioOverview["sections"][number];

interface OverviewSectionsGridProps {
  sections: StudioOverview["sections"];
  onSelect(sectionId: StudioSectionId): void;
  /** Reference time for "last activity"; defaults to render time. */
  now?: number;
}

/** Compact "time ago" for dense mono columns: `now`, `42s ago`, `5m ago`, `3h ago`, `2d ago`. */
export function formatShortAgo(value: string | null | undefined, now = Date.now()): string {
  if (!value) {
    return "—";
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    return "—";
  }
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const countFormatter = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const exactFormatter = new Intl.NumberFormat();

function formatCount(value: number): string {
  return value >= 10_000 ? countFormatter.format(value) : exactFormatter.format(value);
}

const statusRank: Record<SectionCard["status"], number> = { critical: 0, warning: 1, healthy: 2 };

const statusTone: Record<SectionCard["status"], StudioTone> = {
  critical: "error",
  warning: "warn",
  healthy: "ok",
};

/** Mirrors the sidebar's section icons; custom sections keep their emoji. */
function getSectionGlyph(section: SectionCard): ReactNode {
  switch (section.id) {
    case "all-logs":
      return <Logs />;
    case "errors":
      return <AlertTriangle />;
    case "http":
      return <Globe />;
    case "agents":
      return <Bot />;
    case "auth":
      return <Shield />;
    case "payments":
      return <CreditCard />;
    case "database":
      return <Database />;
    case "background":
      return <Timer />;
    default:
      return section.icon ? (
        <span className="text-[0.8rem] leading-none">{section.icon}</span>
      ) : (
        <Circle />
      );
  }
}

export function OverviewSectionsGrid({ sections, onSelect, now = Date.now() }: OverviewSectionsGridProps) {
  // Noisiest surfaces first: status, then error volume, then traffic.
  const ordered = sections
    .slice()
    .sort(
      (left, right) =>
        statusRank[left.status] - statusRank[right.status] ||
        right.errorCount - left.errorCount ||
        right.eventCount - left.eventCount,
    );
  const failing = sections.filter((section) => section.errorCount > 0).length;

  return (
    <Card className="gap-0 py-0">
      <PanelHeader
        className="py-3"
        title="Section health"
        description="Detected sections, noisiest first."
        action={
          sections.length > 0 ? (
            <span className="font-mono text-[0.68rem] tabular-nums text-muted-foreground">
              {failing > 0 ? (
                <>
                  <span className="text-level-error">{failing}</span>
                  {" / "}
                </>
              ) : null}
              {sections.length} {sections.length === 1 ? "section" : "sections"}
            </span>
          ) : null
        }
      />
      {ordered.length === 0 ? (
        <div className="p-3">
          <EmptyState
            size="compact"
            icon={<LayoutGrid />}
            title="No sections yet"
            description="No sections detected yet for the current overview scope."
          />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] gap-2 p-3">
          {ordered.map((section) => (
            <SectionTile
              key={section.id}
              section={section}
              now={now}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function SectionTile({
  section,
  now,
  onSelect,
}: {
  section: SectionCard;
  now: number;
  onSelect(sectionId: StudioSectionId): void;
}) {
  const hasErrors = section.errorCount > 0;
  const errorLabel = `${section.errorCount} ${section.errorCount === 1 ? "error" : "errors"}`;
  const eventLabel = `${section.eventCount} ${section.eventCount === 1 ? "event" : "events"}`;

  return (
    <button
      type="button"
      onClick={() => onSelect(section.id)}
      aria-label={`Open section ${section.label}: ${eventLabel}, ${errorLabel}`}
      className={cn(
        "group/tile flex min-w-0 flex-col gap-2 rounded-md border border-border bg-card p-2.5 text-left",
        "transition-[border-color,box-shadow,transform,background-color] duration-150 ease-out-expo",
        "hover:-translate-y-px hover:border-foreground/20 hover:shadow-sm active:translate-y-0 active:scale-[0.99]",
        "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        section.status === "critical" && "border-level-error/25",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-[5px] border border-border bg-muted/50 text-muted-foreground transition-colors group-hover/tile:text-foreground [&>svg]:size-3.5">
          {getSectionGlyph(section)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[0.8rem] font-medium text-foreground">
          {section.label}
        </span>
        <StatusDot tone={statusTone[section.status]} />
      </div>
      <div className="flex min-w-0 items-baseline gap-x-3 font-mono text-[0.72rem] tabular-nums">
        <span className="truncate">
          <span className="text-foreground">{formatCount(section.eventCount)}</span>{" "}
          <span className="text-muted-foreground">ev</span>
        </span>
        <span className="truncate">
          <span className={hasErrors ? "text-level-error" : "text-muted-foreground/60"}>
            {formatCount(section.errorCount)}
          </span>{" "}
          <span className="text-muted-foreground">err</span>
        </span>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2 font-mono text-[0.66rem] tabular-nums text-muted-foreground/80">
        <span className="truncate" title={formatCompactDateTime(section.lastEventAt)}>
          {formatShortAgo(section.lastEventAt, now)}
        </span>
        <ArrowUpRight className="size-3 shrink-0 -translate-x-0.5 opacity-0 transition-all duration-150 group-hover/tile:translate-x-0 group-hover/tile:opacity-70" />
      </div>
    </button>
  );
}
