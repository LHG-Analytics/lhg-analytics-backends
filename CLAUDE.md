# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

Monorepo with **npm workspaces** containing 7 NestJS backends + 1 shared utility library:

| Service | Port | Description |
|---------|------|-------------|
| `authentication` | 3005 | Auth/JWT service backed by Supabase (also serves multi-tenant "Consolidated" KPIs) |
| `lush_ipiranga` | 3001 | Lush Ipiranga unit backend |
| `lush_lapa` | 3002 | Lush Lapa unit backend |
| `tout` | 3003 | Tout unit backend |
| `andar_de_cima` | 3004 | Andar de Cima unit backend |
| `liv` | 3006 | Liv unit backend |
| `altana` | 3007 | Altana unit backend |
| `lhg-utils` | — | Shared utilities library (`@lhg/utils`) |

All 6 property backends are **architecturally identical** — same modules, same patterns. When fixing a bug or adding a feature, always check and apply the same change to all relevant backends.

**Deploy topology**: a single Render instance runs all processes via PM2 (`ecosystem.config.js`). The public entrypoint is a reverse proxy (`server.mjs`, Express + `http-proxy-middleware`, port 3000) that routes path prefixes (`/auth`, `/lush_ipiranga`, `/liv`, …) to the local ports above. Frontend runs on Vercel (`lhg-analytics.vercel.app` / `analytics.lhgmoteis.com.br`).

> **Migration in progress**: see `docs/MIGRATION-MULTI-TENANT.md` (branch `refactor`) — plan to unify the 6 property backends into a single multi-tenant backend.

## Database Strategy

- **Property backends** connect to their unit's AUTOMO PostgreSQL via `DATABASE_URL_LOCAL_[BACKEND_NAME]`, through **two paths against the same database**:
  - `bookings`, `governance`, `restaurant`: raw SQL via `pg` connection pool (`PgPoolService`).
  - `company`: raw SQL via the **local Prisma client** (`prismaLocal.$queryRaw`) — an incomplete migration to `PgPoolService`; both paths coexist today.
- **Authentication**: Prisma ORM connecting to Supabase (`SUPABASE_URL_USERS`) for users/refresh tokens, plus its own `pg` pools (max 20) to every unit DB for the Consolidated view (`UNIT_CONFIGS` in `src/database/database.interfaces.ts`).
- Pool config (property backends): max 5 connections, 30s idle timeout, 2min statement timeout (tuned for Render).

## Module Structure (all property backends)

```
src/
  auth/          # JWT validation, RolesGuard, UnitsGuard
  bookings/      # Booking management
  cache/         # KPI cache warmup (runs async in background)
  company/       # Core analytics: KPIs, RevPAR, Giro, occupancy (heaviest service)
  database/      # PgPoolService — connection pool wrapper
  governance/    # Housekeeping/team metrics
  restaurant/    # Restaurant data
  prisma/        # Local Prisma client (@client-local) — used by company.service for analytics queries
```

## Development Commands

```bash
# Root level — run individual backends
npm run dev:ipiranga   # lush_ipiranga
npm run dev:lapa       # lush_lapa
npm run dev:tout       # tout
npm run dev:adc        # andar_de_cima
npm run dev:liv        # liv
npm run dev:auth       # authentication

# Inside any backend directory
npm run start:dev      # dev with nodemon
npm run lint           # ESLint fix
npm run format         # Prettier format
npm run build          # compile (runs: build lhg-utils → generate prisma → tsc)
```

## Key Patterns

### Prisma in property backends
Each property backend generates a local Prisma client aliased as `@client-local` (path: `prisma-schemas/[backend]_local/`), mirroring the AUTOMO PMS schema (~32 models). **`company.service.ts` runs its analytics queries through this client** (`prismaLocal.$queryRaw`); `bookings`/`governance`/`restaurant` use raw SQL via `PgPoolService`. JWT validation does NOT touch the database (pure `jwt.verify` with the shared `JWT_SECRET`); user lookups use the `authentication` project's Supabase Prisma via the `@auth/*` path alias (property backends compile `authentication` sources together — see `tsconfig.build.json` `rootDirs`).

### KPI Calculations (company.service.ts)
The most critical file in each backend. Key metrics:
- **Giro por dia da semana**: `total_rentals / (total_suites × days_count_for_that_weekday)`
- **RevPAR por dia da semana**: `total_revenue_for_that_weekday / (total_suites × days_count_for_that_weekday)`
- Both divide by the **count of that specific weekday in the period**, not total days.
- Days without data are filled with `giro: 0` / `revpar: 0` but preserve the correct `totalGiro`/`totalRevpar` from the SQL result.

