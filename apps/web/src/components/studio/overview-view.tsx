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

/**
 * Composition (≥ xl): ruled stat strip on top, then a wide streaming log panel on
 * the left and a rail with recent errors + section health on the right. The feed
 * stretches to the rail's height so neither column leaves a dead gap. Below xl
 * everything collapses into a single column.
 */
const columnsClass = "grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,25rem)]";

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
      <div className="flex flex-col gap-4">
        <StatTilesSkeleton />
        <div className={columnsClass}>
          <PanelSkeleton rows={8} compact />
          <div className="flex flex-col gap-4">
            <ListRowsSkeleton rows={4} dense />
            <PanelSkeleton rows={3} compact />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <OverviewHealthBar stats={overview.stats} connectedAt={connectedAt} now={now} />
      <div className={columnsClass}>
        <OverviewLiveFeed items={overview.liveFeed} onOpen={onSelectFeedTarget} />
        <div className="flex min-w-0 flex-col gap-4">
          <OverviewRecentErrors
            items={overview.recentErrors}
            now={now}
            onAskAi={onAskAiForError}
            onViewTrace={onViewTrace}
          />
          <OverviewSectionsGrid sections={overview.sections} now={now} onSelect={onSelect} />
        </div>
      </div>
    </div>
  );
}
