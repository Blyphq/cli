# blyp-cli

This file provides context about the project for AI assistants.

## Project Overview

- **Ecosystem**: Typescript
- **CLI Package**: `@blyp/cli`

## Tech Stack

- **Runtime**: none
- **Package Manager**: bun

### Frontend

- Framework: tanstack-start
- CSS: tailwind
- UI Library: shadcn-ui
- State: zustand

### Backend

- Framework: self
- API: trpc
- Validation: zod

### Additional Features

- Testing: vitest
- AI: vercel-ai

## Project Structure

```
blyp-cli/
├── apps/
│   └── web/         # Frontend application
├── packages/
│   ├── api/         # API layer
│   ├── cli/         # @blyp/cli package for the blyp CLI, including local skill installation
│   ├── config/      # Shared config
│   └── env/         # Environment utilities
```

## Common Commands

- `bun install` - Install dependencies
- `bun dev` - Start development server
- `bun build` - Build for production
- `bun test` - Run tests

## Maintenance

Keep CLAUDE.md updated when:

- Adding/removing dependencies
- Changing project structure
- Adding new features or services
- Modifying build/dev workflows

AI assistants should suggest updates to this file when they notice relevant changes.

## S3 Studio sources

`packages/api/src/studio/s3.ts` owns server-side sources, versioned datasets, discovery, and read grants. `s3-cache.ts` owns compressed object caching; `s3-format.ts` reads the core format v1 protocol. Both API and packaged CLI declare `@aws-sdk/client-s3` as a runtime dependency. Studio views consume snapshots and must never fetch bucket objects themselves. `use-s3-dataset.ts` owns explicit load/extend/refresh/cancel actions. Keep core/CLI protocol fixtures synchronized when changing the object format.

The `@blyp/cli#build` Turbo task explicitly hashes Studio/API source inputs and caches both `dist` and `studio`; keep these inputs aligned with `packages/cli/scripts/build-studio.mjs` so packaged readers do not remain stale after API-only changes.
