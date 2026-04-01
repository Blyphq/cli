import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PanelSkeleton({
  rows = 4,
  compact = false,
}: {
  rows?: number;
  compact?: boolean;
}) {
  return (
    <Card size={compact ? "sm" : "default"}>
      <CardContent className="space-y-4 p-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, index) => (
            <Skeleton
              key={index}
              className={`h-10 ${index % 3 === 0 ? "w-full" : index % 3 === 1 ? "w-[90%]" : "w-[80%]"}`}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function StatTilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} size="sm">
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-3 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ListRowsSkeleton({
  rows = 6,
  dense = false,
}: {
  rows?: number;
  dense?: boolean;
}) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-md border border-border/60 bg-background/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 space-y-2">
              <Skeleton className={`h-3 ${index % 2 === 0 ? "w-2/3" : "w-1/2"}`} />
              <Skeleton className={`h-3 ${index % 2 === 0 ? "w-1/2" : "w-2/3"}`} />
            </div>
            {!dense ? <Skeleton className="h-6 w-16" /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TimelineSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="space-y-2 rounded-md border border-border/60 bg-background/40 p-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function DetailPanelSkeleton() {
  return (
    <PanelSkeleton rows={6} compact />
  );
}

export function CodeContextSkeleton({ lines = 10 }: { lines?: number }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-3 p-4">
        <Skeleton className="h-4 w-44" />
        <div className="space-y-2">
          {Array.from({ length: lines }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="h-3 w-8" />
              <Skeleton className={`h-3 ${index % 2 === 0 ? "w-[88%]" : "w-[72%]"}`} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
