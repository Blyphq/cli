import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useState } from "react";
import { z } from "zod";

import { AssistantPanel } from "@/components/studio/assistant-panel";
import { EmptyState } from "@/components/studio/empty-state";
import { ErrorState } from "@/components/studio/error-state";
import { GroupDetailPanel } from "@/components/studio/group-detail-panel";
import { LogDetailPanel } from "@/components/studio/log-detail-panel";
import { LogFilesPanel } from "@/components/studio/log-files-panel";
import { LogList } from "@/components/studio/log-list";
import { ProjectConfigPanel } from "@/components/studio/project-config-panel";
import { StudioShell } from "@/components/studio/studio-shell";
import { StudioToolbar } from "@/components/studio/studio-toolbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  StudioAssistantMessage,
  StudioAssistantReference,
  StudioFilters,
  StudioGroupingMode,
  StudioSelection,
} from "@/lib/studio";
import { isGroupEntry } from "@/lib/studio";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/")({
  validateSearch: z.object({
    project: z.string().optional(),
  }),
  component: StudioRoute,
});

const DEFAULT_FILTERS: StudioFilters = {
  level: "",
  type: "",
  search: "",
  fileId: "",
  from: "",
  to: "",
};

type ChatMessage =
  | StudioAssistantMessage
  | {
      id: string;
      role: "user";
      content: string;
    };

