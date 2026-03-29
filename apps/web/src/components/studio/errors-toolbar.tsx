import type { ReactNode } from "react";

import { Filter, LayoutPanelTop, ListFilter } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
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

const ALL_VALUE = "__all__";

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
}

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
}: ErrorsToolbarProps) {
  return (
    <Card className="border-border/70 bg-card">
      <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
        <FilterBox icon={<LayoutPanelTop className="size-3.5" />} label="View">
          <Select value={viewMode} onValueChange={(value) => onViewModeChange(value as StudioErrorViewMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grouped">Grouped</SelectItem>
              <SelectItem value="raw">Raw</SelectItem>
            </SelectContent>
          </Select>
        </FilterBox>
        <FilterBox icon={<ListFilter className="size-3.5" />} label="Sort">
          <Select value={sort} onValueChange={(value) => onSortChange(value as StudioErrorSort)} disabled={viewMode === "raw"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="most-recent">Most recent</SelectItem>
              <SelectItem value="most-frequent">Most frequent</SelectItem>
              <SelectItem value="first-seen">First seen</SelectItem>
            </SelectContent>
          </Select>
        </FilterBox>
        <FilterBox icon={<Filter className="size-3.5" />} label="Error type">
          <Select
            value={errorType || ALL_VALUE}
            onValueChange={(value) => onErrorTypeChange(value === ALL_VALUE ? "" : String(value ?? ""))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>All error types</SelectItem>
              {errorTypes.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterBox>
        <FilterBox label="Source file">
          <Select
            value={sourceFile || ALL_VALUE}
            onValueChange={(value) => onSourceFileChange(value === ALL_VALUE ? "" : String(value ?? ""))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>All source files</SelectItem>
              {sourceFiles.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterBox>
        <FilterBox label="Section tag">
          <Select
            value={tag || ALL_VALUE}
            onValueChange={(value) => onTagChange(value === ALL_VALUE ? "" : String(value ?? ""))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>All tags</SelectItem>
              {tags.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterBox>
      </CardContent>
    </Card>
  );
}

function FilterBox({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}
