import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioAuthSuspiciousPattern } from "@/lib/studio";
import { formatCompactDateTime } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface AuthSuspiciousPanelProps {
  patterns: StudioAuthSuspiciousPattern[];
  selectedPatternId: string | null;
  onSelect(pattern: StudioAuthSuspiciousPattern): void;
}

export function AuthSuspiciousPanel({
  patterns,
  selectedPatternId,
  onSelect,
}: AuthSuspiciousPanelProps) {
  if (!patterns.length) {
    return (
      <EmptyState
        title="No suspicious auth patterns"
        description="Studio did not find repeated failures, invalid token spikes, or concurrent sessions."
        size="compact"
      />
    );
  }

  return (
    <Card>
      <PanelHeader
        title="Suspicious Activity"
        description="Auto-detected auth patterns that warrant investigation."
      />
      <CardContent className="space-y-3">
        {patterns.map((pattern) => (
          <Button
            key={pattern.id}
            variant={selectedPatternId === pattern.id ? "secondary" : "outline"}
            className="h-auto w-full items-start justify-start py-3 text-left"
            onClick={() => onSelect(pattern)}
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{pattern.title}</span>
                <Badge variant="destructive">{pattern.eventCount} events</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {pattern.description}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {pattern.affectedUserId ? `User ${pattern.affectedUserId}` : "User unknown"}
                {pattern.affectedIp ? ` | IP ${pattern.affectedIp}` : ""}
                {" | "}
                {formatCompactDateTime(pattern.timestampStart)} to{" "}
                {formatCompactDateTime(pattern.timestampEnd)}
              </div>
            </div>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
