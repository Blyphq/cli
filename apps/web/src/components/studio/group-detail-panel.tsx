import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioGroupDetail } from "@/lib/studio";
import {
  formatCompactDateTime,
  getGroupingReasonLabel,
  getLevelClasses,
} from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { MetaList } from "./meta-list";
import { PanelHeader } from "./panel-header";
import { TruncatedPath } from "./truncated-path";

interface GroupDetailPanelProps {
  group: StudioGroupDetail | null | undefined;
  loading?: boolean;
  onDescribeWithAi?(): void;
  onSelectRecord(recordId: string): void;
}

export function GroupDetailPanel({
  group,
  loading = false,
  onDescribeWithAi,
  onSelectRecord,
}: GroupDetailPanelProps) {
  if (loading && !group) {
    return (
      <EmptyState
        title="Loading group"
        description="Resolving the selected structured log group."
      />
    );
  }

  if (!group) {
    return (
      <EmptyState
        title="Select a structured group"
        description="Choose a grouped structured log entry to inspect its members and context."
      />
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <Card>
        <PanelHeader
          title={
            <div className="flex min-w-0 flex-col gap-2">
              <span className="break-words">{group.group.title}</span>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{group.group.recordCount} logs</Badge>
                {group.group.type ? <Badge variant="outline">{group.group.type}</Badge> : null}
                <Badge variant="muted">
                  {getGroupingReasonLabel(group.group.groupingReason)}
                </Badge>
              </div>
            </div>
          }
          description={`${formatCompactDateTime(group.group.timestampStart)} to ${formatCompactDateTime(group.group.timestampEnd)}`}
          action={
            onDescribeWithAi ? (
              <Button variant="secondary" size="xs" onClick={onDescribeWithAi}>
                Describe with AI
              </Button>
            ) : null
          }
        />
        <CardContent className="space-y-4">
          <MetaList
            items={[
              { label: "Group key", value: group.group.groupKey },
              { label: "Files", value: group.group.fileNames.join(", ") },
              { label: "Matched", value: `${group.group.matchedRecordCount} visible` },
            ]}
          />
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Preview
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              {group.group.previewMessages.map((message) => (
                <div key={`${group.group.id}:${message}`} className="break-words">
                  {message}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card size="sm">
        <PanelHeader
          title="Group members"
          description="Select a member record to inspect the raw payload."
        />
        <CardContent className="space-y-2">
          {group.records.map((record) => (
            <button
              key={record.id}
              type="button"
              onClick={() => onSelectRecord(record.id)}
              className="border-border/60 hover:bg-muted/40 flex w-full min-w-0 flex-col gap-2 border p-3 text-left"
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 truncate text-sm font-medium" title={record.message}>
                  {record.message}
                </div>
                <Badge className={getLevelClasses(record.level)}>{record.level}</Badge>
              </div>
              <div className="flex min-w-0 flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span>{formatCompactDateTime(record.timestamp)}</span>
                {record.type ? <span>{record.type}</span> : null}
                {record.caller ? <span>{record.caller}</span> : null}
              </div>
              <TruncatedPath value={record.filePath} />
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
