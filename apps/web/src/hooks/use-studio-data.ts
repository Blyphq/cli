import { useQuery } from "@tanstack/react-query";
import { useDeferredValue } from "react";

import type {
  StudioErrorSort,
  StudioErrorViewMode,
  StudioFilters,
  StudioGroupingMode,
  StudioSectionId,
  StudioSelection,
} from "@/lib/studio";
import {
  isAllLogsSection,
  isAuthSection,
  isErrorsSection,
  isOverviewSection,
} from "@/lib/studio";
import { useTRPC } from "@/utils/trpc";

export interface UseStudioDataParams {
  projectPath: string;
  filters: StudioFilters;
  offset: number;
  grouping: StudioGroupingMode;
  section: StudioSectionId;
  authUserId: string | null;
  selection: StudioSelection;
  errorView?: StudioErrorViewMode;
  errorSort?: StudioErrorSort;
  errorType?: string;
  errorSourceFile?: string;
  errorTag?: string;
  errorGroupId?: string | null;
}

export function useStudioData({
  projectPath,
  filters,
  offset,
  grouping,
  section,
  authUserId,
  selection,
  errorView = "grouped",
  errorSort = "most-recent",
  errorType = "",
  errorSourceFile = "",
  errorTag = "",
  errorGroupId = null,
}: UseStudioDataParams) {
  const trpc = useTRPC();
  const deferredSearch = useDeferredValue(filters.search);
  const logsSectionId =
    isOverviewSection(section) || isAllLogsSection(section) || isAuthSection(section)
      ? undefined
      : section;

  const metaQuery = useQuery({
    ...trpc.studio.meta.queryOptions({ projectPath }),
    refetchInterval: 1000,
  });

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
      sectionId: logsSectionId,
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
      sectionId: logsSectionId,
    }),
    enabled:
      metaQuery.isSuccess &&
      metaQuery.data.project.valid &&
      !isOverviewSection(section) &&
      !isAuthSection(section) &&
      !isErrorsSection(section),
    refetchInterval: 1000,
  });

  const authQuery = useQuery({
    ...trpc.studio.auth.queryOptions({
      projectPath,
      offset,
      limit: 100,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: deferredSearch || undefined,
      userId: authUserId || undefined,
    }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid && section === "auth",
    refetchInterval: 1000,
  });

  const errorsQuery = useQuery({
    ...trpc.studio.errors.queryOptions({
      projectPath,
      offset,
      limit: 100,
      view: errorView,
      sort: errorSort,
      type: errorType || undefined,
      sourceFile: errorSourceFile || undefined,
      sectionId: errorTag || undefined,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: deferredSearch || undefined,
    }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid && isErrorsSection(section),
    refetchInterval: 1000,
  });

  const errorGroupQuery = useQuery({
    ...trpc.studio.errorGroup.queryOptions({
      projectPath,
      groupId: errorGroupId ?? "",
    }),
    enabled:
      metaQuery.isSuccess &&
      metaQuery.data.project.valid &&
      isErrorsSection(section) &&
      Boolean(errorGroupId),
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
    authQuery.isError ||
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
    authQuery,
    errorsQuery,
    errorGroupQuery,
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
