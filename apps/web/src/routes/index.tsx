import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { ErrorState } from "@/components/studio/error-state";
import { LogDetailPanel } from "@/components/studio/log-detail-panel";
import { LogFilesPanel } from "@/components/studio/log-files-panel";
import { LogList } from "@/components/studio/log-list";
import { ProjectConfigPanel } from "@/components/studio/project-config-panel";
import { StudioShell } from "@/components/studio/studio-shell";
import { StudioToolbar } from "@/components/studio/studio-toolbar";
import { useTRPC } from "@/utils/trpc";
import type { StudioFilters } from "@/lib/studio";
import { EmptyState } from "@/components/studio/empty-state";

export const Route = createFileRoute("/")({
  validateSearch: z.object({
    project: z.string().optional(),
  }),
  component: StudioRoute,
});

const DEFAULT_FILTERS: StudioFilters = {
  level: "",
  search: "",
  fileId: "",
  from: "",
  to: "",
};

function StudioRoute() {
  const trpc = useTRPC();
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const [draftProjectPath, setDraftProjectPath] = useState(search.project ?? "");
  const [filters, setFilters] = useState<StudioFilters>(DEFAULT_FILTERS);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const deferredSearch = useDeferredValue(filters.search);

  useEffect(() => {
    setDraftProjectPath(search.project ?? "");
  }, [search.project]);

  const metaQuery = useQuery(
    trpc.studio.meta.queryOptions({ projectPath: search.project }),
  );

  const configQuery = useQuery({
    ...trpc.studio.config.queryOptions({ projectPath: search.project }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid,
  });

  const filesQuery = useQuery({
    ...trpc.studio.files.queryOptions({ projectPath: search.project }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid,
  });

  const logsQuery = useQuery({
    ...trpc.studio.logs.queryOptions({
      projectPath: search.project,
      offset,
      limit: 100,
      level: filters.level || undefined,
      search: deferredSearch || undefined,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid,
  });

  const selectedRecord = useMemo(
    () =>
      logsQuery.data?.records.find((record) => record.id === selectedRecordId) ??
      logsQuery.data?.records[0] ??
      null,
    [logsQuery.data?.records, selectedRecordId],
  );

  useEffect(() => {
    if (!logsQuery.data?.records.length) {
      setSelectedRecordId(null);
      return;
    }

    if (!selectedRecordId || !logsQuery.data.records.some((record) => record.id === selectedRecordId)) {
      setSelectedRecordId(logsQuery.data.records[0]?.id ?? null);
    }
  }, [logsQuery.data?.records, selectedRecordId]);

  useEffect(() => {
    setOffset(0);
  }, [filters.level, deferredSearch, filters.fileId, filters.from, filters.to, search.project]);

  const hasBackendError =
    metaQuery.isError || configQuery.isError || filesQuery.isError || logsQuery.isError;

  return (
    <StudioShell
      toolbar={
        <StudioToolbar
          draftProjectPath={draftProjectPath}
          filters={filters}
          meta={metaQuery.data}
          files={filesQuery.data?.files ?? []}
          onDraftProjectPathChange={setDraftProjectPath}
          onInspect={() =>
            navigate({
              search: {
                project: draftProjectPath || undefined,
              },
            })
          }
          onFilterChange={setFilters}
          onResetFilters={() => setFilters(DEFAULT_FILTERS)}
        />
      }
      sidebar={
        <>
          {metaQuery.data ? (
            <ProjectConfigPanel meta={metaQuery.data} config={configQuery.data} />
          ) : (
            <EmptyState title="Loading project metadata" description="Resolving the target project and Blyp config." />
          )}
          {filesQuery.isError ? (
            <ErrorState title="Log discovery failed" description={filesQuery.error.message} />
          ) : (
            <LogFilesPanel
              files={filesQuery.data?.files ?? []}
              activeFileId={filters.fileId}
              onSelectFile={(fileId) => setFilters((current) => ({ ...current, fileId }))}
            />
          )}
        </>
      }
      content={
        hasBackendError ? (
          <ErrorState
            title="Studio backend failed"
            description={
              metaQuery.error?.message ??
              configQuery.error?.message ??
              filesQuery.error?.message ??
              logsQuery.error?.message ??
              "Unknown Studio error"
            }
          />
        ) : metaQuery.data && !metaQuery.data.project.valid ? (
          <ErrorState
            title="Target project is invalid"
            description={metaQuery.data.project.error ?? "Studio could not inspect the requested path."}
          />
        ) : (
          <LogList
            records={logsQuery.data?.records ?? []}
            selectedId={selectedRecordId}
            offset={logsQuery.data?.offset ?? offset}
            limit={logsQuery.data?.limit ?? 100}
            totalMatched={logsQuery.data?.totalMatched ?? 0}
            truncated={logsQuery.data?.truncated ?? false}
            loading={logsQuery.isLoading}
            onSelect={setSelectedRecordId}
            onPageChange={setOffset}
          />
        )
      }
      detail={<LogDetailPanel record={selectedRecord} />}
    />
  );
}
