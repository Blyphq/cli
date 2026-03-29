import { useQuery } from "@tanstack/react-query";
import { useDeferredValue } from "react";

import type {
  StudioErrorUiState,
  StudioFilters,
  StudioGroupingMode,
  StudioHttpUiState,
  StudioSectionId,
  StudioSelection,
} from "@/lib/studio";
import {
  isAllLogsSection,
  isAuthSection,
  isBackgroundSection,
  isDatabaseSection,
  isErrorsSection,
  isHttpSection,
  isOverviewSection,
} from "@/lib/studio";
import { useTRPC } from "@/utils/trpc";

export interface UseStudioDataParams {
  projectPath: string;
  filters: StudioFilters;
  offset: number;
  grouping: StudioGroupingMode;
  section: StudioSectionId;
  errorUi: StudioErrorUiState;
  httpUi: StudioHttpUiState;
  authUserId: string | null;
  selection: StudioSelection;
}

export function useStudioData({
  projectPath,
  filters,
  offset,
  grouping,
  section,
  errorUi,
  httpUi,
  authUserId,
  selection,
}: UseStudioDataParams) {
  const trpc = useTRPC();
  const deferredSearch = useDeferredValue(filters.search);
  const logsSectionId =
    isOverviewSection(section) ||
    isAllLogsSection(section) ||
    isAuthSection(section) ||
    isDatabaseSection(section) ||
    isBackgroundSection(section) ||
    isHttpSection(section) ||
    isErrorsSection(section)
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
      !isBackgroundSection(section) &&
      !isDatabaseSection(section) &&
      !isHttpSection(section) &&
      !isErrorsSection(section),
    refetchInterval: 1000,
  });

  const httpQuery = useQuery({
    ...trpc.studio.http.queryOptions({
      projectPath,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: deferredSearch || undefined,
      offset,
      limit: 100,
      method: httpUi.method || undefined,
      statusGroup: httpUi.statusGroup || undefined,
      route: httpUi.route || undefined,
      minDurationMs: httpUi.minDurationMs ? Number(httpUi.minDurationMs) : undefined,
    }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid && isHttpSection(section),
    refetchInterval: 1000,
  });

  const errorsQuery = useQuery({
    ...trpc.studio.errors.queryOptions({
      projectPath,
      offset,
      limit: 100,
      view: errorUi.view,
      sort: errorUi.sort,
      type: errorUi.type || undefined,
      sourceFile: errorUi.sourceFile || undefined,
      search: deferredSearch || undefined,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      sectionId: errorUi.sectionTag || undefined,
    }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid && isErrorsSection(section),
    refetchInterval: 1000,
  });

  const overviewQuery = useQuery({
    ...trpc.studio.overview.queryOptions({
      projectPath,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: deferredSearch || undefined,
    }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid && isOverviewSection(section),
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

  const backgroundJobsQuery = useQuery({
    ...trpc.studio.backgroundJobs.queryOptions({
      projectPath,
      offset,
      limit: 100,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: deferredSearch || undefined,
    }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid && section === "background",
    refetchInterval: 1000,
  });

  const databaseQuery = useQuery({
    ...trpc.studio.database.queryOptions({
      projectPath,
      offset,
      limit: 100,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: deferredSearch || undefined,
    }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid && section === "database",
    refetchInterval: 1000,
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

  const errorGroupQuery = useQuery({
    ...trpc.studio.errorGroup.queryOptions({
      projectPath,
      fingerprint: selection?.kind === "error-group" ? selection.id : "",
    }),
    enabled:
      metaQuery.isSuccess &&
      metaQuery.data.project.valid &&
      selection?.kind === "error-group",
  });

  const backgroundJobRunQuery = useQuery({
    ...trpc.studio.backgroundJobRun.queryOptions({
      projectPath,
      runId: selection?.kind === "background-run" ? selection.id : "",
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: deferredSearch || undefined,
    }),
    enabled:
      metaQuery.isSuccess &&
      metaQuery.data.project.valid &&
      selection?.kind === "background-run",
  });

  const recordQuery = useQuery({
    ...trpc.studio.record.queryOptions({
      projectPath,
      recordId:
        selection?.kind === "record" || selection?.kind === "error-occurrence"
          ? selection.id
          : "",
    }),
    enabled:
      metaQuery.isSuccess &&
      metaQuery.data.project.valid &&
      (selection?.kind === "record" || selection?.kind === "error-occurrence"),
  });

  const recordSourceQuery = useQuery({
    ...trpc.studio.recordSource.queryOptions({
      projectPath,
      recordId:
        selection?.kind === "record" || selection?.kind === "error-occurrence"
          ? selection.id
          : "",
    }),
    enabled:
      metaQuery.isSuccess &&
      metaQuery.data.project.valid &&
      (selection?.kind === "record" || selection?.kind === "error-occurrence"),
  });

  const assistantStatusQuery = useQuery(
    trpc.studio.assistantStatus.queryOptions({ projectPath }),
  );

  const files = filesQuery.data?.files ?? [];
  const entries = logsQuery.data?.entries ?? [];
  const selectedRecord =
    selection?.kind === "record" || selection?.kind === "error-occurrence"
      ? recordQuery.data ?? null
      : null;
  const selectedGroup =
    selection?.kind === "group" ? groupQuery.data ?? null : null;
  const selectedBackgroundRun =
    selection?.kind === "background-run" ? backgroundJobRunQuery.data ?? null : null;
  const selectedErrorGroup =
    selection?.kind === "error-group" ? errorGroupQuery.data ?? null : null;

  const isLoadingMeta = !metaQuery.data && metaQuery.isLoading;
  const isProjectInvalid = Boolean(metaQuery.data && !metaQuery.data.project.valid);
  const projectError =
    metaQuery.data?.project.error ??
    "Studio could not inspect the requested path.";
  const hasLogsError =
    filesQuery.isError ||
    logsQuery.isError ||
    errorsQuery.isError ||
    overviewQuery.isError ||
    authQuery.isError ||
    backgroundJobsQuery.isError ||
    httpQuery.isError ||
    backgroundJobRunQuery.isError ||
    databaseQuery.isError ||
    groupQuery.isError ||
    errorGroupQuery.isError ||
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
    httpQuery,
    errorsQuery,
    overviewQuery,
    authQuery,
    backgroundJobsQuery,
    backgroundJobRunQuery,
    databaseQuery,
    groupQuery,
    errorGroupQuery,
    recordQuery,
    recordSourceQuery,
    assistantStatusQuery,
    files,
    entries,
    selectedRecord,
    selectedGroup,
    selectedBackgroundRun,
    selectedErrorGroup,
    isLoadingMeta,
    isProjectInvalid,
    projectError,
    hasBackendError,
    fallbackModel,
    deferredSearch,
  };
}
