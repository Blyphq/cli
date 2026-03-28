import { useQuery } from "@tanstack/react-query";
import { useDeferredValue } from "react";

import type {
  StudioFilters,
  StudioGroupingMode,
  StudioSectionId,
  StudioSelection,
} from "@/lib/studio";
import { isAllLogsSection, isAuthSection, isOverviewSection } from "@/lib/studio";
import { useTRPC } from "@/utils/trpc";

export interface UseStudioDataParams {
  projectPath: string;
  filters: StudioFilters;
  offset: number;
  grouping: StudioGroupingMode;
  section: StudioSectionId;
  authUserId: string | null;
  selection: StudioSelection;
}

export function useStudioData({
  projectPath,
  filters,
  offset,
  grouping,
  section,
  authUserId,
  selection,
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

  const deliveryStatusQuery = useQuery({
    ...trpc.studio.deliveryStatus.queryOptions({
      projectPath,
      limit: 50,
      offset: 0,
      connectorKey: selection?.kind === "delivery" ? selection.connectorKey : undefined,
    }),
    enabled: metaQuery.isSuccess,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
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
      !isAuthSection(section),
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
    deliveryStatusQuery,
    facetsQuery,
    logsQuery,
    authQuery,
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