function StudioRoute() {
  const trpc = useTRPC();
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const [draftProjectPath, setDraftProjectPath] = useState(search.project ?? "");
  const [filters, setFilters] = useState<StudioFilters>(DEFAULT_FILTERS);
  const [selection, setSelection] = useState<StudioSelection>(null);
  const [offset, setOffset] = useState(0);
  const [grouping, setGrouping] = useState<StudioGroupingMode>("grouped");
  const [assistantTab, setAssistantTab] = useState<"details" | "assistant">("details");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const deferredSearch = useDeferredValue(filters.search);

  useEffect(() => {
    setDraftProjectPath(search.project ?? "");
  }, [search.project]);

  const metaQuery = useQuery(trpc.studio.meta.queryOptions({ projectPath: search.project }));

  const configQuery = useQuery({
    ...trpc.studio.config.queryOptions({ projectPath: search.project }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid,
  });

  const filesQuery = useQuery({
    ...trpc.studio.files.queryOptions({ projectPath: search.project }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid,
  });

  const facetsQuery = useQuery({
    ...trpc.studio.facets.queryOptions({
      projectPath: search.project,
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
      projectPath: search.project,
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
      projectPath: search.project,
      groupId: selection?.kind === "group" ? selection.id : "",
    }),
    enabled:
      metaQuery.isSuccess &&
      metaQuery.data.project.valid &&
      selection?.kind === "group",
  });

  const recordQuery = useQuery({
    ...trpc.studio.record.queryOptions({
      projectPath: search.project,
      recordId: selection?.kind === "record" ? selection.id : "",
    }),
    enabled:
      metaQuery.isSuccess &&
      metaQuery.data.project.valid &&
      selection?.kind === "record",
  });

  const assistantStatusQuery = useQuery(
    trpc.studio.assistantStatus.queryOptions({ projectPath: search.project }),
  );
  const assistantReplyMutation = useMutation(
    trpc.studio.assistantReply.mutationOptions(),
  );
  const describeSelectionMutation = useMutation(
    trpc.studio.describeSelection.mutationOptions(),
  );

  const files = filesQuery.data?.files ?? [];
  const entries = logsQuery.data?.entries ?? [];
  const selectedRecord = selection?.kind === "record" ? recordQuery.data ?? null : null;
  const selectedGroup = selection?.kind === "group" ? groupQuery.data ?? null : null;
  const isLoadingMeta = !metaQuery.data && metaQuery.isLoading;
  const isProjectInvalid = Boolean(metaQuery.data && !metaQuery.data.project.valid);
  const projectError =
    metaQuery.data?.project.error ?? "Studio could not inspect the requested path.";
  const hasLogsError = filesQuery.isError || logsQuery.isError || groupQuery.isError || recordQuery.isError;
  const hasBackendError = metaQuery.isError || configQuery.isError || hasLogsError;
  const selectionLabel =
    selection?.kind === "record"
      ? "Selected log"
      : selection?.kind === "group"
        ? "Selected structured group"
        : "No selection";

  useEffect(() => {
    if (!logsQuery.data?.entries.length) {
      setSelection(null);
      return;
    }

    if (!selection || !logsQuery.data.entries.some((entry) => entry.id === selection.id)) {
      const firstEntry = logsQuery.data.entries[0];
      if (!firstEntry) {
        setSelection(null);
        return;
      }

      setSelection(
        isGroupEntry(firstEntry)
          ? { kind: "group", id: firstEntry.id }
          : { kind: "record", id: firstEntry.id },
      );
    }
  }, [logsQuery.data?.entries, selection]);

  useEffect(() => {
    setOffset(0);
  }, [
    filters.level,
    filters.type,
    deferredSearch,
    filters.fileId,
    filters.from,
    filters.to,
    search.project,
    grouping,
  ]);

  const buildAssistantInput = () => ({
    projectPath: search.project,
    history: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    filters: {
      level: filters.level || undefined,
      type: filters.type || undefined,
      search: deferredSearch || undefined,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    },
    selectedRecordId: selection?.kind === "record" ? selection.id : undefined,
    selectedGroupId: selection?.kind === "group" ? selection.id : undefined,
  });

  const submitAssistantPrompt = async (content: string) => {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };

    setAssistantTab("assistant");
    setMessages((current) => [...current, userMessage]);

    const response = await assistantReplyMutation.mutateAsync({
      ...buildAssistantInput(),
      history: [...messages, userMessage].map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });

    setMessages((current) => [...current, response]);
  };

  const describeSelection = async () => {
    if (!selection) {
      return;
    }

    setAssistantTab("assistant");
    const response = await describeSelectionMutation.mutateAsync(buildAssistantInput());
    setMessages((current) => [...current, response]);
  };

  const handleReferenceSelect = (reference: StudioAssistantReference) => {
    setSelection({
      kind: reference.kind === "group" ? "group" : "record",
      id: reference.id,
    });
  };

  return (
    <StudioShell
      toolbar={
        <StudioToolbar
          draftProjectPath={draftProjectPath}
          facets={facetsQuery.data}
          filters={filters}
          grouping={grouping}
          meta={metaQuery.data}
          files={files}
          onDraftProjectPathChange={setDraftProjectPath}
          onInspect={() =>
            navigate({
              search: {
                project: draftProjectPath || undefined,
              },
            })
          }
          onFilterChange={setFilters}
          onGroupingChange={setGrouping}
          onResetFilters={() => setFilters(DEFAULT_FILTERS)}
        />
      }
      sidebar={
        <>
          {metaQuery.data ? (
            <ProjectConfigPanel meta={metaQuery.data} config={configQuery.data} />
          ) : (
            <EmptyState
              title="Loading project metadata"
              description="Resolving the target project and Blyp config."
              size="compact"
            />
          )}
          {filesQuery.isError ? (
            <ErrorState
              title="Log discovery failed"
              description={filesQuery.error.message}
              size="compact"
            />
          ) : (
            <LogFilesPanel
              files={files}
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
              groupQuery.error?.message ??
              recordQuery.error?.message ??
              "Unknown Studio error"
            }
          />
        ) : isProjectInvalid ? (
          <ErrorState title="Target project is invalid" description={projectError} />
        ) : isLoadingMeta ? (
          <EmptyState
            title="Loading Studio"
            description="Resolving project metadata, config, and logs."
          />
        ) : (
          <LogList
            entries={entries}
            selection={selection}
            offset={logsQuery.data?.offset ?? offset}
            limit={logsQuery.data?.limit ?? 100}
            totalEntries={logsQuery.data?.totalEntries ?? 0}
            totalMatched={logsQuery.data?.totalMatched ?? 0}
            truncated={logsQuery.data?.truncated ?? false}
            loading={logsQuery.isLoading}
            onSelect={setSelection}
            onPageChange={setOffset}
          />
        )
      }
      detail={
        <Tabs value={assistantTab} className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="details" onClick={() => setAssistantTab("details")}>
                Details
              </TabsTrigger>
              <TabsTrigger value="assistant" onClick={() => setAssistantTab("assistant")}>
                Assistant
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="details">
            {selection?.kind === "group" ? (
              <GroupDetailPanel
                group={selectedGroup}
                loading={groupQuery.isLoading}
                onDescribeWithAi={() => {
                  void describeSelection();
                }}
                onSelectRecord={(recordId) => {
                  setSelection({ kind: "record", id: recordId });
                }}
              />
            ) : (
              <LogDetailPanel
                record={selectedRecord}
                onDescribeWithAi={() => {
                  void describeSelection();
                }}
              />
            )}
          </TabsContent>
          <TabsContent value="assistant">
            <AssistantPanel
              busy={assistantReplyMutation.isPending || describeSelectionMutation.isPending}
              messages={messages}
              selectionLabel={selectionLabel}
              status={assistantStatusQuery.data}
              onDescribeSelection={() => {
                void describeSelection();
              }}
              onReferenceSelect={handleReferenceSelect}
              onSend={(content) => {
                void submitAssistantPrompt(content);
              }}
              onQuickAction={(prompt) => {
                void submitAssistantPrompt(prompt);
              }}
            />
          </TabsContent>
        </Tabs>
      }
    />
  );
}
