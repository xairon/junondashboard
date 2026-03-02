# Hydro Dashboard — Design Document

**Date:** 2026-03-02
**Status:** Approved
**Approach:** Observatory (Full Custom React)

## Context

Data warehouse on PostgreSQL + TimescaleDB + PostGIS (`dib-2019006065:49502`) containing:
- **ERA5** reanalysis weather data (temperature, precipitation, evaporation) on 22,985 grid points, 1950–2026
- **Piézométrie Hub'Eau** — 22,407 stations, 23M+ daily records, 1967–2026
- **Hydrométrie Hub'Eau** — 6,253 stations (QmnJ), 21M+ daily records, 1967–2026
- **ERA5-to-station mappings** — 163M+ records linking ERA5 grid to stations

Architecture medallion (bronze/silver/gold). Dashboard reads exclusively from the **gold** layer.

## Target Users

Public-facing dashboard accessible to the general public (grand public). Must be visually polished, ergonomic, and render data actionable.

## Architecture

```
Browser (SPA)
    │ REST JSON
FastAPI (Python) ←→ Redis (cache)
    │ async SQL
PostgreSQL + TimescaleDB + PostGIS (gold schema)

Deployment: Docker Compose + Nginx reverse proxy
```

### Components
- **Frontend:** Vite + React 19 + TypeScript + MapLibre GL JS + deck.gl + Recharts + shadcn/ui + Tailwind CSS 4 + Framer Motion + @tanstack/react-query + react-router
- **Backend:** FastAPI + uvicorn + asyncpg + SQLAlchemy (async) + redis + pydantic
- **Infra:** Docker Compose, Nginx, Redis

## Views

### 1. Observatoire (Home) — Full-screen interactive map

**Map:** MapLibre GL JS with dark basemap (CartoDB Dark Matter).
- **Station layers (deck.gl):** ScatterplotLayer for piezo (circles) and hydro (triangles), colored by classification (TRES_BAS=red → TRES_HAUT=dark blue)
- **Clustering:** Automatic at national zoom, individual points on zoom-in
- **ERA5 overlay:** HeatmapLayer or GridLayer for temperature/precipitation, toggleable
- **Temporal slider:** Bottom bar with play/pause animation — scrub through months/years to animate ERA5 precipitation/temperature on the grid. Shows evolution over seasons and decades.
- **Station popup:** On click, show name, current level, classification badge, trend arrow, link to detail
- **KPI bar:** Bottom strip showing total station counts, alerts breakdown
- **Search:** Autocomplete on station names/communes

**Interactions:** Multi-scale zoom (France → Region → Department → Station), toggle piezo/hydro, toggle ERA5 overlay, search.

### 2. Station (Detail) — Per-station deep dive

Accessed via map click or search.

**KPI cards:** Current level, trend (slope + R²), avg precipitation, avg temperature — all with classification badges.

**Main timeseries chart (Recharts):**
- Dual Y-axis: level/flow + precipitation
- Brush for date range zoom
- Period toggles: 1yr, 5yr, max
- Smooth interpolation

**Correlation section:**
- Scatter plot: precipitation vs level/flow with adjustable lag
- Seasonality chart: monthly averages grouped by year

**Yearly heatmap:** Years × months matrix colored by level — identifies seasonal patterns and anomalies at a glance.

### 3. Tendances (National synthesis)

**KPI cards:** % stations declining / stable / rising.

**Choropleth map:** Department-level average trend (deck.gl GeoJsonLayer).

**Department ranking:** Horizontal bar chart sorted by average trend.

**National evolution:** 12-month rolling average line chart.

**Filters:** Season selector, piezo/hydro toggle, department filter.

### 4. Alertes (Monitoring)

**Alert summary:** Count of stations by classification level (TRES_BAS: 9,394 / BAS: 1,199 / etc.).

**Filterable table:** Station | Department | Level | Classification | Trend | Last measurement date. Sortable, paginated, CSV export.

**Mini-map:** Stations in alert (TRES_BAS + BAS) highlighted on small map.

### 5. Comparer (Multi-station comparison)

**Station selector:** Add 2+ stations via search autocomplete (chips with × to remove).

**Superposed timeseries:** All stations on same chart, color-coded. Toggle between raw values and z-score normalized.

**Precipitation background:** ERA5 precipitation as semi-transparent area behind the curves.

**Comparison table:** KPI side-by-side (mean level, trend, amplitude, last value).

