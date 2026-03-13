# blyp-cli

This project was created with [Better Fullstack](https://github.com/Marve10s/Better-Fullstack), a modern TypeScript stack that combines React, TanStack Start, Self, TRPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Start** - SSR framework with TanStack Router
- **TailwindCSS** - CSS framework
- **shadcn/ui** - UI components
- **tRPC** - End-to-end type-safe APIs
- **Turborepo** - Optimized monorepo build system

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

The `blyphq` CLI provides local workflow commands:

- **`blyphq studio [targetPath]`** - Start or manage the local Studio workflow. Optionally pass a project path; defaults to the current directory. The Studio web app runs at [http://localhost:3003](http://localhost:3003).
- **`blyphq health`** - Print basic runtime and workspace diagnostics.
- **`blyphq skills install [source-or-skill-name] [--force]`** - Install a local skill directory, install a bundled skill by name, or open a bundled skill picker.
- **`blyphq help`** or **`blyphq -h`** / **`blyphq --help`** - Show available commands and usage.
- **`blyphq --version`** or **`blyphq -V`** - Print CLI version.

To run the CLI from the repo without installing:

```bash
bun run cli -- <command>
```

Example:

```bash
bun run cli -- skills install ./skills/ai-sdk
```

With no source, the CLI lists bundled skills and lets you choose what to install:

```bash
bun run cli -- skills install
```

**Note:** Project config files (`blyp.config.*`) are executed as code in the CLI process. Use only trusted configuration.

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
