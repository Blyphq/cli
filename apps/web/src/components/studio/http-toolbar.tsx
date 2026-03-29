import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StudioHttpOverview, StudioHttpUiState } from "@/lib/studio";

interface HttpToolbarProps {
  facets: StudioHttpOverview["facets"] | undefined;
  httpUi: StudioHttpUiState;
  onHttpUiChange(next: StudioHttpUiState): void;
  onReset(): void;
}

const ALL_METHODS = "__all_methods__";
const ALL_STATUS_GROUPS = "__all_status_groups__";

export function HttpToolbar({
  facets,
  httpUi,
  onHttpUiChange,
  onReset,
}: HttpToolbarProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
      <Select
        value={httpUi.method || ALL_METHODS}
        onValueChange={(value) =>
          onHttpUiChange({ ...httpUi, method: value === ALL_METHODS ? "" : value })
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="All methods" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_METHODS}>All methods</SelectItem>
          {facets?.methods.map((method) => (
            <SelectItem key={method} value={method}>
              {method}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={httpUi.statusGroup || ALL_STATUS_GROUPS}
        onValueChange={(value) =>
          onHttpUiChange({
            ...httpUi,
            statusGroup: value === ALL_STATUS_GROUPS ? "" : (value as StudioHttpUiState["statusGroup"]),
          })
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_STATUS_GROUPS}>All statuses</SelectItem>
          {facets?.statusGroups.map((group) => (
            <SelectItem key={group} value={group}>
              {group}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        list="http-routes"
        value={httpUi.route}
        onChange={(event) => onHttpUiChange({ ...httpUi, route: event.currentTarget.value })}
        placeholder="Normalized route"
      />
      <datalist id="http-routes">
        {facets?.routes.map((route) => <option key={route} value={route} />)}
      </datalist>
      <Input
        inputMode="numeric"
        value={httpUi.minDurationMs}
        onChange={(event) =>
          onHttpUiChange({
            ...httpUi,
            minDurationMs: event.currentTarget.value.replace(/[^\d]/g, ""),
          })
        }
        placeholder="Min duration (ms)"
      />
      <Button variant="outline" onClick={onReset}>
        Reset
      </Button>
    </div>
  );
}
