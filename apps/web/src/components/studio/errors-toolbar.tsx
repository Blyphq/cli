import type { ReactNode } from "react";

import { Layers, List } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  StudioErrorSort,
  StudioErrorViewMode,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

const ALL_VALUE = "__all__";

export const ERROR_SORT_OPTIONS: Array<{ value: StudioErrorSort; label: string }> = [
  { value: "most-recent", label: "Most recent" },
  { value: "most-frequent", label: "Most frequent" },
  { value: "first-seen", label: "First seen" },
];

interface ErrorsToolbarProps {
  viewMode: StudioErrorViewMode;
  sort: StudioErrorSort;
  errorType: string;
  sourceFile: string;
  tag: string;
  errorTypes: string[];
  sourceFiles: string[];
  tags: Array<{ id: string; label: string }>;
  onViewModeChange(next: StudioErrorViewMode): void;
  onSortChange(next: StudioErrorSort): void;
  onErrorTypeChange(next: string): void;
  onSourceFileChange(next: string): void;
  onTagChange(next: string): void;
  /** Disable the sort select. Defaults to disabling it in raw mode. */
  sortDisabled?: boolean;
  /** Extra controls rendered at the end of the row (e.g. visibility toggles). */
  trailing?: ReactNode;
  className?: string;
}

/**
 * One tidy row of error controls: a Grouped/Raw segmented control, sort, and
 * type / source / section filters. Matches the header controls (h-8, strong
 * border, card background, xs shadow).
 */
export function ErrorsToolbar({
  viewMode,
  sort,
  errorType,
  sourceFile,
  tag,
  errorTypes,
  sourceFiles,
  tags,
  onViewModeChange,
  onSortChange,
  onErrorTypeChange,
  onSourceFileChange,
  onTagChange,
  sortDisabled,
  trailing,
  className,
}: ErrorsToolbarProps) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      <SegmentedControl
        label="View"
        value={viewMode}
        onValueChange={onViewModeChange}
        options={[
          { value: "grouped", label: "Grouped", icon: <Layers /> },
          { value: "raw", label: "Raw", icon: <List /> },
        ]}
      />
      <ToolbarSelect
        label="Sort"
        value={sort}
        disabled={sortDisabled ?? viewMode === "raw"}
        onValueChange={(value) => onSortChange(value as StudioErrorSort)}
        options={ERROR_SORT_OPTIONS}
      />
      <span aria-hidden className="mx-0.5 hidden h-4 w-px bg-border sm:block" />
      <ToolbarSelect
        label="Type"
        value={errorType || ALL_VALUE}
        onValueChange={(value) => onErrorTypeChange(value === ALL_VALUE ? "" : value)}
        options={[
          { value: ALL_VALUE, label: "All" },
          ...errorTypes.map((item) => ({ value: item, label: item })),
        ]}
      />
      <ToolbarSelect
        label="Source"
        value={sourceFile || ALL_VALUE}
        mono
        onValueChange={(value) => onSourceFileChange(value === ALL_VALUE ? "" : value)}
        options={[
          { value: ALL_VALUE, label: "All" },
          ...sourceFiles.map((item) => ({ value: item, label: item })),
        ]}
      />
      <ToolbarSelect
        label="Section"
        value={tag || ALL_VALUE}
        onValueChange={(value) => onTagChange(value === ALL_VALUE ? "" : value)}
        options={[
          { value: ALL_VALUE, label: "All" },
          ...tags.map((item) => ({ value: item.id, label: item.label })),
        ]}
      />
      {trailing ? <div className="ml-auto flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </div>
  );
}

/** Radio-style segmented control: `rounded-md border bg-muted/60 p-0.5`, active item lifted onto the card. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onValueChange,
  className,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  onValueChange(next: T): void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/60 p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
                return;
              }
              event.preventDefault();
              const index = options.findIndex((item) => item.value === value);
              const delta = event.key === "ArrowRight" ? 1 : -1;
              const next = options[(index + delta + options.length) % options.length]!;
              onValueChange(next.value);
              const siblings = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=radio]");
              siblings?.[options.indexOf(next)]?.focus();
            }}
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-[5px] px-2.5 text-[0.75rem] font-medium outline-none transition-[background-color,color,box-shadow] duration-150 ease-out-expo focus-visible:ring-2 focus-visible:ring-ring/40 [&>svg]:size-3.5",
              active
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.icon ? <span aria-hidden className="contents [&>svg]:size-3.5">{option.icon}</span> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Compact select whose trigger reads "Label  Value", sized like the header controls. */
export function ToolbarSelect({
  label,
  value,
  options,
  onValueChange,
  disabled,
  mono,
  className,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onValueChange(next: string): void;
  disabled?: boolean;
  mono?: boolean;
  className?: string;
}) {
  const selected = options.find((option) => option.value === value);
  const selectedLabel = selected?.label ?? value;
  const isAll = options[0]?.value === value && selected?.label === "All";

  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => onValueChange(next == null ? value : String(next))}
    >
      <SelectTrigger
        aria-label={label}
        className={cn("h-8 w-auto max-w-[15rem] min-w-0 gap-1.5 text-[0.75rem]", className)}
      >
        <SelectValue>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-muted-foreground">{label}</span>
            <span
              className={cn(
                "min-w-0 truncate font-medium",
                isAll ? "text-muted-foreground" : "text-foreground",
                mono && !isAll && "font-mono text-[0.7rem] font-normal",
              )}
            >
              {selectedLabel}
            </span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={`${label}:${option.value}`}
            value={option.value}
            className={mono && option.value !== options[0]?.value ? "font-mono text-[0.7rem]" : undefined}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Two-state toggle button sized like the toolbar controls. */
export function ToolbarToggle({
  pressed,
  onPressedChange,
  children,
  icon,
}: {
  pressed: boolean;
  onPressedChange(next: boolean): void;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[0.75rem] font-medium shadow-xs outline-none transition-[background-color,border-color,color] duration-150 ease-out-expo focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-3.5",
        pressed
          ? "border-primary/30 bg-primary-soft/60 text-foreground [&_svg]:text-primary"
          : "border-border-strong bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
