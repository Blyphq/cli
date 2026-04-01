import type { ReactNode } from "react";
import { useState } from "react";

import {
  Bot,
  CalendarDays,
  LayoutPanelTop,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";

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
import type {
  StudioFacets,
  StudioFile,
  StudioFilters,
  StudioGroupingMode,
  StudioMeta,
  StudioSectionId,
} from "@/lib/studio";
import {
  formatCalendarDate,
  fromCalendarFilterValue,
  toCalendarFilterValue,
} from "@/lib/studio";

import { TruncatedPath } from "./truncated-path";

interface StudioToolbarProps {
  draftProjectPath: string;
  facets: StudioFacets | undefined;
  files: StudioFile[];
  filters: StudioFilters;
  grouping: StudioGroupingMode;
  meta: StudioMeta | undefined;
  section: StudioSectionId;
  onDraftProjectPathChange(value: string): void;
  onFilterChange(next: StudioFilters): void;
  onGroupingChange(value: StudioGroupingMode): void;
  onInspect(): void;
  onStartStandaloneChat(): void;
  onResetFilters(): void;
}


export function StudioToolbar({
  draftProjectPath,
  facets,
  files,
  filters,
  grouping,
  meta,
  section,
  onDraftProjectPathChange,
  onFilterChange,
  onGroupingChange,
  onInspect,
  onStartStandaloneChat,
  onResetFilters,
}: StudioToolbarProps) {
  const currentTarget = meta?.project.absolutePath || draftProjectPath;
  const authMode = section === "auth";
  const backgroundMode = section === "background";
  const httpMode = section === "http";
  const overviewMode = section === "overview";
  const disableClassificationControls = authMode || overviewMode || backgroundMode || httpMode;
  const disabledControlText = overviewMode
    ? {
        level: "Overview doesn't filter by level",
        type: "Overview doesn't filter by type",
        view: "Overview has no log grouping",
      }
    : httpMode
      ? {
          level: "HTTP view uses request health signals",
          type: "HTTP view has section-local filters",
          view: "HTTP view has dedicated tables",
        }
    : backgroundMode
      ? {
          level: "Background Jobs uses run analysis",
          type: "Background Jobs doesn't filter by type",
          view: "Background Jobs has no log grouping",
        }
    : {
        level: "Auth view controls classification",
        type: "Auth view uses domain event types",
        view: "Auth timeline",
      };

  return (
    <Card className="overflow-visible border-border/70 bg-card">
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="min-w-0 space-y-3">
            <div className="min-w-0 space-y-1">
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Studio
              </div>
              {currentTarget ? (
                <TruncatedPath value={currentTarget} />
              ) : (
                <div className="text-xs text-muted-foreground">
                  Inspect a local project using its current Blyp config and logs.
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <Input
                className="flex-1"
                value={draftProjectPath}
                onChange={(event) => onDraftProjectPathChange(event.currentTarget.value)}
                placeholder="Absolute or relative path"
              />
              <Button onClick={onInspect}>Inspect</Button>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              aria-label="Chat with Blyp"
              variant="outline"
              size="sm"
              onClick={onStartStandaloneChat}
            >
              <Bot />
              Chat with Blyp
            </Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <FilterBox icon={<Search className="size-3.5" />} label="Search">
            <Input
              value={filters.search}
              onChange={(event) =>
                onFilterChange({ ...filters, search: event.currentTarget.value })
              }
              placeholder="Message, bindings, data"
            />
          </FilterBox>
          <div className="flex justify-start md:justify-end">
            <Popover>
              <PopoverTrigger
                className={buttonVariants({
                  variant: "outline",
                  size: "default",
                  className: "w-full md:w-auto",
                })}
              >
                <SlidersHorizontal />
                Filters
              </PopoverTrigger>
              <PopoverContent
                className="w-[min(94vw,56rem)] p-4"
                align="end"
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <FilterBox icon={<SlidersHorizontal className="size-3.5" />} label="Level">
                    {disableClassificationControls ? (
                      <Input value={disabledControlText.level} readOnly disabled />
                    ) : (
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
                          {facets?.levels.length
                            ? facets.levels.map((level) => (
                                <SelectItem key={level} value={level}>
                                  {level}
                                </SelectItem>
                              ))
                            : null}
                        </SelectContent>
                      </Select>
                    )}
                  </FilterBox>
                  <FilterBox label="Type">
                    {disableClassificationControls ? (
                      <Input value={disabledControlText.type} readOnly disabled />
                    ) : (
                      <Select
                        value={filters.type || ALL_TYPES_VALUE}
                        onValueChange={(value) =>
                          onFilterChange({
                            ...filters,
                            type: value === ALL_TYPES_VALUE ? "" : String(value ?? ""),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL_TYPES_VALUE}>All types</SelectItem>
                          {facets?.types.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FilterBox>
                  <FilterBox label={meta?.logs.mode === "database" ? "Source" : "File"}>
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
                        <SelectItem value={ALL_FILES_VALUE}>
                          {meta?.logs.mode === "database" ? "All sources" : "All files"}
                        </SelectItem>
                        {files.map((file) => (
                          <SelectItem key={file.id} value={file.id}>
                            {file.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterBox>
                  <FilterBox icon={<LayoutPanelTop className="size-3.5" />} label="View">
                    {disableClassificationControls ? (
                      <Input value={disabledControlText.view} readOnly disabled />
                    ) : (
                      <Select
                        value={grouping}
                        onValueChange={(value) => onGroupingChange(value as StudioGroupingMode)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="grouped">Grouped</SelectItem>
                          <SelectItem value="flat">Flat</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
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
                    <DateFilterPicker
                      label="To"
                      value={filters.to}
                      boundary="end"
                      onChange={(value) => onFilterChange({ ...filters, to: value })}
                    />
                  </FilterBox>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button variant="outline" size="sm" onClick={onResetFilters}>
                    <RotateCcw />
                    Reset
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const ALL_LEVELS_VALUE = "__all-levels__";
const ALL_FILES_VALUE = "__all-files__";
const ALL_TYPES_VALUE = "__all-types__";

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
    <div className="grid min-w-0 gap-2">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {icon}
        {label}
      </div>
      {children}
    </div>
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
          onSelect={(nextDate) => {
            onChange(toCalendarFilterValue(nextDate ?? null, boundary));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
