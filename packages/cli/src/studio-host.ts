import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { access, readFile, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";

import { resolvePackagedStudioPaths } from "./lib/studio-server.js";

type StudioServerModule = {
  fetch(request: Request): Promise<Response>;
};

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3003;

async function main(): Promise<void> {
  const studioPaths = await resolvePackagedStudioPaths();

  if (!studioPaths) {
    throw new Error("Packaged Studio assets were not found.");
  }

  const host = process.env.BLYPQ_STUDIO_HOST ?? DEFAULT_HOST;
  const port = Number.parseInt(process.env.BLYPQ_STUDIO_PORT ?? `${DEFAULT_PORT}`, 10);
  const serverModule = (await import(
    pathToFileURL(studioPaths.serverEntryPath).href
  )) as { default: StudioServerModule };
  const studioServer = serverModule.default;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? `${host}:${port}`}`);
      const staticFilePath = await resolveStaticFilePath(studioPaths.clientRoot, requestUrl.pathname);

      if (staticFilePath) {
        await writeStaticResponse(staticFilePath, req.method ?? "GET", res);
        return;
      }

      const request = createFetchRequest(req, requestUrl);
      const response = await studioServer.fetch(request);
      await writeFetchResponse(response, res);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Studio server failed.";
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end(message);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    const shutdown = () => {
      server.close(() => {
        resolve();
      });
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

function createFetchRequest(
  req: IncomingMessage,
  requestUrl: URL,
): Request {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "undefined") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }

    headers.set(key, value);
  }

  const method = req.method ?? "GET";
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : (Readable.toWeb(req) as unknown as NonNullable<RequestInit["body"]>);

  return new Request(requestUrl, {
    method,
    headers,
    body,
    duplex: body ? "half" : undefined,
  });
}

async function writeFetchResponse(
  response: Response,
  res: ServerResponse,
): Promise<void> {
  res.statusCode = response.status;

  for (const [key, value] of response.headers.entries()) {
    res.setHeader(key, value);
  }

  if (!response.body) {
    res.end();
    return;
  }

  const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
  await new Promise<void>((resolve, reject) => {
    nodeStream.on("error", reject);
    res.on("error", reject);
    res.on("finish", resolve);
    nodeStream.pipe(res);
  });
}

async function resolveStaticFilePath(
  clientRoot: string,
  requestPathname: string,
): Promise<string | null> {
  const pathname = normalizePathname(requestPathname);
  const candidatePath = path.join(clientRoot, pathname);
  const resolvedPath = path.resolve(candidatePath);
  const resolvedClientRoot = path.resolve(clientRoot);

  if (!resolvedPath.startsWith(`${resolvedClientRoot}${path.sep}`) && resolvedPath !== resolvedClientRoot) {
    return null;
  }

  if (!(await pathExists(resolvedPath))) {
    return null;
  }

  const targetStat = await stat(resolvedPath);

  if (!targetStat.isFile()) {
    return null;
  }

  return resolvedPath;
}

function normalizePathname(requestPathname: string): string {
  const decodedPath = decodeURIComponent(requestPathname);
  return decodedPath.replace(/^\/+/, "");
}

async function writeStaticResponse(
  targetPath: string,
  method: string,
  res: ServerResponse,
): Promise<void> {
  const contents = method === "HEAD" ? null : await readFile(targetPath);
  res.statusCode = 200;
  res.setHeader("content-type", getContentType(targetPath));

  if (contents) {
    res.setHeader("content-length", Buffer.byteLength(contents));
    res.end(contents);
    return;
  }

  const targetStat = await stat(targetPath);
  res.setHeader("content-length", targetStat.size);
  res.end();
}

function getContentType(targetPath: string): string {
  const extension = path.extname(targetPath).toLowerCase();

  switch (extension) {
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".ico":
      return "image/x-icon";
    case ".woff2":
      return "font/woff2";
    case ".map":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

void main();
