import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StudioAuthUserSummary } from "@/lib/studio";
import { formatCompactDateTime } from "@/lib/studio";

import { PanelHeader } from "./panel-header";

interface AuthUserBreakdownProps {
  users: StudioAuthUserSummary[];
  selectedUserId: string | null;
  onSelectUser(userId: string): void;
  onReset(): void;
}

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
    <Card>
      <PanelHeader
        title="User Activity"
        description="Users observed in auth-related logs."
        action={
          selectedUserId ? (
            <Button variant="outline" size="sm" onClick={onReset}>
              Clear user filter
            </Button>
          ) : null
        }
      />
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User ID</TableHead>
              <TableHead>Logins</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead>Errors</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow
                key={user.userId}
                data-state={selectedUserId === user.userId ? "selected" : undefined}
              >
                <TableCell>
                  <Button
                    variant="ghost"
                    className="h-auto px-0 py-0 font-medium"
                    onClick={() => onSelectUser(user.userId)}
                  >
                    {user.userId}
                  </Button>
                </TableCell>
                <TableCell>{user.loginCount}</TableCell>
                <TableCell>{formatCompactDateTime(user.lastSeen)}</TableCell>
                <TableCell>
                  <Badge variant={user.errorCount > 0 ? "destructive" : "muted"}>
                    {user.errorCount}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
