import { useQuery } from "@tanstack/react-query";
import { useDeferredValue } from "react";

import type { StudioFilters, StudioGroupingMode, StudioSelection } from "@/lib/studio";
import { useTRPC } from "@/utils/trpc";

export interface UseStudioDataParams {
  projectPath: string;
  filters: StudioFilters;
  offset: number;
  grouping: StudioGroupingMode;
  selection: StudioSelection;
}

export function useStudioData({
  projectPath,
  filters,
  offset,
  grouping,
  selection,
}: UseStudioDataParams) {
  const trpc = useTRPC();
  const deferredSearch = useDeferredValue(filters.search);

  const metaQuery = useQuery(trpc.studio.meta.queryOptions({ projectPath }));

  const configQuery = useQuery({
    ...trpc.studio.config.queryOptions({ projectPath }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid,
  });

  const filesQuery = useQuery({
    ...trpc.studio.files.queryOptions({ projectPath }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid,
  });

  const facetsQuery = useQuery({
    ...trpc.studio.facets.queryOptions({
      projectPath,
      level: filters.level || undefined,
      search: deferredSearch || undefined,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid,
  });

  const logsQuery = useQuery({
    ...trpc.studio.logs.queryOptions({
      projectPath,
      offset,
      limit: 100,
      grouping,
      level: filters.level || undefined,
      type: filters.type || undefined,
      search: deferredSearch || undefined,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid,
  });

  const groupQuery = useQuery({
    ...trpc.studio.group.queryOptions({
      projectPath,
      groupId: selection?.kind === "group" ? selection.id : "",
    }),
    enabled:
      metaQuery.isSuccess &&
      metaQuery.data.project.valid &&
      selection?.kind === "group",
  });

  const recordQuery = useQuery({
    ...trpc.studio.record.queryOptions({
      projectPath,
      recordId: selection?.kind === "record" ? selection.id : "",
    }),
    enabled:
      metaQuery.isSuccess &&
      metaQuery.data.project.valid &&
      selection?.kind === "record",
  });

  const recordSourceQuery = useQuery({
    ...trpc.studio.recordSource.queryOptions({
      projectPath,
      recordId: selection?.kind === "record" ? selection.id : "",
    }),
    enabled:
      metaQuery.isSuccess &&
      metaQuery.data.project.valid &&
      selection?.kind === "record",
  });

  const assistantStatusQuery = useQuery(
    trpc.studio.assistantStatus.queryOptions({ projectPath }),
  );

  const files = filesQuery.data?.files ?? [];
  const entries = logsQuery.data?.entries ?? [];
  const selectedRecord =
    selection?.kind === "record" ? recordQuery.data ?? null : null;
  const selectedGroup =
    selection?.kind === "group" ? groupQuery.data ?? null : null;

  const isLoadingMeta = !metaQuery.data && metaQuery.isLoading;
  const isProjectInvalid = Boolean(metaQuery.data && !metaQuery.data.project.valid);
  const projectError =
    metaQuery.data?.project.error ??
    "Studio could not inspect the requested path.";
  const hasLogsError =
    filesQuery.isError ||
    logsQuery.isError ||
    groupQuery.isError ||
    recordQuery.isError;
  const hasBackendError =
    metaQuery.isError || configQuery.isError || hasLogsError;
  const fallbackModel =
    assistantStatusQuery.data?.model ??
    assistantStatusQuery.data?.availableModels[0] ??
    "";

  return {
    metaQuery,
    configQuery,
    filesQuery,
    facetsQuery,
    logsQuery,
    groupQuery,
    recordQuery,
    recordSourceQuery,
    assistantStatusQuery,
    files,
    entries,
    selectedRecord,
    selectedGroup,
    isLoadingMeta,
    isProjectInvalid,
    projectError,
    hasBackendError,
    fallbackModel,
    deferredSearch,
  };
}
