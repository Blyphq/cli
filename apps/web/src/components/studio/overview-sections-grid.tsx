import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";

import {
  formatCompactDateTime,
  type StudioOverview,
  type StudioSectionId,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";

interface OverviewSectionsGridProps {
  sections: StudioOverview["sections"];
  onSelect(sectionId: StudioSectionId): void;
}

const statusDot: Record<StudioOverview["sections"][number]["status"], string> = {
  critical: "bg-destructive shadow-[0_0_0_3px_oklch(var(--destructive)/0.15)]",
  warning: "bg-amber-400 shadow-[0_0_0_3px_theme(colors.amber.400/15%)]",
  healthy: "bg-primary shadow-[0_0_0_3px_oklch(var(--primary)/0.15)]",
};

const errorCountClass = (count: number, status: StudioOverview["sections"][number]["status"]) =>
  count > 0 || status === "critical"
    ? "text-destructive"
    : "text-muted-foreground";

export function OverviewSectionsGrid({
  sections,
  onSelect,
}: OverviewSectionsGridProps) {
  if (sections.length === 0) {
    return (
      <EmptyState
        title="Section health"
        description="No sections detected yet for the current overview scope."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Section health
        </div>
        <div className="text-xs text-muted-foreground">
          Only detected sections appear here, with the noisiest surfaces called out first.
        </div>
      </div>
      <div className="grid gap-px md:grid-cols-2 lg:grid-cols-3 bg-border/40 rounded-md overflow-hidden ring-1 ring-border/40">
        {sections.map((section, index) => (
          <motion.button
            key={section.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: index * 0.04 }}
            onClick={() => onSelect(section.id)}
            className={cn(
              "group relative flex flex-col gap-0 bg-card text-left",
              "hover:bg-muted/40 transition-colors duration-100",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
            )}
          >
            {/* Top: name row */}
            <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base leading-none select-none shrink-0">{section.icon}</span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/70 truncate">
                  {section.label}
                </span>
              </div>
              <span
                className={cn(
                  "size-[7px] rounded-full shrink-0",
                  statusDot[section.status],
                  section.status === "critical" && "animate-pulse",
                )}
              />
            </div>

            {/* Middle: big numbers */}
            <div className="grid grid-cols-2 gap-px bg-border/30 mx-4 rounded overflow-hidden">
              <div className="flex flex-col gap-0.5 bg-card px-3 py-2.5">
                <span className="text-2xl font-semibold tabular-nums leading-none text-foreground">
                  {section.eventCount}
                </span>
                <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60">
                  events
                </span>
              </div>
              <div className="flex flex-col gap-0.5 bg-card px-3 py-2.5">
                <span
                  className={cn(
                    "text-2xl font-semibold tabular-nums leading-none",
                    errorCountClass(section.errorCount, section.status),
                  )}
                >
                  {section.errorCount}
                </span>
                <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60">
                  errors
                </span>
              </div>
            </div>

            {/* Footer: timestamp + arrow */}
            <div className="flex items-center justify-between gap-2 px-4 pt-2.5 pb-3.5">
              <span className="text-[11px] text-muted-foreground/50 tabular-nums">
                {formatCompactDateTime(section.lastEventAt)}
              </span>
              <ArrowRight className="size-3 text-muted-foreground/30 -translate-x-1 opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-60 shrink-0" />
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
