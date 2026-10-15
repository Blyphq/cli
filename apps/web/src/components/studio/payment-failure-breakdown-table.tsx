import type { StudioPaymentFailureBreakdownRow } from "@/lib/studio";
import { formatCompactDateTime } from "@/lib/studio";
import { cn } from "@/lib/utils";

import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { PanelHeader } from "./panel-header";
import { MeterBar, MonoChip } from "./studio-primitives";

interface PaymentFailureBreakdownTableProps {
  rows: StudioPaymentFailureBreakdownRow[];
}

const headCell = "h-8 px-3 text-left align-middle text-[0.7rem] font-medium text-muted-foreground";
const MAX_USER_CHIPS = 3;

export function PaymentFailureBreakdownTable({
  rows,
}: PaymentFailureBreakdownTableProps) {
  const maxCount = rows.reduce((max, row) => Math.max(max, row.count), 0);
  const totalCount = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <Card className="gap-0 py-0">
      <PanelHeader
        className="py-3"
        title="Payment failures"
        description="Most common payment failure reasons in the current scope."
        action={
          totalCount > 0 ? <Badge variant="destructive">{totalCount} failed</Badge> : null
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-[0.8rem]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th scope="col" className={headCell}>Reason</th>
              <th scope="col" className={cn(headCell, "w-[24%]")}>Share</th>
              <th scope="col" className={cn(headCell, "w-14 text-right")}>Count</th>
              <th scope="col" className={cn(headCell, "w-32")}>Most recent</th>
              <th scope="col" className={cn(headCell, "w-[26%]")}>Affected users</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-[0.75rem] text-muted-foreground">
                  No failed payment traces matched this scope.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const share = totalCount > 0 ? Math.round((row.count / totalCount) * 100) : 0;
                const width = maxCount > 0 ? (row.count / maxCount) * 100 : 0;
                const extraUsers = row.affectedUserIds.length - MAX_USER_CHIPS;

                return (
                  <tr
                    key={row.reason}
                    className="border-b border-border/70 transition-colors duration-150 last:border-0 hover:bg-muted/60"
                  >
                    <td className="px-3 py-2 align-middle font-medium break-words text-foreground">
                      {row.reason}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                          title={`${share}% of failures`}
                        >
                          <div className="h-full" style={{ width: `${width}%` }}>
                            <MeterBar
                              className="bg-transparent"
                              segments={[{ value: row.count, tone: "error", label: `${row.count} failures` }]}
                            />
                          </div>
                        </div>
                        <span className="w-8 text-right font-mono text-[0.68rem] tabular-nums text-muted-foreground">
                          {share}%
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right align-middle font-mono text-[0.76rem] tabular-nums text-level-error">
                      {row.count}
                    </td>
                    <td className="px-3 py-2 align-middle font-mono text-[0.72rem] tabular-nums text-muted-foreground/80">
                      {formatCompactDateTime(row.mostRecentAt)}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      {row.affectedUserIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {row.affectedUserIds.slice(0, MAX_USER_CHIPS).map((userId) => (
                            <MonoChip key={userId}>{userId}</MonoChip>
                          ))}
                          {extraUsers > 0 ? (
                            <MonoChip
                              title={row.affectedUserIds.slice(MAX_USER_CHIPS).join(", ")}
                              className="bg-transparent"
                            >
                              +{extraUsers}
                            </MonoChip>
                          ) : null}
                        </div>
                      ) : (
                        <span className="font-mono text-[0.72rem] text-muted-foreground/60">n/a</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
