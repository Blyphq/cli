import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { StudioAuthUserSummary } from "@/lib/studio";
import { formatCompactDateTime } from "@/lib/studio";
import { cn } from "@/lib/utils";

import { PanelHeader } from "./panel-header";
import { StatusDot } from "./studio-primitives";

interface AuthUserBreakdownProps {
  users: StudioAuthUserSummary[];
  selectedUserId: string | null;
  onSelectUser(userId: string): void;
  onReset(): void;
}

const headCell = "h-8 px-3 text-left align-middle text-[0.7rem] font-medium text-muted-foreground";

export function AuthUserBreakdown({
  users,
  selectedUserId,
  onSelectUser,
  onReset,
}: AuthUserBreakdownProps) {
  if (!users.length) {
    return null;
  }

  return (
    <Card className="gap-0 py-0">
      <PanelHeader
        className="py-3"
        title="User Activity"
        description={`${users.length} ${users.length === 1 ? "user" : "users"} observed in auth-related logs. Select one to filter the timeline.`}
        action={
          selectedUserId ? (
            <Button variant="outline" size="xs" onClick={onReset}>
              <X />
              Clear user filter
            </Button>
          ) : null
        }
      />
      <div className="max-h-[22rem] overflow-auto">
        <table className="w-full border-collapse text-[0.8rem]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-muted/40 backdrop-blur-sm">
              <th scope="col" className={headCell}>User</th>
              <th scope="col" className={cn(headCell, "w-20 text-right")}>Logins</th>
              <th scope="col" className={cn(headCell, "w-20 text-right")}>Errors</th>
              <th scope="col" className={cn(headCell, "hidden w-40 sm:table-cell")}>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const selected = selectedUserId === user.userId;

              return (
                <tr
                  key={user.userId}
                  data-state={selected ? "selected" : undefined}
                  className={cn(
                    "relative border-b border-border/70 transition-colors duration-150 last:border-0 hover:bg-muted/60 focus-within:bg-muted",
                    selected && "bg-primary-soft/50 shadow-[inset_2px_0_0_var(--signal)] hover:bg-primary-soft/60",
                  )}
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onSelectUser(user.userId)}
                      className={cn(
                        "max-w-full truncate font-mono text-[0.76rem] tabular-nums outline-none after:absolute after:inset-0 after:content-['']",
                        selected ? "font-medium text-primary-soft-foreground" : "text-foreground",
                      )}
                    >
                      {user.userId}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[0.76rem] tabular-nums text-foreground/90">
                    {user.loginCount}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[0.76rem] tabular-nums">
                    {user.errorCount > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-level-error">
                        <StatusDot tone="error" />
                        {user.errorCount}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/70">0</span>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 font-mono text-[0.72rem] tabular-nums text-muted-foreground/80 sm:table-cell">
                    {formatCompactDateTime(user.lastSeen)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
