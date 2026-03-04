# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Observatoire Hydrologique France — full-stack dashboard for French groundwater (piézo) and surface water (hydro) monitoring. Backend: FastAPI + SQLAlchemy async + Redis + orjson. Frontend: React 19 + TypeScript + Vite + MapLibre GL + Recharts + TanStack Query v5 + Tailwind CSS 4.

## Commands

### Backend (from `backend/`)
```bash
pip install -e ".[dev]"                          # install with dev deps
uvicorn app.main:app --reload --port 8000        # dev server
ruff check app/                                  # lint
ruff check --fix app/                            # lint + autofix
ruff format app/                                 # format
pytest -v                                        # all tests
pytest tests/test_stations.py::test_name -v      # single test
```

### Frontend (from `frontend/`)
```bash
npm install
npm run dev       # Vite dev server on :5173
npm run build     # tsc -b && vite build
npm run lint      # ESLint
npx tsc --noEmit  # type-check only
```

### Docker (from root)
```bash
docker compose up -d                     # full stack on :80
curl http://localhost/api/v1/health      # health check
```

## Architecture

### Backend (`backend/app/`)
- **Entry:** `main.py` — FastAPI app with lifespan (Redis + SQLAlchemy init/teardown), CORS, routers
- **Routers:** `routers/{stations,timeseries,trends,stats,era5,alerts}.py` — one per domain, prefix `/api/v1/<domain>`
- **Models:** `models/` — Pydantic response schemas
- **DB:** `database.py` — async SQLAlchemy engine + `get_db()` dependency. All queries use `text()` with `:param` placeholders (never string formatting). Schema: `gold.*`
- **Cache:** `cache.py` — Redis cache-aside with two helpers:
  - `cached(r, key, ttl, fetch_fn)` — returns deserialized Python; use when you need to manipulate the result before responding
  - `cached_response(prefix, params, ttl, fetch_fn)` — returns raw `Response` bytes from Redis, avoids double-serialization; preferred for standard endpoints
  - Key format: `hydro:<prefix>:<sha256_16chars>`. Redis is optional — app degrades gracefully if unavailable
- **Serialization:** `json_response.py` — `FastJSONResponse` wraps orjson (handles datetime, Decimal, UUID natively)
- **Config:** `config.py` — pydantic-settings, reads `.env` at project root

### Frontend (`frontend/src/`)
- **Entry:** `main.tsx` → `App.tsx` (ErrorBoundary + QueryClientProvider + RouterProvider) → `Layout` (TopNav + Outlet) → lazy pages
- **Routing:** `routes.tsx` — all pages lazy-loaded via `React.lazy`. Station detail: `/station/:type/:code`
- **API layer:** `lib/api.ts` — typed `fetchJson<T>()` + `api.*` namespace. All backend calls go through here
- **Types:** `lib/types.ts` — all interfaces
- **Constants:** `lib/constants.ts` — `CLASSIFICATION_COLORS`, `CLASSIFICATION_LABELS`, `API_BASE`
- **Hooks:** `hooks/use*.ts` — TanStack Query hooks (staleTime: 5min default)
- **State:** filter state lives in URL search params via `useFilters()` (uses `useSearchParams`). No global state library
- **Import alias:** `@/` maps to `src/`
- **Map:** `components/map/ObservatoryMap.tsx` — imperative MapLibre GL via `useRef`. GeoJSON files served from `public/geo/`
- **RightDrawer:** `components/map/RightDrawer.tsx` — unified control panel (data toggles, filters, layer management)
- **StationDrawer:** `components/map/StationDrawer.tsx` — left drawer for station info on marker click
- **Theme:** dark theme with CSS variables in `index.css` under `@theme {}`. Status colors: `status-tres-bas` (red), `status-bas` (orange), `status-normal` (green), `status-haut` (blue), `status-tres-haut` (dark blue)

### Adding a new endpoint
1. Create/edit router in `backend/app/routers/<domain>.py`
2. Add Pydantic model in `backend/app/models/` if needed
3. Wrap DB query in inner `async def fetch()`, use `cached_response()` with appropriate TTL
4. Register router in `main.py` if new file
5. Add API function in `frontend/src/lib/api.ts`, types in `lib/types.ts`, hook in `hooks/`

### Adding a new page
1. Create `frontend/src/pages/<Name>Page.tsx`
2. Register lazy route in `routes.tsx`
3. Add nav link in `components/layout/TopNav.tsx` (`NAV_ITEMS` array)

## Key conventions
- Python: ruff (line-length 120, target py311), type hints on public functions, parameterized SQL only
- TypeScript: strict mode, `interface` for data shapes, `@/` imports, PascalCase components
- Commits: conventional (`feat:`, `fix:`, `refactor:`, etc.), branches: `feat/`, `fix/`
- Vite proxy: `/api/*` → `http://localhost:8001` in dev
- Swagger: only available at `/docs` when `DEBUG=true`

## Domain vocabulary
- **Piézo** — piezometric (groundwater) station, identified by `code_bss`
- **Hydro** — hydrometric (surface water) station, identified by `code_station`
- **Classification:** TRES_BAS (<P10), BAS (P10-P25), NORMAL (P25-P75), HAUT (P75-P90), TRES_HAUT (>P90)
- **Tendance** — Sen slope trend: HAUSSE_FORTE, HAUSSE_SIGNIFICATIVE, STABLE, BAISSE_SIGNIFICATIVE, BAISSE_FORTE
- **ERA5** — ECMWF climate reanalysis (temperature, precipitation, evaporation)
- **HER** — Hydroécorégions (SANDRE). **BDLISA** — groundwater bodies. **BSS** — Banque du Sous-Sol
- **m NGF** — meters above French geodetic sea level

## Database
PostgreSQL schema `gold` (external, not in Docker Compose). Key tables: `dim_piezo_stations`, `dim_hydro_stations`, `hubeau_daily_chroniques`, `hydro_daily_chroniques`, `fct_monthly_*`, `fct_yearly_*`, `agg_station_trends`, `agg_hydro_trends`, `int_era5_*`.

## Cache TTLs
Station lists/GeoJSON: 1h. Daily timeseries: 6h. Monthly/trends: 12h. Annual/percentiles/ERA5: 24h. Compare: 30min.
