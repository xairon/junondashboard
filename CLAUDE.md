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
- **Entry:** `main.py` — FastAPI app with lifespan (Redis + SQLAlchemy init/teardown), CORS, routers. Warms WFS + classification caches at startup
- **Routers:** `routers/{piezo,hydro,common,era5,wfs}.py` — one per domain, prefix `/api/v1/<domain>`
- **Models:** `models/` — Pydantic response schemas
- **DB:** `database.py` — async SQLAlchemy engine + `get_db()` dependency. All queries use `text()` with `:param` placeholders (never string formatting). Schema: `gold.*`
- **Cache:** `cache.py` — Redis cache-aside with two helpers:
  - `cached(r, key, ttl, fetch_fn)` — returns deserialized Python; use when you need to manipulate the result before responding
  - `cached_response(prefix, params, ttl, fetch_fn)` — returns raw `Response` bytes from Redis, avoids double-serialization; preferred for standard endpoints
  - Key format: `hydro:<prefix>:<sha256_16chars>`. Redis is optional — app degrades gracefully if unavailable
- **Drought indices:** `drought.py` — standardized drought index computation:
  - `compute_spli()` — SPLI/IPS (BRGM methodology, KDE-based) for groundwater
  - `compute_ssfi()` — SSFI (gamma distribution) for streamflow
  - `compute_spi()` — SPI (gamma distribution) for precipitation
  - `classify_latest_spli()` / `classify_latest_ssfi()` — optimized single-value classifiers for batch computation
- **Classification:** `classification.py` — batch computation of current classifications for all stations:
  - Computes SPLI (piezo) and SSFI (hydro) for each station's latest month
  - Cached in Redis 24h, warmed at startup via background task
  - `get_classification_lookup()` → `{"piezo": {code: class}, "hydro": {code: class}}` or `None`
  - All endpoints (GeoJSON, alerts, stats, station detail/list) overlay computed classification on DB data
  - Graceful fallback to DB percentile-based classification if Redis unavailable
- **Serialization:** `json_response.py` — `FastJSONResponse` wraps orjson (handles datetime, Decimal, UUID natively)
- **Config:** `config.py` — pydantic-settings, reads `.env` at project root

### Frontend (`frontend/src/`)
- **Entry:** `main.tsx` → `App.tsx` (ErrorBoundary + QueryClientProvider + RouterProvider) → `Layout` (TopNav + Outlet) → lazy pages
- **Routing:** `routes.tsx` — all pages lazy-loaded via `React.lazy`. Station detail: `/station/:type/:code`
- **API layer:** `lib/api.ts` — typed `fetchJson<T>()` + `api.*` namespace. All backend calls go through here
- **Types:** `lib/types.ts` — all interfaces
- **Constants:** `lib/constants.ts` — `CLASSIFICATION_COLORS`, `CLASSIFICATION_LABELS`, `TREND_LABELS`, `TREND_COLORS`, `API_BASE`
- **Hooks:** `hooks/use*.ts` — TanStack Query hooks (staleTime: 5min default)
- **State:** filter state lives in URL search params via `useFilters()` (uses `useSearchParams`), persisted to `sessionStorage` across page navigations. No global state library
- **Import alias:** `@/` maps to `src/`
- **Map:** `components/map/ObservatoryMap.tsx` — imperative MapLibre GL via `useRef`. Voyager basemap + terrain hillshading. Static GeoJSON from `public/geo/` (regions, departments, bassins, HER, BDLISA). WFS layers from `/api/v1/wfs/` (SANDRE zonage, Carthage waterways, DCE water masses)
- **Layer config:** `lib/layerConfig.ts` — WFS layer definitions (groups: SANDRE zonage, Carthage, hydro-écologie), colors, min zoom, tooltips
- **RightDrawer:** `components/map/RightDrawer.tsx` — unified control panel (data toggles, filters, layer management with radio/checkbox groups)
- **StationDrawer:** `components/map/StationDrawer.tsx` — left drawer on marker click. Shows situation actuelle, tendance, historique, climat ERA5, contexte hydrogéologique. Hidden for inactive stations (>90 days without data)
- **Drought charts:** `components/charts/DroughtIndexChart.tsx` — bar chart with 7-class Météo-France zone bands and color legend. Supports SPLI, SSFI, SPI indices
- **Theme:** dark theme with CSS variables in `index.css` under `@theme {}`. Status colors: `status-extremement-bas` (dark red), `status-tres-bas` (red), `status-bas` (orange), `status-normal` (green), `status-haut` (blue), `status-tres-haut` (dark blue), `status-extremement-haut` (dark indigo)

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
- **Classification (7 classes, Météo-France):** EXTREMEMENT_BAS (<-1.75σ), TRES_BAS (-1.75 to -1.28σ), BAS (-1.28 to -0.84σ), NORMAL (-0.84 to 0.84σ), HAUT (0.84 to 1.28σ), TRES_HAUT (1.28 to 1.75σ), EXTREMEMENT_HAUT (>1.75σ)
- **SPLI (IPS)** — Standardized Piezometric Level Index (BRGM RP-64147-FR), uses KDE per calendar month. Used for groundwater classification
- **SSFI** — Standardized Streamflow Index (gamma distribution). Used for surface water classification
- **SPI** — Standardized Precipitation Index (gamma distribution). Shown alongside SPLI/SSFI on station detail
- **Tendance** — Sen slope trend: HAUSSE_FORTE, HAUSSE_SIGNIFICATIVE, STABLE, BAISSE_SIGNIFICATIVE, BAISSE_FORTE
- **ERA5** — ECMWF climate reanalysis (temperature, precipitation, evaporation)
- **HER** — Hydroécorégions (SANDRE). **BDLISA** — groundwater bodies. **BSS** — Banque du Sous-Sol
- **m NGF** — meters above French geodetic sea level

