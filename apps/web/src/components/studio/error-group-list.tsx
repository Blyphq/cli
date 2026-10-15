import { CheckCircle2, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { StudioErrorGroup } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { ErrorGroupCard } from "./error-group-card";
import { PanelHeader } from "./panel-header";

interface ErrorGroupListProps {
  groups: StudioErrorGroup[];
  resolvedGroups: StudioErrorGroup[];
  selectedGroupId: string | null;
  offset: number;
  limit: number;
  totalGroups: number;
  onSelect(groupId: string): void;
  onResolve(groupId: string): void;
  onIgnore(groupId: string): void;
  onPageChange(nextOffset: number): void;
}

export function ErrorGroupList({
  groups,
  resolvedGroups,
  selectedGroupId,
  offset,
  limit,
  totalGroups,
  onSelect,
  onResolve,
  onIgnore,
  onPageChange,
}: ErrorGroupListProps) {
  const showingStart = groups.length === 0 ? 0 : offset + 1;
  const showingEnd = groups.length === 0 ? 0 : Math.min(offset + groups.length, totalGroups);

  if (groups.length === 0 && resolvedGroups.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck />}
        title="No errors matched"
        description="Try a different time range, file, or filter."
      />
    );
  }

  return (
    <Card className="min-h-[36rem] min-w-0 gap-0 py-0">
      <PanelHeader
        className="py-3 [.border-b]:pb-3"
        title="Errors"
        description={
          <span className="font-mono text-[0.7rem] tabular-nums">{`${totalGroups} active grouped errors`}</span>
        }
      />
      {groups.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={<CheckCircle2 />}
            title="No active error groups"
            description="All visible groups are resolved or ignored."
            size="compact"
          />
        </div>
      ) : (
        <ul aria-label="Error groups" className="divide-y divide-border/70">
          {groups.map((group) => (
            <li key={group.fingerprint}>
              <ErrorGroupCard
                group={group}
                selected={selectedGroupId === group.fingerprint}
                onSelect={onSelect}
                onResolve={onResolve}
                onIgnore={onIgnore}
              />
            </li>
          ))}
        </ul>
      )}
      {resolvedGroups.length > 0 ? (
        <Collapsible defaultOpen={false} className="border-t border-border">
          <CollapsibleTrigger className="group/resolved flex h-9 w-full items-center gap-2 bg-muted/30 px-4 text-left text-[0.75rem] font-medium text-foreground/90 outline-none transition-colors duration-150 hover:bg-muted/60 focus-visible:bg-muted">
            <ChevronRight
              aria-hidden
              className="size-3.5 text-muted-foreground transition-transform duration-150 ease-out-expo group-data-[panel-open]/resolved:rotate-90"
            />
            <span>Resolved</span>
            <Badge variant="success">{resolvedGroups.length}</Badge>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul aria-label="Resolved error groups" className="divide-y divide-border/70 border-t border-border/70">
              {resolvedGroups.map((group) => (
                <li key={group.fingerprint}>
                  <ErrorGroupCard
                    group={group}
                    selected={selectedGroupId === group.fingerprint}
                    onSelect={onSelect}
                    onIgnore={onIgnore}
                  />
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
      <div className="mt-auto flex flex-col gap-2 border-t border-border px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
          Showing {showingStart}-{showingEnd} of {totalGroups}
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => onPageChange(Math.max(0, offset - limit))}
          >
            <ChevronLeft />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + limit >= totalGroups}
            onClick={() => onPageChange(offset + limit)}
          >
            Next
            <ChevronRight />
          </Button>
        </div>
      </div>
    </Card>
  );
}
