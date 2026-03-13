import type { ReactNode } from "react";
import { useState } from "react";

import { CalendarDays, RotateCcw, Search, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StudioFile, StudioFilters, StudioMeta } from "@/lib/studio";
import {
  formatCalendarDate,
  fromCalendarFilterValue,
  getStatusClasses,
  toCalendarFilterValue,
} from "@/lib/studio";

interface StudioToolbarProps {
  draftProjectPath: string;
  filters: StudioFilters;
  meta: StudioMeta | undefined;
  files: StudioFile[];
  onDraftProjectPathChange(value: string): void;
  onInspect(): void;
  onFilterChange(next: StudioFilters): void;
  onResetFilters(): void;
}

export function StudioToolbar({
  draftProjectPath,
  filters,
  meta,
  files,
  onDraftProjectPathChange,
  onInspect,
  onFilterChange,
  onResetFilters,
}: StudioToolbarProps) {
  return (
    <Card className="overflow-visible border-border/70 bg-card">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 gap-2">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Target Project</div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={draftProjectPath}
                onChange={(event) => onDraftProjectPathChange(event.currentTarget.value)}
                placeholder="Absolute or relative path"
              />
              <Button onClick={onInspect}>Inspect</Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
            <StatusPill
              label="Project"
              status={meta?.project.valid ? "valid" : "invalid"}
              value={meta?.project.resolvedFrom ?? "cwd"}
            />
            <StatusPill label="Config" status={meta?.config.status ?? "not-found"} value={meta?.config.status ?? "idle"} />
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_repeat(4,minmax(0,0.65fr))]">
          <FilterBox icon={<Search className="size-3.5" />} label="Search">
            <Input
              value={filters.search}
              onChange={(event) =>
                onFilterChange({ ...filters, search: event.currentTarget.value })
              }
              placeholder="Message, bindings, data"
            />
          </FilterBox>
          <FilterBox icon={<SlidersHorizontal className="size-3.5" />} label="Level">
            <Select
              value={filters.level || ALL_LEVELS_VALUE}
              onValueChange={(value) =>
                onFilterChange({
                  ...filters,
                  level: value === ALL_LEVELS_VALUE ? "" : String(value ?? ""),
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_LEVELS_VALUE}>All levels</SelectItem>
                <SelectItem value="critical">critical</SelectItem>
                <SelectItem value="error">error</SelectItem>
                <SelectItem value="warning">warning</SelectItem>
                <SelectItem value="info">info</SelectItem>
                <SelectItem value="success">success</SelectItem>
                <SelectItem value="debug">debug</SelectItem>
                <SelectItem value="unknown">unknown</SelectItem>
              </SelectContent>
            </Select>
          </FilterBox>
          <FilterBox label="File">
            <Select
              value={filters.fileId || ALL_FILES_VALUE}
              onValueChange={(value) =>
                onFilterChange({
                  ...filters,
                  fileId: value === ALL_FILES_VALUE ? "" : String(value ?? ""),
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILES_VALUE}>All files</SelectItem>
                {files.map((file) => (
                  <SelectItem key={file.id} value={file.id}>
                    {file.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterBox>
          <FilterBox label="From">
            <DateFilterPicker
              label="From"
              value={filters.from}
              boundary="start"
              onChange={(value) => onFilterChange({ ...filters, from: value })}
            />
          </FilterBox>
          <FilterBox label="To">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <DateFilterPicker
                label="To"
                value={filters.to}
                boundary="end"
                onChange={(value) => onFilterChange({ ...filters, to: value })}
              />
              <Button variant="outline" size="sm" onClick={onResetFilters}>
                <RotateCcw />
                Reset
              </Button>
            </div>
          </FilterBox>
        </div>
      </CardContent>
    </Card>
  );
}

const ALL_LEVELS_VALUE = "__all-levels__";
const ALL_FILES_VALUE = "__all-files__";

function FilterBox({
  children,
  icon,
  label,
}: {
  children: ReactNode;
  icon?: ReactNode;
  label: string;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function StatusPill({
  label,
  status,
  value,
}: {
  label: string;
  status: "found" | "not-found" | "error" | "valid" | "invalid";
  value: string;
}) {
  return (
    <Badge className={`gap-2 px-2 py-1 ${getStatusClasses(status)}`}>
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </Badge>
  );
}

function DateFilterPicker({
  boundary,
  label,
  onChange,
  value,
}: {
  boundary: "start" | "end";
  label: string;
  onChange(value: string): void;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = fromCalendarFilterValue(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={buttonVariants({
          className:
            "w-full justify-between border-input bg-background px-2.5 text-left text-xs font-normal text-foreground hover:bg-muted/50",
          size: "default",
          variant: "outline",
        })}
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          <CalendarDays className="size-3.5 text-muted-foreground" />
          <span className={selectedDate ? "" : "text-muted-foreground"}>
            {selectedDate ? formatCalendarDate(selectedDate) : `${label} date`}
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {label} boundary
          </div>
          <Button
            variant="ghost"
            size="xs"
            disabled={!selectedDate}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Clear
          </Button>
        </div>
        <Calendar
          mode="single"
          selected={selectedDate}
          defaultMonth={selectedDate}
          onSelect={(date) => {
            onChange(toCalendarFilterValue(date, boundary));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
