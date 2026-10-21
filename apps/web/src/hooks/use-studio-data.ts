import { useS3Dataset } from "./use-s3-dataset";
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
  isAgentsSection,
  isHttpSection,
  isOverviewSection,
  isPaymentsSection,
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
    isAgentsSection(section) ||
    isBackgroundSection(section) ||
    isPaymentsSection(section) ||
    isHttpSection(section) ||
    isErrorsSection(section)
      ? undefined
      : section;

  const initialMetaQuery = useQuery({
    ...trpc.studio.meta.queryOptions({ projectPath }),
    refetchInterval: query => query.state.data?.logs.mode === "s3" ? false : 1000,
  });
  const s3Dataset = useS3Dataset(initialMetaQuery.data?.logs.s3, projectPath);
  const isS3 = initialMetaQuery.data?.logs.mode === "s3";
  const sourceContext = { sourceId: initialMetaQuery.data?.logs.s3?.id, datasetId: s3Dataset.datasetId, snapshotVersion: s3Dataset.status?.version };
  const snapshotMetaQuery = useQuery({
    ...trpc.studio.meta.queryOptions({ projectPath, ...sourceContext }),
    enabled: isS3 && !!s3Dataset.datasetId && (s3Dataset.status?.version ?? 0) > 0,
  });
  const metaQuery = { ...initialMetaQuery, data: snapshotMetaQuery.data ?? initialMetaQuery.data };
  const canRead = metaQuery.isSuccess && (isS3 ? !!s3Dataset.datasetId && (s3Dataset.status?.version ?? 0) > 0 : !!metaQuery.data?.project.valid);
  const pollInterval = isS3 ? false : 1000;

  const configQuery = useQuery({
    ...trpc.studio.config.queryOptions({ projectPath, ...sourceContext }),
    enabled: metaQuery.isSuccess,
  });

  const filesQuery = useQuery({
    ...trpc.studio.files.queryOptions({ projectPath, ...sourceContext }),
    enabled: canRead,
  });

  const facetsQuery = useQuery({
    ...trpc.studio.facets.queryOptions({
      projectPath, ...sourceContext,
      level: filters.level || undefined,
      search: deferredSearch || undefined,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      sectionId: logsSectionId,
    }),
    enabled: canRead,
  });

  const logsQuery = useQuery({
    ...trpc.studio.logs.queryOptions({
      projectPath, ...sourceContext,
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
      canRead &&
      !isOverviewSection(section) &&
      !isAuthSection(section) &&
      !isAgentsSection(section) &&
      !isBackgroundSection(section) &&
      !isPaymentsSection(section) &&
      !isDatabaseSection(section) &&
      !isHttpSection(section) &&
      !isErrorsSection(section),
    refetchInterval: pollInterval,
  });

  const httpQuery = useQuery({
    ...trpc.studio.http.queryOptions({
      projectPath, ...sourceContext,
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
    enabled: canRead && isHttpSection(section),
    refetchInterval: pollInterval,
  });

  const errorsQuery = useQuery({
    ...trpc.studio.errors.queryOptions({
      projectPath, ...sourceContext,
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
    enabled: canRead && isErrorsSection(section),
    refetchInterval: pollInterval,
  });

  const overviewQuery = useQuery({
    ...trpc.studio.overview.queryOptions({
      projectPath, ...sourceContext,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: deferredSearch || undefined,
    }),
    enabled: canRead && isOverviewSection(section),
    refetchInterval: pollInterval,
  });

  const authQuery = useQuery({
    ...trpc.studio.auth.queryOptions({
      projectPath, ...sourceContext,
      offset,
      limit: 100,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: deferredSearch || undefined,
      userId: authUserId || undefined,
    }),
    enabled: canRead && section === "auth",
    refetchInterval: pollInterval,
  });

  const backgroundJobsQuery = useQuery({
    ...trpc.studio.backgroundJobs.queryOptions({
      projectPath, ...sourceContext,
      offset,
      limit: 100,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: deferredSearch || undefined,
    }),
    enabled: canRead && section === "background",
    refetchInterval: pollInterval,
  });

  const paymentsQuery = useQuery({
    ...trpc.studio.payments.queryOptions({
      projectPath, ...sourceContext,
      offset,
      limit: 100,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: deferredSearch || undefined,
    }),
    enabled: canRead && isPaymentsSection(section),
    refetchInterval: pollInterval,
  });

  const paymentTraceQuery = useQuery({
    ...trpc.studio.paymentTrace.queryOptions({
      projectPath, ...sourceContext,
      traceId: selection?.kind === "payment-trace" ? selection.id : "",
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: deferredSearch || undefined,
    }),
    enabled:
      canRead &&
      selection?.kind === "payment-trace",
  });

  const databaseQuery = useQuery({
    ...trpc.studio.database.queryOptions({
      projectPath, ...sourceContext,
      offset,
      limit: 100,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: deferredSearch || undefined,
    }),
    enabled: canRead && section === "database",
    refetchInterval: pollInterval,
  });

  const agentsQuery = useQuery({
    ...trpc.studio.agents.queryOptions({
      projectPath, ...sourceContext,
      offset,
      limit: 100,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: deferredSearch || undefined,
    }),
    enabled: canRead && isAgentsSection(section),
    refetchInterval: pollInterval,
  });

  const agentTaskQuery = useQuery({
    ...trpc.studio.agentTask.queryOptions({
      projectPath, ...sourceContext,
      taskId: selection?.kind === "agent-task" ? selection.id : "",
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: deferredSearch || undefined,
    }),
    enabled:
      canRead &&
      selection?.kind === "agent-task",
  });

  const groupQuery = useQuery({
    ...trpc.studio.group.queryOptions({
      projectPath, ...sourceContext,
      groupId: selection?.kind === "group" ? selection.id : "",
    }),
    enabled:
      canRead &&
      selection?.kind === "group",
  });

  const errorGroupQuery = useQuery({
    ...trpc.studio.errorGroup.queryOptions({
      projectPath, ...sourceContext,
      fingerprint: selection?.kind === "error-group" ? selection.id : "",
    }),
    enabled:
      canRead &&
      selection?.kind === "error-group",
  });

  const backgroundJobRunQuery = useQuery({
    ...trpc.studio.backgroundJobRun.queryOptions({
      projectPath, ...sourceContext,
      runId: selection?.kind === "background-run" ? selection.id : "",
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: deferredSearch || undefined,
    }),
    enabled:
      canRead &&
      selection?.kind === "background-run",
  });

  const recordQuery = useQuery({
    ...trpc.studio.record.queryOptions({
      projectPath, ...sourceContext,
      recordId:
        selection?.kind === "record" || selection?.kind === "error-occurrence"
          ? selection.id
          : "",
    }),
    enabled:
      canRead &&
      (selection?.kind === "record" || selection?.kind === "error-occurrence"),
  });

  const recordSourceQuery = useQuery({
    ...trpc.studio.recordSource.queryOptions({
      projectPath, ...sourceContext,
      recordId:
        selection?.kind === "record" || selection?.kind === "error-occurrence"
          ? selection.id
          : "",
    }),
    enabled:
      canRead &&
      (selection?.kind === "record" || selection?.kind === "error-occurrence"),
  });

  const assistantStatusQuery = useQuery(
    trpc.studio.assistantStatus.queryOptions({ projectPath, ...sourceContext }),
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
  const selectedPaymentTrace =
    selection?.kind === "payment-trace" ? paymentTraceQuery.data ?? null : null;
  const selectedErrorGroup =
    selection?.kind === "error-group" ? errorGroupQuery.data ?? null : null;

  const isLoadingMeta = !metaQuery.data && metaQuery.isLoading;
  const isProjectInvalid = Boolean(metaQuery.data && !metaQuery.data.project.valid && !isS3);
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
    paymentsQuery.isError ||
    paymentTraceQuery.isError ||
    httpQuery.isError ||
    backgroundJobRunQuery.isError ||
    databaseQuery.isError ||
    agentsQuery.isError ||
    agentTaskQuery.isError ||
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
    s3Dataset,
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
    paymentsQuery,
    paymentTraceQuery,
    backgroundJobRunQuery,
    databaseQuery,
    agentsQuery,
    agentTaskQuery,
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
    selectedAgentTask:
      selection?.kind === "agent-task" ? agentTaskQuery.data ?? null : null,
    selectedPaymentTrace,
    selectedErrorGroup,
    isLoadingMeta,
    isProjectInvalid,
    projectError,
    hasBackendError,
    fallbackModel,
    deferredSearch,
  };
}
