import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioDetectedSection, StudioSectionId } from "@/lib/studio";
import { formatCompactDateTime } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface OverviewViewProps {
  sections: StudioDetectedSection[];
  onSelect(section: StudioSectionId): void;
}

export function OverviewView({ sections, onSelect }: OverviewViewProps) {
  if (!sections.length) {
    return (
      <EmptyState
        title="Overview"
        description="Studio will surface sections here as soon as matching signals appear in your logs."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sections.map((section) => (
        <Card key={section.id}>
          <PanelHeader
            title={`${section.icon} ${section.label}`}
            description={`${section.count} events detected in the current session.`}
            action={
              section.unreadErrorCount > 0 ? (
                <Badge variant="destructive">{section.unreadErrorCount} errors</Badge>
              ) : undefined
            }
          />
          <CardContent className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Latest signal: {formatCompactDateTime(section.lastMatchedAt)}
            </div>
            <Button variant="outline" onClick={() => onSelect(section.id)}>
              Open section
              <ArrowRight />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
