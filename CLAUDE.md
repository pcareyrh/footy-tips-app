# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NRL tipping app with a React frontend and Node.js/Express backend. Users can view fixtures, manage picks, run predictions, and auto-submit tips to iTipFooty. No authentication — assumes local/trusted environment.

## Commands

All commands run from the repo root unless noted.

### Development
```bash
npm run dev          # Start both frontend (port 5173) and backend (port 3001) concurrently
npm run build        # Build backend (tsc) and frontend (vite build)
npm run start        # Start production backend server
```

### Database
```bash
npm run db:migrate   # Run Prisma migrations (dev)
npm run db:seed      # Seed initial data
npm run db:reset     # Reset and re-migrate (destructive)
```

### Testing
```bash
# Backend unit/integration tests (Vitest)
npm test -w backend
npm test -w backend -- path/to/specific.test.ts   # single file

# Frontend component tests (Vitest + React Testing Library)
npm test -w frontend
npm test -w frontend -- src/components/__tests__/Badge.test.tsx

# E2E tests (Playwright — requires backend running or uses auto-start)
npm run test:e2e
npm run test:e2e:ui   # Playwright UI mode
```

### Linting
```bash
npm run lint -w frontend   # ESLint on frontend
```

## Architecture

### Stack
- **Frontend**: React 19 + TypeScript, Vite, React Router, TanStack Query, Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express + TypeScript, Prisma ORM, SQLite
- **Scheduler**: `node-cron` in `backend/src/services/scheduler.ts` for automated iTipFooty submissions

### Data Flow
```
Frontend (TanStack Query) → fetch /api/* → Express routes → Services → Prisma → SQLite
```

### Backend Structure
- **Entry**: `backend/src/server.ts` — starts Express app and cron scheduler
- **App**: `backend/src/app.ts` — mounts all routes under `/api/*`
- **Routes**: `backend/src/routes/` — one file per resource (fixtures, picks, tips, predictions, itipfooty, settings, etc.)
- **Services**: `backend/src/services/` — business logic
  - `scraper.ts` — scrapes NRL website for fixtures/scores
  - `nrl-api.ts` — fetches external NRL data
  - `predict.ts` — prediction engine with confidence scoring
  - `analysis.ts` — analytics and performance tracking
  - `itipfooty.ts` — iTipFooty web scraping and tip submission
  - `scheduler.ts` — cron-based auto-submission, respects `TipOverride` records
- **Plugins**: `backend/src/plugins/` — extensible system for data sources and analysis; see `types.ts` for interfaces

### Frontend Structure
- **Router**: `frontend/src/App.tsx` — 7 routes (dashboard `/`, matches, match detail, analytics, predictions, tips, settings)
- **API client**: `frontend/src/services/api.ts` — fetch wrapper for all backend calls
- **Pages**: `frontend/src/pages/` — one component per route
- **Components**: `frontend/src/components/` — shared UI (Badge, Card, TeamLogo, ConfidenceBadge, Layout)

### Database Schema
Key Prisma models: `Team`, `Season`, `Round`, `Fixture`, `Pick`, `TipOverride`, `Injury`, `LadderEntry`, `ITipMatchStat`, `TeamStat`. Schema at `backend/prisma/schema.prisma`.

### In Production
Frontend is bundled by Vite and served as static files by the Express backend (single server, port 3001).

## Testing Conventions

- **Backend tests**: Use test helpers in `backend/src/test/helpers/db.ts` (`createTestDb`, `seedMinimal`, `destroyTestDb`). Test DB lives at `/tmp/footy-test-vitest.db`. Prisma client is mocked at test startup.
- **Frontend tests**: Use `frontend/src/test/renderWithProviders.tsx` wrapper (provides React Query context).
- **E2E tests**: Live in `e2e/`, use Playwright with Chromium, base URL `http://localhost:3001`. Playwright config auto-starts the backend server.

## Environment Variables

Backend requires a `.env` file (or environment):
```
DATABASE_URL=file:./prisma/dev.db
ITIPFOOTY_USERNAME=...
ITIPFOOTY_PASSWORD=...
ITIPFOOTY_COMP_ID=...
PORT=3001   # optional
```
