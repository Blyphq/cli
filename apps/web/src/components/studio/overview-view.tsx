import { useEffect, useState } from "react";

import type {
  StudioOverview,
  StudioOverviewRecentErrorItem,
  StudioOverviewTarget,
  StudioSectionId,
} from "@/lib/studio";

import { OverviewHealthBar } from "./overview-health-bar";
import { OverviewLiveFeed } from "./overview-live-feed";
import { OverviewRecentErrors } from "./overview-recent-errors";
import { OverviewSectionsGrid } from "./overview-sections-grid";
import { ListRowsSkeleton, PanelSkeleton, StatTilesSkeleton } from "./studio-skeletons";

interface OverviewViewProps {
  overview: StudioOverview | undefined;
  connectedAt: string;
  onSelect(section: StudioSectionId): void;
  onSelectFeedTarget(target: StudioOverviewTarget | null): void;
  onViewTrace(item: StudioOverviewRecentErrorItem): void;
  onAskAiForError(item: StudioOverviewRecentErrorItem): void;
}

export function OverviewView({
  overview,
  connectedAt,
  onSelect,
  onSelectFeedTarget,
  onViewTrace,
  onAskAiForError,
}: OverviewViewProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (!overview) {
    return (
      <div className="space-y-6">
        <StatTilesSkeleton />
        <PanelSkeleton rows={4} compact />
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.7fr)_minmax(24rem,0.9fr)]">
          <PanelSkeleton rows={5} compact />
          <ListRowsSkeleton rows={5} dense />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OverviewSectionsGrid sections={overview.sections} onSelect={onSelect} />
      <OverviewHealthBar
        stats={overview.stats}
        connectedAt={connectedAt}
        now={now}
      />
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.7fr)_minmax(24rem,0.9fr)]">
        <OverviewLiveFeed
          items={overview.liveFeed}
          onOpen={onSelectFeedTarget}
        />
        <OverviewRecentErrors
          items={overview.recentErrors}
          onAskAi={onAskAiForError}
          onViewTrace={onViewTrace}
        />
      </div>
    </div>
  );
}
