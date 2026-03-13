import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface MetaListItem {
  label: string;
  value: ReactNode;
}

interface MetaListProps {
  items: MetaListItem[];
  className?: string;
}

export function MetaList({ items, className }: MetaListProps) {
  return (
    <div className={cn("grid gap-3", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="grid min-w-0 gap-1 md:grid-cols-[8rem_minmax(0,1fr)] md:gap-3"
        >
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {item.label}
          </div>
          <div className="min-w-0 text-sm break-words">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
