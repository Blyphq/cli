import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime, type StudioOverview } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { formatShortAgo } from "./overview-sections-grid";
import { PanelHeader } from "./panel-header";

type RecentErrorItem = StudioOverview["recentErrors"][number];

interface OverviewRecentErrorsProps {
  items: StudioOverview["recentErrors"];
  onAskAi(item: RecentErrorItem): void;
  onViewTrace(item: RecentErrorItem): void;
  /** Reference time for relative timestamps; defaults to render time. */
  now?: number;
}

const ERROR_TYPE_PATTERN = /^([A-Z][\w$]*(?:Error|Exception|Fault))\b\s*:?\s*/;

/** Splits `TypeError: foo is undefined\n  at …` into a type label and the first message line. */
function splitErrorMessage(message: string): { type: string | null; text: string } {
  const firstLine = message.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
  const match = ERROR_TYPE_PATTERN.exec(firstLine);
  if (!match) {
    return { type: null, text: firstLine || message };
  }
  const rest = firstLine.slice(match[0].length).trim();
  return { type: match[1]!, text: rest };
}

export function OverviewRecentErrors({
  items,
  onAskAi,
  onViewTrace,
  now = Date.now(),
}: OverviewRecentErrorsProps) {
  return (
    <Card className="gap-0 py-0">
      <PanelHeader
        className="py-3"
        title="Recent errors"
        description="Latest error groups in the current scope."
        action={
          items.length > 0 ? (
            <span className="font-mono text-[0.68rem] tabular-nums text-muted-foreground">
              <span className="text-level-error">{items.length}</span>{" "}
              {items.length === 1 ? "group" : "groups"}
            </span>
          ) : null
        }
      />
      {items.length === 0 ? (
        <div className="p-3">
          <EmptyState
            size="compact"
            icon={<ShieldCheck />}
            title="All clear"
            description="No recent errors matched the current overview scope."
          />
        </div>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => {
            const { type, text } = splitErrorMessage(item.message);
            return (
              <li
                key={item.groupId}
                className="group/error relative border-b border-border/70 px-3 py-2.5 transition-colors duration-150 last:border-0 hover:bg-muted/60"
              >
                <div className="flex min-w-0 items-baseline gap-2">
                  <span aria-hidden className="size-1.5 shrink-0 -translate-y-px self-center rounded-full bg-level-error" />
                  <p className="min-w-0 flex-1 truncate text-[0.8rem] text-foreground" title={item.message}>
                    {type ? (
                      <span className="mr-1.5 font-mono text-[0.74rem] font-medium text-level-error">{type}</span>
                    ) : null}
                    {text}
                  </p>
                  <time
                    dateTime={item.timestamp ?? undefined}
                    title={formatDateTime(item.timestamp)}
                    className="shrink-0 font-mono text-[0.68rem] tabular-nums text-muted-foreground/80"
                  >
                    {formatShortAgo(item.timestamp, now)}
                  </time>
                </div>
                <div className="mt-1.5 flex min-w-0 items-center gap-2 pl-3.5">
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-[0.68rem] tabular-nums text-muted-foreground"
                    title={item.sourceFile ? `${item.sourceFile}:${item.sourceLine ?? "?"}` : undefined}
                  >
                    {item.sourceFile ? (
                      <>
                        {item.sourceFile}
                        <span className="text-muted-foreground/60">:{item.sourceLine ?? "?"}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground/60">no source location</span>
                    )}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="xs" onClick={() => onViewTrace(item)}>
                      View trace
                      <ArrowRight />
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => onAskAi(item)}>
                      <Sparkles />
                      Ask AI
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