**Correlation scatter:** Station A vs Station B values.

**Period selector:** 1yr, 5yr, max.

## Global Quality Filters

Present on all views (map, lists, tables). Persisted in URL query params for sharing.

- **Minimum observations:** threshold in days (default: 500)
- **Last measurement after:** date picker (default: 2024-01-01)
- **Classification filter:** checkboxes for TRES_BAS, BAS, NORMAL, HAUT, TRES_HAUT
- **Department filter:** dropdown
- **Entité hydrogéologique:** dropdown (piezo only)
- **Result count:** "14,230 / 22,407 stations" indicator

## Visual Design

### Theme: "Deep Observatory" (Dark)

| Usage | Color | Hex |
|-------|-------|-----|
| Background main | Deep blue-black | `#0a0e1a` |
| Background cards | Dark slate | `#111827` |
| Background hover | Medium slate | `#1f2937` |
| Text primary | Off-white | `#e5e7eb` |
| Text secondary | Blue-grey | `#9ca3af` |
| Accent primary | Hydro cyan | `#06b6d4` |
| Accent secondary | Indigo | `#6366f1` |
| TRES_BAS | Deep red | `#ef4444` |
| BAS | Orange | `#f97316` |
| NORMAL | Emerald | `#10b981` |
| HAUT | Blue | `#3b82f6` |
| TRES_HAUT | Dark blue | `#1d4ed8` |
| Precipitation | Light blue @30% | `#38bdf8` |

### Typography
Inter (variable font) — clean, highly legible.

### Map Style
Dark basemap, luminous station dots colored by classification, subtle glow effect on critical stations.

### Animations
Framer Motion transitions between views, loading skeletons, smooth chart interpolation on period change. Temporal slider with smooth playback animation.

## API Design

### Endpoints

```
GET /api/v1/stations/piezo                  → stations_piezo_carte (with quality filters)
GET /api/v1/stations/hydro                  → stations_hydro_carte (with quality filters)
GET /api/v1/stations/piezo/{code_bss}       → dim_piezo_stations
GET /api/v1/stations/hydro/{code_station}   → dim_hydro_stations

GET /api/v1/timeseries/piezo/{code_bss}     → hubeau_daily_chroniques
    ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
GET /api/v1/timeseries/hydro/{code_station} → hydro_daily_chroniques
    ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
GET /api/v1/timeseries/monthly/piezo/{code} → fct_monthly_chroniques
GET /api/v1/timeseries/monthly/hydro/{code} → fct_monthly_hydro
GET /api/v1/timeseries/yearly/piezo/{code}  → fct_yearly_stats
GET /api/v1/timeseries/yearly/hydro/{code}  → fct_yearly_hydro

GET /api/v1/era5/grid                       → int_era5_grid_points (GeoJSON)
GET /api/v1/era5/station/{code}             → int_era5_for_stations
GET /api/v1/era5/snapshot                   → ERA5 grid values at a specific date
    ?date=YYYY-MM-DD&variable=total_precipitation

GET /api/v1/trends/piezo                    → agg_station_trends (filterable)
GET /api/v1/trends/hydro                    → agg_hydro_trends (filterable)

GET /api/v1/stats/national                  → aggregated KPIs
GET /api/v1/stats/departments               → per-department aggregation
```

### Cache Strategy (Redis)

| Endpoint pattern | TTL | Rationale |
|-----------------|-----|-----------|
| `/stations/*` (list) | 1h | Quasi-static reference data |
| `/stations/{code}` | 1h | Station metadata rarely changes |
| `/timeseries/daily/*` | 5min | Volatile, frequently queried |
| `/timeseries/monthly/*` | 30min | Moderate update frequency |
| `/timeseries/yearly/*` | 1h | Slow-changing aggregates |
| `/era5/*` | 1h | Static historical data |
| `/trends/*` | 1h | Computed periodically |
| `/stats/*` | 1h | Dashboard-level KPIs |

## Project Structure