### Suite Category IDs per unit (company.service.ts)
Every SQL query filters by `ca.id IN (...)`. These IDs differ per unit — changing them breaks all KPI calculations:

| Unit | Category IDs |
|------|-------------|
| `lush_lapa` | `7,8,9,10,11,12,13,14` |
| `lush_ipiranga` | `10,11,12,15,16,17,18,19,24` |
| `tout` | `6,7,8,9,10,12` |
| `andar_de_cima` | `2,3,4,5,6,7,12` |
| `liv` | `1,2,3,4,5,7,8,9,10,11` |
| `altana` | `1,2,3,4,5,6,7,8,9,10,11,12` |

### Governance (governance.service.ts)
Each unit has different `id_cargo` values for housekeeping staff:

| Unit | Camareiras IDs | Supervisor ID | Terceirizados (by `funcionario.id`) | Excluded from Team Sizing |
|------|---------------|---------------|--------------------------------------|--------------------------|
| `lush_lapa` | `4, 20` | `19` | `32118, 32120, 32121` | `112857, 3361` |
| `lush_ipiranga` | `4, 45` | `24` | `998548, 1047691, 1047692` | `1047694, 20388` |
| `tout` | `4, 20` | `2` | — | — |
| `andar_de_cima` | `7, 13` | `6` | — | — |
| `liv` | `4` | `7` | identified by `horarioinicioexpediente` (no schedule = terceirizado) | — |
| `altana` | `6, 7` | `3` | — | — |

Note: `lush_lapa` uses commercial hours 04:00–03:59 in the governance controller; all other units use 06:00–05:59. `altana` also redefines `RentalTypeEnum` (`ONE/TWO/FOUR/TWELVE_HOURS`) in `common/enums.ts`, unlike the other units.

### Authentication flow
JWT issued by `authentication` service (port 3005) via **httpOnly cookie** (`access_token`). All property backends validate the token independently by reading the cookie or `Authorization: Bearer` header. Frontend **must** use `credentials: 'include'` on all requests.

JWT payload: `{ id, email, name, unit, role }` — defined in `authentication/src/auth/interfaces/jwt-payload.interface.ts`. The `JWT_SECRET` must be identical across all services.

### Role × Module access matrix

| Role | Company | Governance | Bookings | Restaurant | Consolidated |
|------|---------|------------|----------|------------|--------------|
| `ADMIN` (unit: LHG) | ✅ all units | ✅ all units | ✅ all units | ✅ all units | ✅ |
| `GERENTE_GERAL` | ✅ own unit | ✅ own unit | ✅ own unit | ✅ own unit | ❌ |
| `GERENTE_FINANCEIRO` | ✅ own unit | ❌ | ❌ | ❌ | ❌ |
| `GERENTE_OPERACIONAL` | ❌ | ✅ own unit | ❌ | ❌ | ❌ |
| `GERENTE_RESERVAS` | ❌ | ❌ | ✅ own unit | ❌ | ❌ |
| `GERENTE_RESTAURANTE` | ❌ | ❌ | ❌ | ✅ own unit | ❌ |

### Cache strategy
In-memory cache (`KpiCacheService`, a per-process `Map` — NOT shared between processes, lost on restart):
- API calls use CUSTOM period with dynamic TTL: 1–10 days: 10 min | 11–30 days: 30 min | 31+ days: 3 hours
- **Warmup** (`POST /cache/warmup`, called by GitHub Actions cron at 0/6/12/15h BRT — `.github/workflows/cache-warmup.yml`): always recalculates 4 services × 4 periods with concurrency 3 and writes with a **12h TTL** (≥ the longest gap between warmups), so all periods stay populated between runs.
- Cache key format: `kpi:{service}:{period}:{start}:{end}` (e.g. `kpi:cp:custom:2024-12-14:2024-12-21`)
- Cache endpoints (all `@Public`): `POST /cache/warmup`, `GET /cache/status`, `POST /cache/refresh`

### lhg-utils shared library
Must be built first before any backend: `cd lhg-utils && npm run build`. Provides `DateUtilsModule`, `ValidationModule`, `QueryUtilsModule`, `ConcurrencyUtilsModule`, and `CompressionUtilsModule` imported as `@lhg/utils`.
