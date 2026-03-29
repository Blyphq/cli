import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatCompactDateTime,
  getOverviewStatusClasses,
  type StudioOverview,
  type StudioSectionId,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface OverviewSectionsGridProps {
  sections: StudioOverview["sections"];
  onSelect(sectionId: StudioSectionId): void;
}

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
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Card
            key={section.id}
            className={cn("border shadow-sm", getOverviewStatusClasses(section.status))}
          >
            <PanelHeader
              title={`${section.icon} ${section.label}`}
              description={`${section.eventCount} events • ${section.errorCount} errors`}
            />
            <CardContent className="space-y-4 pt-4">
              <div className="text-[11px] opacity-80">
                Last event: {formatCompactDateTime(section.lastEventAt)}
              </div>
              <Button variant="outline" size="xs" onClick={() => onSelect(section.id)}>
                Open section
                <ArrowRight />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
