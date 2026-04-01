import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
        title="No errors matched"
        description="Try a different time range, file, or filter."
      />
    );
  }

  return (
    <Card className="min-h-[36rem] min-w-0">
      <PanelHeader
        title="Errors"
        description={`${totalGroups} active grouped errors`}
      />
      <CardContent className="space-y-4 p-4">
        {groups.length === 0 ? (
          <EmptyState
            title="No active error groups"
            description="All visible groups are resolved or ignored."
            size="compact"
          />
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <ErrorGroupCard
                key={group.fingerprint}
                group={group}
                selected={selectedGroupId === group.fingerprint}
                onSelect={onSelect}
                onResolve={onResolve}
                onIgnore={onIgnore}
              />
            ))}
          </div>
        )}
        {resolvedGroups.length > 0 ? (
          <Collapsible defaultOpen={false} className="border border-border/60">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium">
              <span>Resolved ({resolvedGroups.length})</span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 border-t border-border/60 p-4">
              {resolvedGroups.map((group) => (
                <ErrorGroupCard
                  key={group.fingerprint}
                  group={group}
                  selected={selectedGroupId === group.fingerprint}
                  onSelect={onSelect}
                  onIgnore={onIgnore}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
        <div className="flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            Showing {showingStart}-{showingEnd} of {totalGroups}
          </div>
          <div className="flex gap-2">
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
      </CardContent>
    </Card>
  );
}
