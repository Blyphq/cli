import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  registerS3Source,
  openS3Dataset,
  waitForS3Dataset,
  extendS3Dataset,
  refreshS3Dataset,
  closeS3Dataset,
  getS3DatasetRecords,
  s3DatasetStatus,
  type S3ReadTransport,
  type S3ReadSettings,
} from "./s3";
import { s3HourPrefix } from "./s3-format";
import { appRouter } from "../routers";
import { createContext } from "../context";

const ids: string[] = [],
  dirs: string[] = [];
afterEach(async () => {
  for (const id of ids.splice(0)) closeS3Dataset(id);
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});
const timestamp = Date.parse("2026-10-21T12:30:00Z");
const range = { from: "2026-10-21T12:00:00Z", to: "2026-10-21T12:59:59Z" };
function batch(messages: string[], time = timestamp) {
  const body = gzipSync(
    messages
      .map((message) =>
        JSON.stringify({
          timestamp: new Date(time).toISOString(),
          message,
          level: message === "boom" ? "error" : "info",
          groupId: "test-group",
        }),
      )
      .join("\n") + "\n",
  );
  const key = `${s3HourPrefix("app", time)}${String(9_999_999_999_999 - time).padStart(13, "0")}-${time}-${time}-${randomUUID()}.ndjson.gz`;
  return {
    object: { key, size: body.length, etag: '"' + randomUUID() + '"' },
    body,
  };
}
function fixture(
  batches: ReturnType<typeof batch>[],
  settings: S3ReadSettings = {},
) {
  const calls = { list: [] as string[], get: [] as string[] };
  const transport: S3ReadTransport = {
    async list(prefix) {
      calls.list.push(prefix);
      return {
        objects: batches
          .filter((b) => b.object.key.startsWith(prefix))
          .map((b) => b.object),
      };
    },
    async get(object) {
      calls.get.push(object.key);
      return (async function* () {
        yield batches.find((b) => b.object.key === object.key)!.body;
      })();
    },
  };
  const source = registerS3Source(
    { bucket: "logs", prefix: "app" },
    {
      identity: randomUUID(),
      transport,
      settings: { ...settings, cache: { mode: "memory" } },
    },
  );
  const open = () => {
    const status = openS3Dataset({ sourceId: source.id, ...range });
    ids.push(status.id);
    return status.id;
  };
  return { calls, transport, source, open };
}
describe("bounded S3 Studio datasets", () => {
  it("reads the golden fixture emitted by the core format-v1 writer", async () => {
    const fixture = JSON.parse(
      readFileSync(new URL("./fixtures/s3-v1.json", import.meta.url), "utf8"),
    );
    const f = fixtureSource();
    function fixtureSource() {
      const body = Buffer.from(fixture.body, "base64");
      const transport: S3ReadTransport = {
        async list() {
          return {
            objects: [
              { key: fixture.key, size: body.length, etag: '"golden"' },
            ],
          };
        },
        async get() {
          return (async function* () {
            yield body;
          })();
        },
      };
      return registerS3Source(
        { bucket: "logs", prefix: "app" },
        {
          identity: randomUUID(),
          transport,
          settings: { cache: { mode: "memory" } },
        },
      );
    }
    const opened = openS3Dataset({ sourceId: f.id, ...range });
    ids.push(opened.id);
    expect((await waitForS3Dataset(opened.id)).complete).toBe(true);
    expect(getS3DatasetRecords(opened.id).records[0]?.message).toBe(
      fixture.record.message,
    );
  });
  it("performs no bucket I/O during source discovery and config responses contain no secrets", async () => {
    const f = fixture([batch(["hello"])]);
    const caller = appRouter.createCaller(
      await createContext({ req: new Request("http://localhost") }),
    );
    const meta = await caller.studio.meta({ sourceId: f.source.id });
    const config = await caller.studio.config({ sourceId: f.source.id });
    await caller.studio.logs({ sourceId: f.source.id });
    expect(meta.logs.mode).toBe("s3");
    expect(config.rawContent).toBeNull();
    expect(f.calls).toEqual({ list: [], get: [] });
    const dir = await mkdtemp(path.join(os.tmpdir(), "studio-s3-"));
    dirs.push(dir);
    await writeFile(
      path.join(dir, "blyp.config.json"),
      JSON.stringify({
        destination: "s3",
        s3: {
          bucket: "logs",
          credentials: {
            accessKeyId: "never-send-this-key",
            secretAccessKey: "never-send-this-secret",
          },
        },
      }),
    );
    const result = await caller.studio.config({ projectPath: dir });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("never-send");
    expect(result.rawContent).toBeNull();
    expect(result.parsedConfig).toBeNull();
    await writeFile(
      path.join(dir, "blyp.config.json"),
      JSON.stringify({
        destination: "s3",
        s3: {
          credentials: {
            accessKeyId: "never-send-this-key",
            secretAccessKey: "never-send-this-secret",
          },
        },
      }),
    );
    let failure: unknown;
    try {
      await caller.studio.meta({ projectPath: dir });
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).toContain(
      "S3 source configuration could not be loaded",
    );
    expect(String(failure)).not.toContain("never-send");
  });

  it("shares one snapshot across all views without extra GETs", async () => {
    const f = fixture([batch(["hello", "boom"])]);
    const id = f.open();
    const status = await waitForS3Dataset(id);
    expect(status.complete).toBe(true);
    expect(status.loadedRecords).toBe(2);
    const caller = appRouter.createCaller(
      await createContext({ req: new Request("http://localhost") }),
    );
    const context = {
      sourceId: f.source.id,
      datasetId: id,
      snapshotVersion: status.version,
    };
    const logs = await caller.studio.logs({
      ...context,
      grouping: "flat",
      limit: 1,
    });
    await Promise.all([
      caller.studio.meta(context),
      caller.studio.files(context),
      caller.studio.logs({ ...context, search: "boom" }),
      caller.studio.logs({ ...context, offset: 1 }),
      caller.studio.overview(context),
      caller.studio.errors(context),
      caller.studio.http(context),
      caller.studio.auth(context),
      caller.studio.agents(context),
      caller.studio.backgroundJobs(context),
      caller.studio.database(context),
      caller.studio.payments(context),
      caller.studio.facets(context),
      caller.studio.group({ ...context, groupId: "test-group" }),
      caller.studio.record({ ...context, recordId: logs.records[0]!.id }),
      caller.studio.recordSource({ ...context, recordId: logs.records[0]!.id }),
    ]);
    expect(f.calls.get).toHaveLength(1);
    expect(f.calls.list).toEqual(["app/v1/2026/10/21/12/"]);
  });

  it("resumes inside an object without duplicate records or another GET", async () => {
    const f = fixture([batch(["a", "b", "c"])], { records: 1, maxGrants: 3 });
    const id = f.open();
    expect((await waitForS3Dataset(id)).state).toBe("partial");
    expect(getS3DatasetRecords(id).records.map((r) => r.message)).toEqual([
      "a",
    ]);
    const originalVersion = s3DatasetStatus(id).version;
    extendS3Dataset(id);
    await waitForS3Dataset(id);
    expect(getS3DatasetRecords(id).records.map((r) => r.message)).toEqual([
      "a",
      "b",
    ]);
    expect(
      getS3DatasetRecords(id, undefined, originalVersion).records.map(
        (r) => r.message,
      ),
    ).toEqual(["a"]);
    extendS3Dataset(id);
    const final = await waitForS3Dataset(id);
    expect(final.complete).toBe(true);
    expect(final.canLoadMore).toBe(false);
    expect(getS3DatasetRecords(id).records.map((r) => r.message)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(f.calls.get).toHaveLength(1);
    expect(() => extendS3Dataset(id)).toThrow("limit");
  });

  it("counts retries and never renews GET or byte allowances through refresh", async () => {
    const b = batch(["hello"]);
    const f = fixture([b], { getAttempts: 1, downloadBytes: b.body.length });
    f.transport.get = async (object) => {
      f.calls.get.push(object.key);
      throw Object.assign(new Error("temporary"), {
        $metadata: { httpStatusCode: 503 },
      });
    };
    const id = f.open();
    const status = await waitForS3Dataset(id);
    expect(status.state).toBe("partial");
    expect(status.getAttempts).toBe(1);
    expect(status.reservedDownloadBytes).toBe(b.body.length);
    for (let i = 0; i < 3; i++) {
      refreshS3Dataset(id);
      await waitForS3Dataset(id);
    }
    expect(f.calls.get).toHaveLength(1);
    f.transport.get = async () =>
      (async function* () {
        yield b.body;
      })();
    extendS3Dataset(id);
    expect((await waitForS3Dataset(id)).complete).toBe(true);
  });

  it("resumes listing pages and coalesces concurrent datasets", async () => {
    const a = batch(["a"]),
      b = batch(["b"]);
    const f = fixture([a, b], { listAttempts: 1 });
    f.transport.list = async (prefix, token) => {
      f.calls.list.push(prefix);
      await new Promise((r) => setTimeout(r, 5));
      return token
        ? { objects: [b.object] }
        : { objects: [a.object], next: "page2" };
    };
    const first = f.open(),
      second = f.open();
    await Promise.all([waitForS3Dataset(first), waitForS3Dataset(second)]);
    // Each physical request is charged to its initiating dataset; shared work is free.
    expect(f.calls.list.length).toBeLessThanOrEqual(2);
    if (!s3DatasetStatus(first).complete) {
      extendS3Dataset(first);
      await waitForS3Dataset(first);
    }
    expect(
      getS3DatasetRecords(first)
        .records.map((r) => r.message)
        .sort(),
    ).toEqual(["a", "b"]);
    expect(new Set(f.calls.get).size).toBe(f.calls.get.length);
  });

  it("keeps out-of-range objects off the wire and rejects malformed gzip safely", async () => {
    const old = batch(["old"], timestamp - 3_600_000),
      bad = batch(["bad"]);
    bad.body = Buffer.from("not gzip");
    bad.object.size = bad.body.length;
    const f = fixture([old, bad]);
    const id = f.open();
    const status = await waitForS3Dataset(id);
    expect(status.state).toBe("error");
    expect(status.complete).toBe(false);
    expect(status.reason).toContain("invalid Blyp format");
    expect(f.calls.get).toEqual([bad.object.key]);
  });

  it("opens an environment-configured source without a valid local project", async () => {
    const previous = process.env.BLYPQ_STUDIO_S3_SOURCE;
    process.env.BLYPQ_STUDIO_S3_SOURCE = "s3://logs/app";
    try {
      const caller = appRouter.createCaller(
        await createContext({ req: new Request("http://localhost") }),
      );
      const meta = await caller.studio.meta({
        projectPath: "/no-such-blyp-project",
      });
      expect(meta.project.valid).toBe(false);
      expect(meta.logs.mode).toBe("s3");
      expect(meta.logs.s3?.hasProject).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.BLYPQ_STUDIO_S3_SOURCE;
      else process.env.BLYPQ_STUDIO_S3_SOURCE = previous;
    }
  });
});
