import type { StudioPaymentFailureBreakdownRow } from "@/lib/studio";
import { formatCompactDateTime } from "@/lib/studio";

import { Card, CardContent } from "../ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { PanelHeader } from "./panel-header";

interface PaymentFailureBreakdownTableProps {
  rows: StudioPaymentFailureBreakdownRow[];
}

export function PaymentFailureBreakdownTable({
  rows,
}: PaymentFailureBreakdownTableProps) {
  return (
    <Card size="sm">
      <PanelHeader
        title="Payment failures"
        description="Most common payment failure reasons in the current scope."
      />
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%] px-4 py-3 whitespace-normal">Reason</TableHead>
              <TableHead className="px-4 py-3">Count</TableHead>
              <TableHead className="px-4 py-3 whitespace-normal">Most recent</TableHead>
              <TableHead className="w-[32%] px-4 py-3 whitespace-normal">Affected users</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="px-4 py-4 whitespace-normal text-muted-foreground">
                  No failed payment traces matched this scope.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.reason}>
                  <TableCell className="px-4 py-4 whitespace-normal break-words font-medium">
                    {row.reason}
                  </TableCell>
                  <TableCell className="px-4 py-4 align-top">{row.count}</TableCell>
                  <TableCell className="px-4 py-4 align-top whitespace-normal">
                    {formatCompactDateTime(row.mostRecentAt)}
                  </TableCell>
                  <TableCell className="px-4 py-4 whitespace-normal break-words text-muted-foreground">
                    {row.affectedUserIds.length > 0 ? row.affectedUserIds.join(", ") : "n/a"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
