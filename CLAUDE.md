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
│   ├── cli/         # @blyp/cli package for the blyphq CLI, including local skill installation
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
