import type { StudioAuthOverview } from "@/lib/studio";

import { MeterBar, StatCell, StatStrip } from "./studio-primitives";

interface AuthStatsBarProps {
  stats: StudioAuthOverview["stats"];
}

export function AuthStatsBar({ stats }: AuthStatsBarProps) {
  const successRate =
    stats.loginAttemptsTotal > 0
      ? Math.round((stats.loginSuccessCount / stats.loginAttemptsTotal) * 100)
      : null;

  return (
    <StatStrip columns="grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-5">
      <StatCell
        className="col-span-2 @5xl:col-span-1"
        label="Login attempts"
        value={stats.loginAttemptsTotal.toLocaleString()}
        hint={
          <span className="font-mono tabular-nums">
            {stats.loginSuccessCount} ok · {stats.loginFailureCount} failed
            {successRate != null ? ` · ${successRate}%` : ""}
          </span>
        }
        footer={
          stats.loginAttemptsTotal > 0 ? (
            <MeterBar
              className="mt-0.5"
              segments={[
                { value: stats.loginSuccessCount, tone: "ok", label: `${stats.loginSuccessCount} succeeded` },
                { value: stats.loginFailureCount, tone: "error", label: `${stats.loginFailureCount} failed` },
              ]}
            />
          ) : null
        }
      />
      <StatCell
        label="Failed logins"
        value={stats.loginFailureCount.toLocaleString()}
        tone={stats.loginFailureCount > 0 ? "error" : "neutral"}
        hint={stats.loginFailureCount > 0 ? "Rejected credentials" : "No rejected logins"}
      />
      <StatCell
        label="Active sessions"
        value={stats.activeSessionCount.toLocaleString()}
        hint="Distinct sessions observed"
      />
      <StatCell
        label="Auth errors"
        value={stats.authErrorCount.toLocaleString()}
        tone={stats.authErrorCount > 0 ? "warn" : "neutral"}
        hint={stats.authErrorCount > 0 ? <span className="font-mono">401 · 403 responses</span> : "No auth errors"}
      />
      <StatCell
        label="Suspicious activity"
        value={stats.suspiciousActivityCount.toLocaleString()}
        tone={stats.suspiciousActivityCount > 0 ? "error" : "neutral"}
        hint={
          stats.suspiciousActivityCount > 0
            ? `${stats.suspiciousActivityCount === 1 ? "Pattern" : "Patterns"} flagged`
            : "Nothing flagged"
        }
      />
    </StatStrip>
  );
}
