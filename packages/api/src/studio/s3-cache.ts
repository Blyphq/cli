import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  stat,
  unlink,
  utimes,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { S3ReadSettings } from "./s3-format";

export class S3ObjectCache {
  private memory = new Map<string, { body: Buffer; at: number }>();
  private bytes = 0;
  private maintenance: Promise<void> = Promise.resolve();
  readonly settings;
  constructor(settings: S3ReadSettings["cache"] = {}) {
    this.settings = {
      mode: "disk" as "disk" | "memory",
      dir: path.join(os.homedir(), ".blyp", "cache", "s3"),
      maxBytes: 512 * 1_048_576,
      ttlMs: 86_400_000,
      ...settings,
    };
  }
  private filename(key: string) {
    return path.join(
      this.settings.dir,
      createHash("sha256").update(key).digest("hex") + ".gz",
    );
  }
  async get(key: string, expectedBytes?: number): Promise<Buffer | null> {
    if (this.settings.mode === "memory") {
      const entry = this.memory.get(key);
      if (!entry) return null;
      if (
        entry.at + this.settings.ttlMs < Date.now() ||
        (expectedBytes !== undefined && entry.body.length !== expectedBytes)
      ) {
        this.bytes -= entry.body.length;
        this.memory.delete(key);
        return null;
      }
      this.memory.delete(key);
      this.memory.set(key, { ...entry, at: Date.now() });
      return entry.body;
    }
    const file = this.filename(key);
    try {
      const info = await stat(file);
      if (
        info.size > this.settings.maxBytes ||
        (expectedBytes !== undefined && info.size !== expectedBytes) ||
        info.mtimeMs + this.settings.ttlMs < Date.now()
      ) {
        await unlink(file);
        return null;
      }
      const body = await readFile(file);
      await utimes(file, new Date(), new Date());
      return body;
    } catch {
      return null;
    }
  }
  async set(key: string, body: Buffer): Promise<void> {
    if (body.length > this.settings.maxBytes) return;
    if (this.settings.mode === "memory") {
      const old = this.memory.get(key);
      if (old) this.bytes -= old.body.length;
      this.memory.delete(key);
      this.memory.set(key, { body, at: Date.now() });
      this.bytes += body.length;
      for (const [id, entry] of this.memory) {
        if (this.bytes <= this.settings.maxBytes) break;
        this.memory.delete(id);
        this.bytes -= entry.body.length;
      }
      return;
    }
    this.maintenance = this.maintenance
      .catch(() => {})
      .then(async () => {
        await mkdir(this.settings.dir, { recursive: true, mode: 0o700 });
        const file = this.filename(key),
          temporary = file + "." + randomUUID() + ".tmp";
        try {
          await writeFile(temporary, body, { mode: 0o600 });
          await rename(temporary, file);
        } finally {
          await unlink(temporary).catch(() => {});
        }
        const entries = await Promise.all(
          (await readdir(this.settings.dir))
            .filter((name) => /^[a-f0-9]{64}\.gz$/.test(name))
            .map(async (name) => {
              const file = path.join(this.settings.dir, name);
              const info = await stat(file).catch(() => null);
              return { file, info };
            }),
        );
        let total = entries.reduce((n, e) => n + (e.info?.size ?? 0), 0);
        for (const entry of entries.sort(
          (a, b) => (a.info?.mtimeMs ?? 0) - (b.info?.mtimeMs ?? 0),
        )) {
          if (!entry.info) continue;
          if (
            total > this.settings.maxBytes ||
            entry.info.mtimeMs + this.settings.ttlMs < Date.now()
          ) {
            await unlink(entry.file).catch(() => {});
            total -= entry.info.size;
          }
        }
      });
    // Cache failures must not make a successful bucket read fail.
    await this.maintenance.catch(() => {});
  }
}
