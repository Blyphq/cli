import { useEffect, useMemo, useRef, useState } from "react";

import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatRelativeTime,
  getLevelClasses,
  type StudioOverview,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface OverviewLiveFeedProps {
  items: StudioOverview["liveFeed"];
  onOpen(target: StudioOverview["liveFeed"][number]["target"]): void;
}

export function OverviewLiveFeed({ items, onOpen }: OverviewLiveFeedProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

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

  const orderedItems = useMemo(() => items.slice().reverse(), [items]);

  if (items.length === 0) {
    return (
      <EmptyState
        title="Live activity feed"
        description="Recent events will stream here as soon as logs match the current overview scope."
      />
    );
  }

  return (
    <Card size="sm">
      <PanelHeader
        title="Live activity feed"
        description={
          paused
            ? "Auto-scroll paused while you hover."
            : "Newest scoped events stream here in real time."
        }
        action={
          <Badge variant="outline" className="rounded-md">
            {paused ? "Paused" : "Live"}
          </Badge>
        }
      />
      <CardContent className="pt-4">
        <div
          ref={scrollRef}
          className="max-h-[34rem] space-y-3 overflow-y-auto pr-1"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {orderedItems.map((item) => {
            const expanded = expandedId === item.recordId;
            return (
              <div
                key={item.recordId}
                className="border border-border/60 bg-background/40 transition-colors hover:bg-muted/10"
              >
                <div className="flex items-start gap-2 p-4">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={expanded ? "Collapse details" : "Expand details"}
                    onClick={() => setExpandedId(expanded ? null : item.recordId)}
                  >
                    {expanded ? <ChevronDown /> : <ChevronRight />}
                  </Button>
                  <button
                    type="button"
                    className="min-w-0 flex-1 space-y-3 text-left"
                    onClick={() => item.target && onOpen(item.target)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-[11px] text-muted-foreground">
                        {formatRelativeTime(item.timestamp, now)}
                      </div>
                      <Badge className={cn("rounded-md", getLevelClasses(item.level))}>
                        {item.level}
                      </Badge>
                    </div>
                    <div className="line-clamp-2 break-words text-sm font-medium">
                      {item.message}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      {item.summaryFields.map((field) => (
                        <span key={`${item.recordId}:${field.key}:${field.value}`}>
                          {field.key}: {field.value}
                        </span>
                      ))}
                    </div>
                  </button>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => item.target && onOpen(item.target)}
                    disabled={!item.target}
                  >
                    Open
                    <ExternalLink />
                  </Button>
                </div>
                {expanded ? (
                  <div className="border-t border-border/60 bg-muted/10 px-4 py-3 text-[11px] text-muted-foreground">
                    Record ID: {item.recordId}
                    {item.target ? ` • Section: ${item.target.sectionId}` : ""}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
