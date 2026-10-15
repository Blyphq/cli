import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import {
  CalendarDays,
  LayoutPanelTop,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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

interface StudioToolbarProps {
  facets: StudioFacets | undefined;
  files: StudioFile[];
  filters: StudioFilters;
  grouping: StudioGroupingMode;
  meta: StudioMeta | undefined;
  section: StudioSectionId;
  onFilterChange(next: StudioFilters): void;
  onGroupingChange(value: StudioGroupingMode): void;
  onStartStandaloneChat(): void;
  onResetFilters(): void;
}

export function StudioToolbar({
  facets,
  files,
  filters,
  grouping,
  meta,
  section,
  onFilterChange,
  onGroupingChange,
  onStartStandaloneChat,
  onResetFilters,
}: StudioToolbarProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const authMode = section === "auth";
  const backgroundMode = section === "background";
  const httpMode = section === "http";
  const overviewMode = section === "overview";
  const disableClassificationControls = authMode || overviewMode || backgroundMode || httpMode;
  const activeFilterCount = [
    filters.level,
    filters.type,
    filters.fileId,
    filters.from,
    filters.to,
  ].filter(Boolean).length;
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";
      if (typing) {
        return;
      }
      if (event.key === "/" || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="order-last flex min-w-0 flex-1 basis-full items-center justify-end gap-2 sm:order-none sm:basis-auto">
      <label className="group/search relative flex h-8 w-full min-w-0 max-w-[22rem] items-center gap-2 rounded-md border border-border-strong bg-card px-2.5 text-[0.78rem] shadow-xs transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25 hover:border-foreground/20">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="sr-only">Search</span>
        <input
          ref={searchRef}
          value={filters.search}
          onChange={(event) =>
            onFilterChange({ ...filters, search: event.currentTarget.value })
          }
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.blur();
            }
          }}
          placeholder="Message, bindings, data"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/80"
        />
        {filters.search ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onFilterChange({ ...filters, search: "" })}
            className="grid size-5 place-items-center rounded-[4px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        ) : (
          <kbd className="hidden rounded-[3px] bg-muted px-1 font-mono text-[0.62rem] text-muted-foreground sm:inline">
            /
          </kbd>
        )}
      </label>
      <div className="flex shrink-0 items-center gap-2">
            <Popover>
              <PopoverTrigger
                aria-label="Filters"
                className={buttonVariants({
                  variant: "outline",
                  size: "default",
                })}
              >
                <SlidersHorizontal />
                <span className="hidden sm:inline">Filters</span>
                {activeFilterCount > 0 ? (
                  <span className="grid h-4 min-w-4 place-items-center rounded-[4px] bg-primary-soft px-1 font-mono text-[0.6rem] text-primary-soft-foreground">
                    {activeFilterCount}
                  </span>
                ) : null}
              </PopoverTrigger>
              <PopoverContent
                className="w-[min(94vw,44rem)] gap-0 p-0"
                align="end"
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <div className="blyp-eyebrow">Filters</div>
                  <span className="font-mono text-[0.66rem] text-muted-foreground">
                    {activeFilterCount} active
                  </span>
                </div>
                <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
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
                <div className="flex justify-end border-t border-border px-4 py-2.5">
                  <Button variant="ghost" size="sm" onClick={onResetFilters}>
                    <RotateCcw />
                    Reset
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              aria-label="Chat with Blyp"
              variant="outline"
              onClick={onStartStandaloneChat}
            >
              <Sparkles className="text-primary" />
              <span className="hidden md:inline">Ask AI</span>
            </Button>
      </div>
    </div>
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
      <div className="flex items-center gap-1.5 text-[0.7rem] font-medium text-muted-foreground [&>svg]:size-3">
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
            "w-full justify-between px-2.5 text-left text-xs font-normal text-foreground",
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
          <div className="blyp-eyebrow">{label} boundary</div>
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
