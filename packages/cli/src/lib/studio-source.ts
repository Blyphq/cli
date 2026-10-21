import path from "node:path";
import { CliError } from "./errors.js";

export function parseStudioSourceArgs(
  argv: readonly string[],
  cwd: string,
): {
  targetProjectPath: string;
  hasProject: boolean;
  source?: string;
  env: Record<string, string>;
} {
  const values: Record<string, string> = {};
  let target: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i]!;
    if (argument === "--force-path-style") {
      values["--force-path-style"] = "true";
      continue;
    }
    if (["--source", "--region", "--endpoint"].includes(argument)) {
      const value = argv[++i];
      if (!value || value.startsWith("--") || values[argument])
        throw new CliError(`Provide exactly one value for ${argument}.`);
      values[argument] = value;
      continue;
    }
    if (argument.startsWith("-") || target)
      throw new CliError(`Unexpected Studio argument: ${argument}`);
    target = argument;
  }
  const env: Record<string, string> = {};
  if (values["--source"]) {
    const match = /^s3:\/\/([^/?#:@\s]+)(?:\/([^?#]*))?$/.exec(
      values["--source"],
    );
    if (!match || !/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,254}$/.test(match[1]!))
      throw new CliError(
        "Use --source s3://bucket/prefix without credentials or query parameters.",
      );
    let prefix: string;
    try {
      prefix = decodeURIComponent(match[2] ?? "").replace(/^\/+|\/+$/g, "");
    } catch {
      throw new CliError("Invalid S3 URL encoding.");
    }
    if (
      prefix.split("/").some((p) => p === "." || p === "..") ||
      /[\x00-\x1f\\]/.test(prefix)
    )
      throw new CliError("Invalid S3 prefix.");
    env.BLYPQ_STUDIO_S3_SOURCE = `s3://${match[1]}${prefix ? "/" + prefix.split("/").map(encodeURIComponent).join("/") : ""}`;
  }
  if (values["--region"]) env.BLYPQ_STUDIO_S3_REGION = values["--region"];
  if (values["--endpoint"]) {
    let url: URL;
    try {
      url = new URL(values["--endpoint"]);
    } catch {
      throw new CliError("Invalid S3 API endpoint.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new CliError(
        "S3 endpoint must be HTTP(S), without credentials or query parameters.",
      );
    env.BLYPQ_STUDIO_S3_ENDPOINT = values["--endpoint"];
  }
  if (values["--force-path-style"]) env.BLYPQ_STUDIO_S3_PATH_STYLE = "true";
  return {
    targetProjectPath: path.resolve(cwd, target ?? cwd),
    hasProject: !!target || !values["--source"],
    source: env.BLYPQ_STUDIO_S3_SOURCE,
    env,
  };
}
