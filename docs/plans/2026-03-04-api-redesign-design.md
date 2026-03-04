# API Backend Redesign — Design Document

**Date:** 2026-03-04
**Scope:** Restructure FastAPI backend API for consistency and maintainability

## Context

Internal-only API serving a single React dashboard. No auth, rate limiting, or pagination needed. Current state has 7 routers with inconsistent patterns (two cache paths, mixed SQL styles, unused Pydantic models, inconsistent response shapes).

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Router grouping | By domain (piézo, hydro, common) | Cohesion — all piézo logic in one place |
| Response format | Bare list `[]` | Frontend loads everything in memory, no pagination needed |
| Caching | `cached_response()` only | Single path, orjson + raw bytes, no double-serialization |
| Validation | `response_model` on all endpoints | Auto Swagger docs, type safety, catches regressions |
| SQL | Explicit columns everywhere | Predictable, no schema-drift surprises |

## New URL Structure

### `/api/v1/piezo/` — Piézométrie (groundwater)

```
GET /piezo/stations                       → list all piézo stations
GET /piezo/stations/{code_bss}            → single station detail
GET /piezo/stations/{code_bss}/percentiles → station percentiles
GET /piezo/stations/{code_bss}/daily      → daily timeseries
GET /piezo/stations/{code_bss}/monthly    → monthly timeseries
GET /piezo/stations/{code_bss}/yearly     → yearly timeseries
GET /piezo/trends                         → piézo trends (Sen slope)
```

### `/api/v1/hydro/` — Hydrométrie (surface water)

```
GET /hydro/stations                            → list all hydro stations
GET /hydro/stations/{code_station}             → single station detail
GET /hydro/stations/{code_station}/percentiles → station percentiles
GET /hydro/stations/{code_station}/daily       → daily timeseries
GET /hydro/stations/{code_station}/monthly     → monthly timeseries
GET /hydro/stations/{code_station}/yearly      → yearly timeseries
GET /hydro/trends                              → hydro trends (Sen slope)
```

### `/api/v1/common/` — Cross-domain endpoints

```
GET /common/stations/geojson     → combined piézo+hydro GeoJSON
GET /common/compare              → multi-station comparison
GET /common/alerts               → threshold alerts (piézo+hydro)
GET /common/stats/national       → national statistics
GET /common/stats/departments    → per-department statistics
```

### Unchanged

```
GET /api/v1/era5/grid            → ERA5 grid points
GET /api/v1/era5/snapshot        → ERA5 latest values
GET /api/v1/era5/dates           → ERA5 available dates
GET /api/v1/era5/monthly         → ERA5 monthly series
GET /api/v1/wfs/{layer_id}       → WFS SANDRE proxy (pre-compressed)
GET /api/v1/health               → health check
```

## File Structure

```
backend/app/
├── routers/
│   ├── piezo.py          # was: stations(piezo) + timeseries(piezo) + trends(piezo)
│   ├── hydro.py          # was: stations(hydro) + timeseries(hydro) + trends(hydro)
│   ├── common.py         # was: stations(geojson) + timeseries(compare) + alerts + stats
│   ├── era5.py           # unchanged
│   └── wfs.py            # unchanged
├── models/
│   ├── piezo.py          # PiezoStation, PiezoDaily, PiezoMonthly, PiezoYearly, PiezoTrend, PiezoPercentile
│   ├── hydro.py          # HydroStation, HydroDaily, HydroMonthly, HydroYearly, HydroTrend, HydroPercentile
│   └── common.py         # Alert, NationalStats, DepartmentStats, CompareResult, StationGeoJSON
├── cache.py              # cached_response() only (remove cached())
├── database.py           # unchanged
├── config.py             # unchanged
├── json_response.py      # unchanged
└── main.py               # register 5 routers: piezo, hydro, common, era5, wfs
```

## Caching Strategy

All endpoints use `cached_response(prefix, params, ttl, fetch_fn)`:
- Returns raw orjson bytes from Redis (zero double-serialization)
- Falls back to fetch + serialize + cache on miss
- Redis optional — graceful degradation

TTLs (unchanged):
- Station lists/GeoJSON: 1h (3600s)
- Daily timeseries: 6h (21600s)
- Monthly/trends: 12h (43200s)
- Annual/percentiles/ERA5: 24h (86400s)
- Compare: 30min (1800s)

## Pydantic Models

All endpoints declare `response_model=list[Model]` or `response_model=Model`. Models use `from_attributes = True` for ORM compatibility. Fields typed with `datetime`, `date`, `float | None`, `Decimal` — orjson handles natively.

## Migration

Frontend `api.ts` URLs updated to match new paths. No breaking external consumers (internal only). Old routers deleted, not aliased.

## Out of Scope

- Authentication / API keys (internal use only)
- Rate limiting (handled by nginx)
- Pagination (all datasets fit in memory)
- Versioning beyond v1 (single consumer)
