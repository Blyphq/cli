import { describe, expect, it } from "vitest";
import { parseStudioSourceArgs } from "./studio-source.js";
describe("Studio S3 arguments", () => {
  it("opens a bucket link without treating it as a filesystem path", () => {
    const result = parseStudioSourceArgs(
      [
        "--source",
        "s3://logs/app",
        "--region",
        "auto",
        "--endpoint",
        "https://example.r2.cloudflarestorage.com",
        "--force-path-style",
      ],
      "/tmp",
    );
    expect(result.hasProject).toBe(false);
    expect(result.source).toBe("s3://logs/app");
    expect(result.env.BLYPQ_STUDIO_S3_REGION).toBe("auto");
  });
  it("retains project mode and rejects unsafe or ambiguous arguments", () => {
    expect(parseStudioSourceArgs(["project"], "/tmp").targetProjectPath).toBe(
      "/tmp/project",
    );
    for (const argv of [
      ["--source"],
      ["--source", "s3://logs/a/../b"],
      ["--source", "s3://secret@logs"],
      ["--source", "s3://logs/a?token=secret"],
      ["--endpoint", "https://user:password@example.com"],
      ["--unknown"],
      ["a", "b"],
    ])
      expect(() => parseStudioSourceArgs(argv, "/tmp")).toThrow();
  });
});
