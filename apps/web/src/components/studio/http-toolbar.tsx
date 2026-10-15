import type { ReactNode } from "react";

import { RotateCcw, Route, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StudioHttpOverview, StudioHttpStatusGroup, StudioHttpUiState } from "@/lib/studio";
import { cn } from "@/lib/utils";

import { StatusDot, type StudioTone } from "./studio-primitives";

interface HttpToolbarProps {
  facets: StudioHttpOverview["facets"] | undefined;
  httpUi: StudioHttpUiState;
  onHttpUiChange(next: StudioHttpUiState): void;
  onReset(): void;
}

const ALL_METHODS = "__all_methods__";
const DEFAULT_STATUS_GROUPS: StudioHttpStatusGroup[] = ["2xx", "3xx", "4xx", "5xx"];
const STATUS_GROUP_TONES: Record<StudioHttpStatusGroup, StudioTone> = {
  "2xx": "ok",
  "3xx": "info",
  "4xx": "warn",
  "5xx": "error",
};

export function HttpToolbar({
  facets,
  httpUi,
  onHttpUiChange,
  onReset,
}: HttpToolbarProps) {
  const statusGroups = facets?.statusGroups.length ? facets.statusGroups : DEFAULT_STATUS_GROUPS;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={httpUi.method || ALL_METHODS}
        onValueChange={(value) =>
          onHttpUiChange({
            ...httpUi,
            method: !value || value === ALL_METHODS ? "" : value,
          })
        }
      >
        <SelectTrigger aria-label="Method" className="w-full font-mono sm:w-36">
          <SelectValue>{httpUi.method || "All methods"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_METHODS}>All methods</SelectItem>
          {facets?.methods.map((method) => (
            <SelectItem key={method} value={method} className="font-mono">
              {method}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div
        role="group"
        aria-label="Status group"
        className="inline-flex h-8 items-center gap-0.5 rounded-md border border-border bg-muted/60 p-0.5"
      >
        <SegmentButton
          active={!httpUi.statusGroup}
          onClick={() => onHttpUiChange({ ...httpUi, statusGroup: "" })}
        >
          All
        </SegmentButton>
        {statusGroups.map((group) => (
          <SegmentButton
            key={group}
            active={httpUi.statusGroup === group}
            onClick={() =>
              onHttpUiChange({
                ...httpUi,
                statusGroup: httpUi.statusGroup === group ? "" : group,
              })
            }
          >
            <StatusDot tone={STATUS_GROUP_TONES[group]} />
            <span className="font-mono">{group}</span>
          </SegmentButton>
        ))}
      </div>

      <div className="relative min-w-48 flex-1">
        <Route className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Route"
          list="http-routes"
          value={httpUi.route}
          onChange={(event) => onHttpUiChange({ ...httpUi, route: event.currentTarget.value })}
          placeholder="Normalized route"
          className="pl-8 font-mono"
        />
        <datalist id="http-routes">
          {facets?.routes.map((route) => <option key={route} value={route} />)}
        </datalist>
      </div>

      <div className="relative w-full sm:w-40">
        <Timer className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Minimum duration in milliseconds"
          inputMode="numeric"
          value={httpUi.minDurationMs}
          onChange={(event) =>
            onHttpUiChange({
              ...httpUi,
              minDurationMs: event.currentTarget.value.replace(/[^\d]/g, ""),
            })
          }
          placeholder="Min duration (ms)"
          className="pr-8 pl-8 font-mono tabular-nums"
        />
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[0.68rem] text-muted-foreground">
          ms
        </span>
      </div>

      <Button variant="ghost" className="h-8 text-muted-foreground" onClick={onReset}>
        <RotateCcw className="size-3.5" />
        Reset
      </Button>
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-full items-center gap-1.5 rounded-[5px] px-2 text-[0.72rem] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/40",
        active
          ? "bg-card text-foreground shadow-xs"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
