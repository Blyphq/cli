import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/utils/trpc";
import type { StudioMeta } from "@/lib/studio";

export function useS3Dataset(
  source: StudioMeta["logs"]["s3"],
  projectPath: string,
) {
  const trpc = useTRPC(),
    client = useTRPCClient();
  const [datasetId, setDatasetId] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const generation = useRef(0),
    active = useRef<string | undefined>(undefined);
  useEffect(() => {
    generation.current++;
    setDatasetId(undefined);
    setError(undefined);
    setPending(false);
    const prior = active.current;
    active.current = undefined;
    if (prior)
      void client.studio.closeS3Dataset
        .mutate({ datasetId: prior })
        .catch(() => {});
    return () => {
      const current = active.current;
      active.current = undefined;
      generation.current++;
      if (current)
        void client.studio.closeS3Dataset
          .mutate({ datasetId: current })
          .catch(() => {});
    };
  }, [source?.id, projectPath, client]);
  const statusQuery = useQuery({
    ...trpc.studio.s3DatasetStatus.queryOptions({ datasetId: datasetId ?? "" }),
    enabled: !!datasetId,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.state === "loading" ? 500 : false,
    refetchIntervalInBackground: false,
  });
  const status = statusQuery.data;
  const open = useCallback(
    async (from: string, to: string, follow: boolean) => {
      if (!source) return;
      const token = ++generation.current;
      setPending(true);
      setError(undefined);
      try {
        const result = await client.studio.openS3Dataset.mutate({
          sourceId: source.id,
          from,
          to,
          follow,
        });
        if (token !== generation.current) {
          await client.studio.closeS3Dataset.mutate({ datasetId: result.id });
          return;
        }
        const prior = active.current;
        active.current = result.id;
        setDatasetId(result.id);
        if (prior)
          void client.studio.closeS3Dataset
            .mutate({ datasetId: prior })
            .catch(() => {});
      } catch (e) {
        if (token === generation.current)
          setError(
            e instanceof Error
              ? e.message
              : "Could not load the selected range.",
          );
      } finally {
        if (token === generation.current) setPending(false);
      }
    },
    [source, client],
  );
  const action = useCallback(
    async (kind: "extend" | "refresh" | "cancel") => {
      if (!datasetId) return;
      const token = generation.current;
      setPending(true);
      setError(undefined);
      try {
        if (kind === "extend")
          await client.studio.extendS3Dataset.mutate({ datasetId });
        if (kind === "refresh")
          await client.studio.refreshS3Dataset.mutate({ datasetId });
        if (kind === "cancel")
          await client.studio.cancelS3Dataset.mutate({ datasetId });
        await statusQuery.refetch();
      } catch (e) {
        if (token === generation.current)
          setError(
            e instanceof Error ? e.message : "Could not update the S3 dataset.",
          );
      } finally {
        if (token === generation.current) setPending(false);
      }
    },
    [client, datasetId, statusQuery.refetch],
  );
  useEffect(() => {
    if (
      !datasetId ||
      !source ||
      !status ||
      status.state === "loading" ||
      status.state === "cancelled" ||
      status.state === "error" ||
      status.state === "partial"
    )
      return;
    const timer = setInterval(
      () => {
        if (document.visibilityState === "visible") void action("refresh");
      },
      status.follow
        ? source.refreshIntervalMs
        : source.historicalRefreshIntervalMs,
    );
    return () => clearInterval(timer);
  }, [source, datasetId, status?.follow, status?.state, action]);
  return {
    datasetId,
    status,
    error: error ?? statusQuery.error?.message,
    pending,
    open,
    extend: () => action("extend"),
    refresh: () => action("refresh"),
    cancel: () => action("cancel"),
  };
}