```
hydro_dashboard/
├── docker-compose.yml
├── .env
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── Dockerfile
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── routes.tsx
│       ├── lib/
│       │   ├── api.ts              # Typed API client
│       │   ├── constants.ts        # Colors, thresholds, classifications
│       │   └── utils.ts
│       ├── hooks/
│       │   ├── useStations.ts      # React Query hooks for stations
│       │   ├── useTimeseries.ts    # React Query hooks for timeseries
│       │   └── useFilters.ts       # URL-synced filter state
│       ├── components/
│       │   ├── ui/                 # shadcn/ui components
│       │   ├── layout/
│       │   │   ├── Sidebar.tsx
│       │   │   ├── Header.tsx
│       │   │   └── Layout.tsx
│       │   ├── map/
│       │   │   ├── ObservatoryMap.tsx
│       │   │   ├── StationLayer.tsx
│       │   │   ├── ERA5Overlay.tsx
│       │   │   ├── TemporalSlider.tsx
│       │   │   └── StationPopup.tsx
│       │   ├── charts/
│       │   │   ├── TimeseriesChart.tsx
│       │   │   ├── CorrelationScatter.tsx
│       │   │   ├── SeasonalityChart.tsx
│       │   │   ├── YearlyHeatmap.tsx
│       │   │   └── TrendBarChart.tsx
│       │   ├── station/
│       │   │   ├── StationKPICards.tsx
│       │   │   ├── StationDetail.tsx
│       │   │   └── ClassificationBadge.tsx
│       │   ├── filters/
│       │   │   └── GlobalFilters.tsx
│       │   └── compare/
│       │       ├── ComparePanel.tsx
│       │       └── NormalizedToggle.tsx
│       └── pages/
│           ├── ObservatoryPage.tsx
│           ├── StationPage.tsx
│           ├── TrendsPage.tsx
│           ├── AlertsPage.tsx
│           └── ComparePage.tsx
├── backend/
│   ├── pyproject.toml
│   ├── Dockerfile
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── database.py             # async SQLAlchemy + connection pool
│       ├── cache.py                # Redis cache wrapper
│       ├── routers/
│       │   ├── stations.py
│       │   ├── timeseries.py
│       │   ├── era5.py
│       │   ├── trends.py
│       │   └── stats.py
│       ├── models/
│       │   ├── station.py          # Pydantic response schemas
│       │   ├── timeseries.py
│       │   └── era5.py
│       └── queries/
│           ├── stations.sql
│           ├── timeseries.sql
│           └── trends.sql
└── nginx/
    └── nginx.conf
```

## Gold Schema Reference

### Key Tables

| Table | Rows | Purpose |
|-------|------|---------|
| `stations_piezo_carte` | 21,942 | Piezo stations for map display |
| `stations_hydro_carte` | 5,940 | Hydro stations for map display |
| `dim_piezo_stations` | 22,407 | Full piezo station metadata |
| `dim_hydro_stations` | 6,253 | Full hydro station metadata |
| `hubeau_daily_chroniques` | 23.4M | Daily piezo measurements + ERA5 |
| `hydro_daily_chroniques` | 21.6M | Daily hydro measurements + ERA5 |
| `fct_monthly_chroniques` | 1.5M | Monthly piezo aggregates |
| `fct_monthly_hydro` | 1.3M | Monthly hydro aggregates |
| `fct_yearly_stats` | 170k | Yearly piezo aggregates |
| `fct_yearly_hydro` | 119k | Yearly hydro aggregates |
| `agg_station_trends` | 14.3k | Piezo trend analysis |
| `agg_hydro_trends` | 11.3k | Hydro trend analysis |
| `int_era5_grid_points` | 23k | ERA5 grid geometry |
| `int_era5_for_stations` | 79.6M | ERA5 data per piezo station |
| `int_era5_for_hydro_stations` | 83.6M | ERA5 data per hydro station |

### Classification System
Stations are classified based on their last year's level relative to historical percentiles:
- **TRES_BAS** (9,394 piezo) — Very low, critical
- **BAS** (1,199) — Low, attention needed
- **NORMAL** (1,516) — Within normal range
- **HAUT** (1,398) — High
- **TRES_HAUT** (5,129) — Very high

### Hypertables (TimescaleDB)
All daily, monthly, yearly, and ERA5 tables are TimescaleDB hypertables — optimized for time-range queries.

## Performance Considerations

1. **API pagination** for timeseries endpoints — never return unbounded results
2. **Redis caching** with TTLs adapted to data volatility
3. **Connection pooling** via asyncpg (pool_size=20)
4. **deck.gl GPU rendering** for 28k+ station points
5. **React Query** stale-while-revalidate pattern for perceived instant navigation
6. **Debounced filters** — filter changes debounced 300ms before API call
7. **Monthly/yearly aggregates** preferred over daily for trend views
8. **Temporal slider** pre-fetches adjacent months for smooth playback
