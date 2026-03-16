# blyp-cli

`blyp-cli` is a local developer workflow tool centered around two pieces:

- `blyp`, a CLI for launching Studio, checking the environment, and installing Blyp skills
- Studio, a local web UI for inspecting a project and working with its assistant tooling

The repo is a Bun + TypeScript monorepo with a CLI package, a Studio web app, and supporting API/env packages.

## What Studio Does

Studio is the interactive surface for working with a local project. The CLI launches it, points it at a target directory, and opens the browser.

Today, Studio is designed around:

- inspecting a target project from your local machine
- running a local web app at `http://localhost:3003`
- connecting assistant workflows to a specific project path
- using project-level AI settings, including `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`

When you run `blyp studio [targetPath]`, the CLI:

- resolves the target project inside your current directory
- checks that the Studio frontend exists in this workspace
- ensures the target project has the AI settings Studio needs
- starts the Studio frontend if it is not already running
- opens the browser to the Studio URL for that project

If the frontend is already running, the CLI reuses it and opens the target project directly.

Studio can now be launched from any project through the published CLI package. When the command is run inside the `blyp-cli` repo it can still use the local Studio app during development, but published installs use the packaged Studio server bundled with `@blyp/cli`.

## What The CLI Does

The `blyp` CLI is the local entrypoint for Blyp workflows. It currently supports:

- launching Studio for a project
- printing runtime and workspace diagnostics
- installing Blyp skills into a project-local `.agents/skills` directory
- guiding Prisma or Drizzle database logging setup for `blyp-js`
- showing help and version information

The CLI package in this repo is published as `@blyp/cli`, while the executable command remains `blyp`.

## Getting Started

First, install the dependencies:

```bash
bun install
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3003](http://localhost:3003) in your browser to see the fullstack application.

## CLI

Run the CLI from this repo with:

```bash
bun run cli -- <command>
```

The available commands are:

- **`blyp studio [targetPath]`**
  Starts or reuses the local Studio app for a target project. If `targetPath` is omitted, the current directory is used.
- **`blyp health`**
  Prints runtime details such as the current directory, runtime versions, detected workspace root, and Studio web app path.
- **`blyp skills install [source-or-skill-name] [--force]`**
  Installs a local skill folder, installs a bundled skill by name, or opens an interactive picker for bundled skills.
- **`blyp db:init`**
  Walks through Blyp database logging setup, scaffolds schema, applies migrations, and writes `blyp.config.ts`.
- **`blyp db:migrate`**
  Runs the configured Prisma or Drizzle migration workflow.
- **`blyp db:generate`**
  Runs Prisma client generation for configured Prisma projects.
- **`blyp help`**, **`blyp -h`**, **`blyp --help`**
  Shows command usage.
- **`blyp --version`**, **`blyp -V`**
  Prints the CLI version.

### Studio command

```bash
bun run cli -- studio
```

Launch Studio for the current directory:

```bash
bun run cli -- studio
```

Launch Studio from another project with the published package:

```bash
bunx @blyp/cli studio
```

Launch Studio for a subdirectory project:

```bash
bun run cli -- studio ./apps/example
```

Studio uses project config files such as `blyp.config.ts` and project `.env` values when preparing AI settings. These config files are executed in the CLI process, so use only trusted configuration.

### Skills command

Install a local skill directory:

```bash
bun run cli -- skills install ./skills/ai-sdk
```

Install a bundled skill by name:

```bash
bun run cli -- skills install ai-sdk
```

Open the bundled skill picker:

```bash
bun run cli -- skills install
```

Installed skills are copied into:

```text
./.agents/skills/<skill-name>
```

If the destination already exists, re-run with `--force` to replace it:

```bash
bun run cli -- skills install ai-sdk --force
```

If you invoke the CLI from another project directly, you can run the source entrypoint:

```bash
bun /absolute/path/to/blyp-cli/packages/cli/src/index.ts skills install
```

### Database commands

Use these when a project is enabling `blyp-js` database logging with Prisma or Drizzle. `db:init` is the guided setup command; once the project is configured, `db:migrate` and `db:generate` are the shorter follow-up commands.

Supported combinations:

- `prisma` + `postgres`
- `prisma` + `mysql`
- `drizzle` + `postgres`
- `drizzle` + `mysql`

Examples:

```bash
bun run cli -- db:init
```

```bash
bun run cli -- db:migrate
```

```bash
bun run cli -- db:generate
```

Runtime config belongs in:

```text
./blyp.config.ts
```

These commands do not do runtime table auto-creation. They only create and apply migrations through the project’s Prisma or Drizzle tooling.

## Publishing

The CLI package is published as `@blyp/cli`.

This repo includes a GitHub Actions workflow at [`.github/workflows/publish-cli.yml`](/home/doughnut/Documents/Github/opensource/blyp-cli/.github/workflows/publish-cli.yml) that publishes the CLI to npm when you push a tag like `v0.1.0` or trigger the workflow manually.

Setup:

- Add an npm access token to the repository secrets as `NPM_TOKEN`
- Bump [`packages/cli/package.json`](/home/doughnut/Documents/Github/opensource/blyp-cli/packages/cli/package.json) to the version you want to release
- Push a matching git tag, for example `v0.1.0`

The workflow will:

- install dependencies with Bun
- run CLI typechecks
- run CLI tests
- build the CLI package
- publish `@blyp/cli` to npm with public access

## Project Structure

```
blyp-cli/
├── apps/
│   └── web/         # Fullstack application (React + TanStack Start)
├── packages/
│   ├── api/         # API layer / business logic
│   ├── cli/         # @blyp/cli package powering blyp (studio, health, skills, help, version)
│   ├── config/      # Shared config utilities
│   └── env/         # Environment utilities
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run check-types`: Check TypeScript types across all apps
- `bun run cli`: Run the CLI from source (`bun run cli -- studio`)
