import { Card, CardContent } from "@/components/ui/card";
import type { StudioAuthOverview } from "@/lib/studio";

interface AuthStatsBarProps {
  stats: StudioAuthOverview["stats"];
}

export function AuthStatsBar({ stats }: AuthStatsBarProps) {
  const items = [
    {
      label: "Login attempts",
      value: `${stats.loginAttemptsTotal} attempts - ${stats.loginSuccessCount} success, ${stats.loginFailureCount} failed`,
    },
    {
      label: "Active sessions",
      value: String(stats.activeSessionCount),
    },
    {
      label: "Auth errors",
      value: String(stats.authErrorCount),
    },
    {
      label: "Suspicious activity",
      value: String(stats.suspiciousActivityCount),
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} size="sm">
          <CardContent className="space-y-1 py-1">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {item.label}
            </div>
            <div className="text-sm font-medium text-foreground">{item.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