## Database
PostgreSQL schema `gold` (external, not in Docker Compose). Key tables: `dim_piezo_stations`, `dim_hydro_stations`, `hubeau_daily_chroniques`, `hydro_daily_chroniques`, `fct_monthly_*`, `fct_yearly_*`, `agg_station_trends`, `agg_hydro_trends`, `int_era5_*`.

## Cache TTLs
Station lists/GeoJSON: 1h. Alerts: 1h. Daily timeseries: 6h. Monthly/trends: 12h. Annual/percentiles/ERA5: 24h. WFS layers: 24h. Drought classifications: 24h. Compare: 30min.

## Data sources
- **Hub'Eau** — BRGM API for piezometric and hydrometric data (imported into PostgreSQL `gold` schema)
- **SANDRE** — WFS services for hydrographic reference data (zones, waterways, water masses). Base URL: `services.sandre.eaufrance.fr/geo/zonage`
- **ERA5** — ECMWF climate reanalysis (temperature, precipitation, evaporation). Pre-aggregated in `int_era5_*` tables
- **BDLISA** — Groundwater body database. Static GeoJSON in `public/geo/bdlisa.geojson`
- **Admin boundaries** — Régions, départements from official data. Static GeoJSON in `public/geo/`
- **AWS Terrain Tiles** — Raster DEM tiles (terrarium encoding) for hillshading overlay. Streamed from `s3.amazonaws.com/elevation-tiles-prod/terrarium/`

## Classification system
The classification system uses standardized drought indices computed on-the-fly (not raw percentiles):
- **Piézo stations:** SPLI (IPS) — BRGM kernel density estimator methodology per calendar month
- **Hydro stations:** SSFI — gamma distribution fit per calendar month
- At startup, `classification.py` batch-computes the latest month's index for all stations (~18k piezo, ~5k hydro)
- Results cached in Redis (`hydro:classifications:current`, 24h TTL)
- All API endpoints overlay the computed classification on the DB `classification_derniere_annee` column
- If Redis is cold or unavailable, endpoints fall back to DB percentile-based classification (5-class)
- The 7-class thresholds follow BRGM RP-64147-FR / Météo-France (BSH, ADES, DREAL standard)
