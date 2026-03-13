# blyp-cli

`blyp-cli` is a local developer workflow tool centered around two pieces:

- `blyphq`, a CLI for launching Studio, checking the environment, and installing Blyp skills
- Studio, a local web UI for inspecting a project and working with its assistant tooling

The repo is a Bun + TypeScript monorepo with a CLI package, a Studio web app, and supporting API/env packages.

## What Studio Does

Studio is the interactive surface for working with a local project. The CLI launches it, points it at a target directory, and opens the browser.

Today, Studio is designed around:

- inspecting a target project from your local machine
- running a local web app at `http://localhost:3003`
- connecting assistant workflows to a specific project path
- using project-level AI settings, including `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`

When you run `blyphq studio [targetPath]`, the CLI:

- resolves the target project inside your current directory
- checks that the Studio frontend exists in this workspace
- ensures the target project has the AI settings Studio needs
- starts the Studio frontend if it is not already running
- opens the browser to the Studio URL for that project

If the frontend is already running, the CLI reuses it and opens the target project directly.

## What The CLI Does

The `blyphq` CLI is the local entrypoint for Blyp workflows. It currently supports:

- launching Studio for a project
- printing runtime and workspace diagnostics
- installing Blyp skills into a project-local `.agents/skills` directory
- showing help and version information

The CLI package in this repo is published as `@blyp/cli`, while the executable command remains `blyphq`.

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

- **`blyphq studio [targetPath]`**
  Starts or reuses the local Studio app for a target project. If `targetPath` is omitted, the current directory is used.
- **`blyphq health`**
  Prints runtime details such as the current directory, runtime versions, detected workspace root, and Studio web app path.
- **`blyphq skills install [source-or-skill-name] [--force]`**
  Installs a local skill folder, installs a bundled skill by name, or opens an interactive picker for bundled skills.
- **`blyphq help`**, **`blyphq -h`**, **`blyphq --help`**
  Shows command usage.
- **`blyphq --version`**, **`blyphq -V`**
  Prints the CLI version.

### Studio command

```bash
bun run cli -- studio
```

Launch Studio for the current directory:

```bash
bun run cli -- studio
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

## Project Structure

```
blyp-cli/
├── apps/
│   └── web/         # Fullstack application (React + TanStack Start)
├── packages/
│   ├── api/         # API layer / business logic
│   ├── cli/         # @blyp/cli package powering blyphq (studio, health, skills, help, version)
│   ├── config/      # Shared config utilities
│   └── env/         # Environment utilities
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run check-types`: Check TypeScript types across all apps
- `bun run cli`: Run the CLI from source (`bun run cli -- studio`)
