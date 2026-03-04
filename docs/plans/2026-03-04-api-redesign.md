# API Backend Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Regroup 7 backend routers into 5 domain-based routers (piezo, hydro, common, era5, wfs), unify caching on `cached_response()`, add `response_model` Pydantic validation, explicit SQL columns, and update frontend URLs.

**Architecture:** Domain-based router grouping. All piézo endpoints in one router, all hydro in another, cross-domain (geojson, alerts, stats) in common. Cache unified on `cached_response()` (orjson + raw bytes, zero double-serialization). Pydantic `response_model` on all endpoints for Swagger docs. Drop unused compare endpoint. Drop pagination (X-Total-Count, limit/offset) — frontend loads all data.

**Tech Stack:** FastAPI, Pydantic v2, orjson, SQLAlchemy async, Redis, React/TypeScript frontend

---

### Task 1: Create new Pydantic models

**Files:**
- Create: `backend/app/models/piezo.py`
- Create: `backend/app/models/hydro.py`
- Create: `backend/app/models/common.py`
- Delete content of: `backend/app/models/station.py` (will be removed later)
- Delete content of: `backend/app/models/timeseries.py` (will be removed later)

**Step 1: Create `backend/app/models/piezo.py`**

```python
from datetime import date
from pydantic import BaseModel


class PiezoStation(BaseModel):
    code_bss: str
    bss_id: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    nom_commune: str | None = None
    code_departement: str | None = None
    nom_departement: str | None = None
    libelle_eh: str | None = None
    codes_bdlisa: str | None = None
    altitude_station: float | None = None
    date_debut_mesure: date | None = None
    date_fin_mesure: date | None = None
    nb_mesures_total: float | None = None
    nb_mois_total: int | None = None
    premiere_mesure: date | None = None
    derniere_mesure: date | None = None
    niveau_moyen_global: float | None = None
    niveau_min_absolu: float | None = None
    niveau_max_absolu: float | None = None
    niveau_stddev_global: float | None = None
    amplitude_totale: float | None = None
    profondeur_moyenne_globale: float | None = None
    temperature_moyenne_globale: float | None = None
    precipitation_moyenne_mensuelle: float | None = None
    derniere_annee: int | None = None
    niveau_derniere_annee: float | None = None
    classification_derniere_annee: str | None = None
    percentile_derniere_annee: float | None = None
    slope_niveau: float | None = None
    r2_niveau: float | None = None
    slope_precipitation: float | None = None
    nb_mois_tendance: int | None = None
    tendance_classification: str | None = None
    niveau_alerte: str | None = None
    qualite_tendance: str | None = None


class PiezoDaily(BaseModel):
    date: date
    niveau_nappe_eau: float | None = None
    profondeur_nappe: float | None = None
    temperature_2m: float | None = None
    total_precipitation: float | None = None
    potential_evaporation: float | None = None


class PiezoMonthly(BaseModel):
    mois: date
    niveau_moyen: float | None = None
    niveau_min: float | None = None
    niveau_max: float | None = None
    amplitude_mensuelle: float | None = None
    temperature_moyenne: float | None = None
    precipitation_totale: float | None = None
    evaporation_moyenne: float | None = None
    nb_jours_mesures: int | None = None
    niveau_moy_mobile_3m: float | None = None
    niveau_moy_mobile_12m: float | None = None
    precipitation_moy_mobile_12m: float | None = None
    variation_niveau_vs_mois_prec: float | None = None
    variation_niveau_vs_annee_prec: float | None = None


class PiezoYearly(BaseModel):
    annee: int
    niveau_moyen_annuel: float | None = None
    niveau_min_annuel: float | None = None
    niveau_max_annuel: float | None = None
    amplitude_annuelle: float | None = None
    temperature_moyenne_annuelle: float | None = None
    precipitation_totale_annuelle: float | None = None
    bilan_hydrique_annuel: float | None = None
    nb_jours_mesures_annuel: float | None = None
    percentile_niveau_historique: float | None = None
    classification_niveau_annuel: str | None = None
    niveau_moy_mobile_5ans: float | None = None


class PiezoTrend(BaseModel):
    code_bss: str
    saison: str
    code_departement: str | None = None
    nom_departement: str | None = None
    variation_annuelle_m: float | None = None
    fiabilite_tendance: float | None = None
    nb_points: int | None = None
    classification_tendance: str | None = None
    projection_variation_5ans_m: float | None = None


class PiezoPercentiles(BaseModel):
    p10: float | None = None
    p25: float | None = None
    p75: float | None = None
    p90: float | None = None
```

**Step 2: Create `backend/app/models/hydro.py`**

```python
from datetime import date
from pydantic import BaseModel


class HydroStation(BaseModel):
    code_station: str
    libelle_station: str | None = None
    code_site: str | None = None
    libelle_site: str | None = None
    code_cours_eau: str | None = None
    nom_cours_eau: str | None = None
    code_departement: str | None = None
    nom_departement: str | None = None
    date_ouverture_station: date | None = None
    longitude_station: float | None = None
    latitude_station: float | None = None
    grandeur_hydro_principale: str | None = None
    premiere_mesure: date | None = None
    derniere_mesure: date | None = None
    nb_jours_total: float | None = None
    nb_mois_total: int | None = None
    resultat_moyen_global: float | None = None
    resultat_min_global: float | None = None
    resultat_max_global: float | None = None
    resultat_stddev_global: float | None = None
    annee_dernier_bilan: int | None = None
    resultat_moyen_dern_annee: float | None = None
    classification_resultat_dern_annee: str | None = None
    percentile_resultat_dern_annee: float | None = None


class HydroDaily(BaseModel):
    date: date
    resultat_obs_elab: float | None = None
    grandeur_hydro_elab: str
    temperature_2m: float | None = None
    total_precipitation: float | None = None
    potential_evaporation: float | None = None


class HydroMonthly(BaseModel):
    mois: date
    resultat_moyen: float | None = None
    resultat_min: float | None = None
    resultat_max: float | None = None
    amplitude_mensuelle: float | None = None
    temperature_moyenne: float | None = None
    precipitation_totale: float | None = None
    evaporation_moyenne: float | None = None
    nb_jours_mesures: int | None = None
    resultat_moy_mobile_3m: float | None = None
    resultat_moy_mobile_12m: float | None = None
    precipitation_moy_mobile_12m: float | None = None
    variation_resultat_vs_mois_prec: float | None = None
    variation_resultat_vs_annee_prec: float | None = None


class HydroYearly(BaseModel):
    annee: int
    resultat_moyen_annuel: float | None = None
    resultat_min_annuel: float | None = None
    resultat_max_annuel: float | None = None
    amplitude_annuelle: float | None = None
    temperature_moyenne_annuelle: float | None = None
    precipitation_totale_annuelle: float | None = None
    nb_jours_mesures_annuel: float | None = None
    percentile_resultat_historique: float | None = None
    classification_resultat_annuel: str | None = None


class HydroTrend(BaseModel):
    code_station: str
    grandeur_hydro_elab: str | None = None
    saison: str
    code_departement: str | None = None
    nom_departement: str | None = None
    variation_annuelle: float | None = None
    fiabilite_tendance: float | None = None
    nb_points: int | None = None
    classification_tendance: str | None = None
    projection_variation_5ans: float | None = None


class HydroPercentiles(BaseModel):
    p10: float | None = None
    p25: float | None = None
    p75: float | None = None
    p90: float | None = None
```

**Step 3: Create `backend/app/models/common.py`**

```python
from pydantic import BaseModel


class Alert(BaseModel):
    code: str
    type: str  # 'piezo' or 'hydro'
    latitude: float | None = None
    longitude: float | None = None
    commune: str | None = None
    code_departement: str | None = None
    departement: str | None = None
    classification: str | None = None
    derniere_mesure: str | None = None


class NationalStats(BaseModel):
    total_piezo: int
    piezo_tres_bas: int
    piezo_bas: int
    piezo_normal: int
    piezo_haut: int
    piezo_tres_haut: int
    piezo_no_class: int
    total_hydro: int
    hydro_tres_bas: int
    hydro_bas: int
    hydro_normal: int
    hydro_haut: int
    hydro_tres_haut: int


class DepartmentStats(BaseModel):
    code_departement: str
    nom_departement: str | None = None
    nb_piezo: int
    nb_hydro: int
    pct_tres_bas: float | None = None
    avg_variation: float | None = None
```

**Step 4: Update `backend/app/models/__init__.py`**

```python
# Models re-exported for convenience
```

Keep it minimal — imports happen directly from submodules.

---

### Task 2: Remove `cached()` from cache.py

**Files:**
- Modify: `backend/app/cache.py`

**Step 1: Remove the `cached()` function**

Delete lines 36-53 (the `cached()` function and its `json` import usage). Keep `cache_key()`, `get_redis()`, and `cached_response()`. Also remove unused `json` import (only needed for `cached()`).

The file after edit:

```python
import hashlib
import json
import logging
from typing import Any, Callable, Awaitable

import redis.asyncio as redis
from starlette.responses import Response

from app.config import settings
from app.json_response import FastJSONResponse

logger = logging.getLogger(__name__)

pool: redis.ConnectionPool | None = None
try:
    pool = redis.ConnectionPool.from_url(
        settings.redis_url, decode_responses=False,
        socket_connect_timeout=5, socket_timeout=10,
    )
except Exception:
    logger.warning("Redis not configured, caching disabled")


def get_redis() -> redis.Redis | None:
    if pool is None:
        return None
    return redis.Redis(connection_pool=pool)


def cache_key(prefix: str, params: dict) -> str:
    raw = json.dumps(params, sort_keys=True, default=str)
    h = hashlib.sha256(raw.encode()).hexdigest()[:16]
    return f"hydro:{prefix}:{h}"


async def cached_response(prefix: str, params: dict, ttl: int, fetch_fn) -> Response:
    r = get_redis()
    key = cache_key(prefix, params)

    if r is not None:
        try:
            cached_val = await r.get(key)
            if cached_val:
                return Response(content=cached_val, media_type="application/json")
        except Exception as e:
            logger.debug("Redis error: %s", e)

    result = await fetch_fn()
    resp = FastJSONResponse(result)
    body = resp.body

    if r is not None:
        try:
            await r.setex(key, ttl, body)
        except Exception as e:
            logger.debug("Redis error: %s", e)

    return resp
```

Note: `json` import kept for `cache_key()` which uses `json.dumps`.

---

### Task 3: Create piezo router

**Files:**
- Create: `backend/app/routers/piezo.py`

Combines: station list, station detail, percentiles, daily/monthly/yearly timeseries, trends — all for piézo.

**Key changes vs old code:**
- Prefix: `/api/v1/piezo` (was split across `/stations`, `/timeseries`, `/trends`)
- All endpoints use `cached_response()` (no more `cached()` + manual `FastJSONResponse` + `X-Total-Count`)
- No more `limit`/`offset` on list/trends endpoints — return all rows
- `response_model` declared on all endpoints for Swagger
- Explicit SQL columns (no `SELECT *`)
- Station detail returns via `cached_response()` with 404 in fetch_fn

```python
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import cached_response
from app.database import get_db
from app.models.piezo import (
    PiezoDaily, PiezoMonthly, PiezoPercentiles, PiezoStation, PiezoTrend, PiezoYearly,
)

router = APIRouter(prefix="/api/v1/piezo", tags=["piezo"])

LIST_TTL = 3600         # 1h
DETAIL_TTL = 3600       # 1h
DAILY_TTL = 21600       # 6h
MONTHLY_TTL = 43200     # 12h
YEARLY_TTL = 86400      # 24h
PERCENTILES_TTL = 86400 # 24h
TRENDS_TTL = 43200      # 12h

ClassificationType = Literal["TRES_BAS", "BAS", "NORMAL", "HAUT", "TRES_HAUT"]
SaisonType = Literal["annuel", "printemps", "ete", "automne", "hiver"]
ClassificationTendanceType = Literal[
    "HAUSSE_FORTE", "HAUSSE_SIGNIFICATIVE", "STABLE", "BAISSE_SIGNIFICATIVE", "BAISSE_FORTE"
]


# ── Station list ──────────────────────────────────────────────────────

@router.get("/stations", response_model=list[PiezoStation])
async def list_stations(
    min_observations: Optional[int] = Query(None, ge=0),
    last_measurement_after: Optional[date] = Query(None),
    classification: Optional[list[ClassificationType]] = Query(None),
    code_departement: Optional[str] = Query(None, min_length=1, max_length=3),
    bbox: Optional[str] = Query(None, description="min_lon,min_lat,max_lon,max_lat"),
    search: Optional[str] = Query(None, min_length=2, max_length=100),
    db: AsyncSession = Depends(get_db),
):
    params = {
        "min_observations": min_observations,
        "last_measurement_after": last_measurement_after,
        "classification": classification,
        "code_departement": code_departement,
        "bbox": bbox,
        "search": search,
    }

    async def fetch():
        conditions = ["1=1"]
        bind = {}

        if min_observations is not None:
            conditions.append("nb_mesures_total >= :min_obs")
            bind["min_obs"] = min_observations
        if last_measurement_after is not None:
            conditions.append("derniere_mesure >= :last_after")
            bind["last_after"] = last_measurement_after
        if classification is not None:
            conditions.append("classification_derniere_annee = ANY(:classification)")
            bind["classification"] = classification
        if code_departement is not None:
            conditions.append("code_departement = :dept")
            bind["dept"] = code_departement
        if bbox is not None:
            try:
                parts = bbox.split(",")
                if len(parts) != 4:
                    raise ValueError
                min_lon, min_lat, max_lon, max_lat = (float(p) for p in parts)
            except ValueError:
                raise HTTPException(400, "Invalid bbox format")
            conditions.append("latitude BETWEEN :min_lat AND :max_lat")
            conditions.append("longitude BETWEEN :min_lon AND :max_lon")
            bind.update(min_lat=min_lat, max_lat=max_lat, min_lon=min_lon, max_lon=max_lon)
        if search is not None:
            conditions.append("(code_bss ILIKE :search OR nom_commune ILIKE :search)")
            bind["search"] = f"%{search}%"

        where = " AND ".join(conditions)
        query = f"""
            SELECT code_bss, bss_id, latitude, longitude, nom_commune,
                   code_departement, nom_departement, libelle_eh, codes_bdlisa,
                   altitude_station, date_debut_mesure, date_fin_mesure,
                   nb_mesures_total, nb_mois_total, premiere_mesure, derniere_mesure,
                   niveau_moyen_global, niveau_min_absolu, niveau_max_absolu,
                   niveau_stddev_global, amplitude_totale, profondeur_moyenne_globale,
                   temperature_moyenne_globale, precipitation_moyenne_mensuelle,
                   derniere_annee, niveau_derniere_annee, classification_derniere_annee,
                   percentile_derniere_annee, slope_niveau, r2_niveau, slope_precipitation,
                   nb_mois_tendance, tendance_classification, niveau_alerte, qualite_tendance
            FROM gold.dim_piezo_stations
            WHERE {where}
            ORDER BY code_bss
        """
        result = await db.execute(text(query), bind)
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("piezo_list", params, LIST_TTL, fetch)


# ── Station detail ────────────────────────────────────────────────────

@router.get("/stations/{code_bss:path}/percentiles", response_model=PiezoPercentiles)
async def get_percentiles(
    code_bss: str,
    db: AsyncSession = Depends(get_db),
):
    async def fetch():
        query = """
            SELECT
                PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY niveau_nappe_eau) AS p10,
                PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY niveau_nappe_eau) AS p25,
                PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY niveau_nappe_eau) AS p75,
                PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY niveau_nappe_eau) AS p90
            FROM gold.hubeau_daily_chroniques
            WHERE code_bss = :code AND niveau_nappe_eau IS NOT NULL
        """
        result = await db.execute(text(query), {"code": code_bss})
        row = result.mappings().first()
        if not row or row["p10"] is None:
            raise HTTPException(404, f"No data for piezo station {code_bss}")
        return dict(row)

    return await cached_response("piezo_pctl", {"code_bss": code_bss}, PERCENTILES_TTL, fetch)


@router.get("/stations/{code_bss:path}/daily", response_model=list[PiezoDaily])
async def get_daily(
    code_bss: str,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(3650, ge=1, le=36500),
    db: AsyncSession = Depends(get_db),
):
    params = {"code_bss": code_bss, "start_date": start_date, "end_date": end_date, "limit": limit}

    async def fetch():
        query = """
            SELECT date, niveau_nappe_eau, profondeur_nappe,
                   temperature_2m, total_precipitation, potential_evaporation
            FROM gold.hubeau_daily_chroniques
            WHERE code_bss = :code
        """
        bind = {"code": code_bss}
        if start_date is not None:
            query += " AND date >= :start_date"
            bind["start_date"] = start_date
        if end_date is not None:
            query += " AND date <= :end_date"
            bind["end_date"] = end_date
        query += " ORDER BY date LIMIT :limit"
        bind["limit"] = limit
        result = await db.execute(text(query), bind)
        rows = [dict(r) for r in result.mappings().all()]
        if not rows:
            exists = await db.execute(
                text("SELECT 1 FROM gold.dim_piezo_stations WHERE code_bss = :code"), {"code": code_bss}
            )
            if exists.first() is None:
                raise HTTPException(404, f"Piezo station {code_bss} not found")
        return rows

    return await cached_response("piezo_daily", params, DAILY_TTL, fetch)


@router.get("/stations/{code_bss:path}/monthly", response_model=list[PiezoMonthly])
async def get_monthly(
    code_bss: str,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(600, ge=1, le=1200),
    db: AsyncSession = Depends(get_db),
):
    params = {"code_bss": code_bss, "start_date": start_date, "end_date": end_date, "limit": limit}

    async def fetch():
        query = """
            SELECT mois, niveau_moyen, niveau_min, niveau_max, amplitude_mensuelle,
                   temperature_moyenne, precipitation_totale, evaporation_moyenne,
                   nb_jours_mesures, niveau_moy_mobile_3m, niveau_moy_mobile_12m,
                   precipitation_moy_mobile_12m, variation_niveau_vs_mois_prec,
                   variation_niveau_vs_annee_prec
            FROM gold.fct_monthly_chroniques
            WHERE code_bss = :code
        """
        bind = {"code": code_bss}
        if start_date is not None:
            query += " AND mois >= :start_date"
            bind["start_date"] = start_date
        if end_date is not None:
            query += " AND mois <= :end_date"
            bind["end_date"] = end_date
        query += " ORDER BY mois LIMIT :limit"
        bind["limit"] = limit
        result = await db.execute(text(query), bind)
        rows = [dict(r) for r in result.mappings().all()]
        if not rows:
            exists = await db.execute(
                text("SELECT 1 FROM gold.dim_piezo_stations WHERE code_bss = :code"), {"code": code_bss}
            )
            if exists.first() is None:
                raise HTTPException(404, f"Piezo station {code_bss} not found")
        return rows

    return await cached_response("piezo_monthly", params, MONTHLY_TTL, fetch)


@router.get("/stations/{code_bss:path}/yearly", response_model=list[PiezoYearly])
async def get_yearly(
    code_bss: str,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    params = {"code_bss": code_bss, "start_date": start_date, "end_date": end_date, "limit": limit}

    async def fetch():
        query = """
            SELECT annee, niveau_moyen_annuel, niveau_min_annuel, niveau_max_annuel,
                   amplitude_annuelle, temperature_moyenne_annuelle,
                   precipitation_totale_annuelle, bilan_hydrique_annuel,
                   nb_jours_mesures_annuel, percentile_niveau_historique,
                   classification_niveau_annuel, niveau_moy_mobile_5ans
            FROM gold.fct_yearly_stats
            WHERE code_bss = :code
        """
        bind = {"code": code_bss}
        if start_date is not None:
            query += " AND annee >= :start_year"
            bind["start_year"] = start_date.year
        if end_date is not None:
            query += " AND annee <= :end_year"
            bind["end_year"] = end_date.year
        query += " ORDER BY annee LIMIT :limit"
        bind["limit"] = limit
        result = await db.execute(text(query), bind)
        rows = [dict(r) for r in result.mappings().all()]
        if not rows:
            exists = await db.execute(
                text("SELECT 1 FROM gold.dim_piezo_stations WHERE code_bss = :code"), {"code": code_bss}
            )
            if exists.first() is None:
                raise HTTPException(404, f"Piezo station {code_bss} not found")
        return rows

    return await cached_response("piezo_yearly", params, YEARLY_TTL, fetch)


@router.get("/stations/{code_bss:path}", response_model=PiezoStation)
async def get_station(
    code_bss: str,
    db: AsyncSession = Depends(get_db),
):
    async def fetch():
        query = """
            SELECT code_bss, bss_id, latitude, longitude, nom_commune,
                   code_departement, nom_departement, libelle_eh, codes_bdlisa,
                   altitude_station, date_debut_mesure, date_fin_mesure,
                   nb_mesures_total, nb_mois_total, premiere_mesure, derniere_mesure,
                   niveau_moyen_global, niveau_min_absolu, niveau_max_absolu,
                   niveau_stddev_global, amplitude_totale, profondeur_moyenne_globale,
                   temperature_moyenne_globale, precipitation_moyenne_mensuelle,
                   derniere_annee, niveau_derniere_annee, classification_derniere_annee,
                   percentile_derniere_annee, slope_niveau, r2_niveau, slope_precipitation,
                   nb_mois_tendance, tendance_classification, niveau_alerte, qualite_tendance
            FROM gold.dim_piezo_stations WHERE code_bss = :code
        """
        result = await db.execute(text(query), {"code": code_bss})
        row = result.mappings().first()
        if not row:
            raise HTTPException(404, f"Piezo station {code_bss} not found")
        return dict(row)

    return await cached_response("piezo_detail", {"code_bss": code_bss}, DETAIL_TTL, fetch)


# ── Trends ────────────────────────────────────────────────────────────

@router.get("/trends", response_model=list[PiezoTrend])
async def get_trends(
    saison: Optional[SaisonType] = Query(None),
    code_departement: Optional[str] = Query(None, min_length=1, max_length=3),
    classification_tendance: Optional[ClassificationTendanceType] = Query(None),
    fiabilite_min: Optional[float] = Query(None),
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    params = {
        "saison": saison, "code_departement": code_departement,
        "classification_tendance": classification_tendance,
        "fiabilite_min": fiabilite_min, "active_only": active_only,
    }

    async def fetch():
        conditions = ["1=1"]
        bind = {}
        if active_only:
            conditions.append(
                "code_bss IN (SELECT code_bss FROM gold.dim_piezo_stations WHERE derniere_mesure >= :year_start)"
            )
            bind["year_start"] = date(date.today().year, 1, 1)
        if saison is not None:
            conditions.append("saison = :saison")
            bind["saison"] = saison
        if code_departement is not None:
            conditions.append("code_departement = :dept")
            bind["dept"] = code_departement
        if classification_tendance is not None:
            conditions.append("classification_tendance = :classif")
            bind["classif"] = classification_tendance
        if fiabilite_min is not None:
            conditions.append("fiabilite_tendance >= :fiab_min")
            bind["fiab_min"] = fiabilite_min

        where = " AND ".join(conditions)
        query = f"""
            SELECT code_bss, saison, code_departement, nom_departement,
                   variation_annuelle_m, fiabilite_tendance, nb_points,
                   classification_tendance, projection_variation_5ans_m
            FROM gold.agg_station_trends
            WHERE {where}
            ORDER BY code_bss
        """
        result = await db.execute(text(query), bind)
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("piezo_trends", params, TRENDS_TTL, fetch)
```

**IMPORTANT:** The `get_station` endpoint (station detail) MUST come AFTER the sub-path endpoints (percentiles, daily, monthly, yearly) because FastAPI matches routes in declaration order. `{code_bss:path}` would otherwise swallow `/stations/XXX/daily`.

---

### Task 4: Create hydro router

**Files:**
- Create: `backend/app/routers/hydro.py`

Same structure as piezo router, adapted for hydro domain. Key differences:
- Primary key: `code_station` (not `code_bss`)
- Tables: `dim_hydro_stations`, `hydro_daily_chroniques`, `fct_monthly_hydro`, `fct_yearly_hydro`, `agg_hydro_trends`
- Extra filter: `grandeur_hydro` on station list, `grandeur_hydro_elab` on trends
- Lat/lon columns: `latitude_station`, `longitude_station`
- Classification column: `classification_resultat_dern_annee`

```python
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import cached_response
from app.database import get_db
from app.models.hydro import (
    HydroDaily, HydroMonthly, HydroPercentiles, HydroStation, HydroTrend, HydroYearly,
)

router = APIRouter(prefix="/api/v1/hydro", tags=["hydro"])

LIST_TTL = 3600
DETAIL_TTL = 3600
DAILY_TTL = 21600
MONTHLY_TTL = 43200
YEARLY_TTL = 86400
PERCENTILES_TTL = 86400
TRENDS_TTL = 43200

ClassificationType = Literal["TRES_BAS", "BAS", "NORMAL", "HAUT", "TRES_HAUT"]
SaisonType = Literal["annuel", "printemps", "ete", "automne", "hiver"]
ClassificationTendanceType = Literal[
    "HAUSSE_FORTE", "HAUSSE_SIGNIFICATIVE", "STABLE", "BAISSE_SIGNIFICATIVE", "BAISSE_FORTE"
]


@router.get("/stations", response_model=list[HydroStation])
async def list_stations(
    min_observations: Optional[int] = Query(None, ge=0),
    last_measurement_after: Optional[date] = Query(None),
    classification: Optional[list[ClassificationType]] = Query(None),
    code_departement: Optional[str] = Query(None, min_length=1, max_length=3),
    grandeur_hydro: Optional[str] = Query(None),
    bbox: Optional[str] = Query(None, description="min_lon,min_lat,max_lon,max_lat"),
    search: Optional[str] = Query(None, min_length=2, max_length=100),
    db: AsyncSession = Depends(get_db),
):
    params = {
        "min_observations": min_observations,
        "last_measurement_after": last_measurement_after,
        "classification": classification,
        "code_departement": code_departement,
        "grandeur_hydro": grandeur_hydro,
        "bbox": bbox,
        "search": search,
    }

    async def fetch():
        conditions = ["1=1"]
        bind = {}

        if min_observations is not None:
            conditions.append("nb_jours_total >= :min_obs")
            bind["min_obs"] = min_observations
        if last_measurement_after is not None:
            conditions.append("derniere_mesure >= :last_after")
            bind["last_after"] = last_measurement_after
        if classification is not None:
            conditions.append("classification_resultat_dern_annee = ANY(:classification)")
            bind["classification"] = classification
        if code_departement is not None:
            conditions.append("code_departement = :dept")
            bind["dept"] = code_departement
        if grandeur_hydro is not None:
            conditions.append("grandeur_hydro_principale = :grandeur_hydro")
            bind["grandeur_hydro"] = grandeur_hydro
        if bbox is not None:
            try:
                parts = bbox.split(",")
                if len(parts) != 4:
                    raise ValueError
                min_lon, min_lat, max_lon, max_lat = (float(p) for p in parts)
            except ValueError:
                raise HTTPException(400, "Invalid bbox format")
            conditions.append("latitude_station BETWEEN :min_lat AND :max_lat")
            conditions.append("longitude_station BETWEEN :min_lon AND :max_lon")
            bind.update(min_lat=min_lat, max_lat=max_lat, min_lon=min_lon, max_lon=max_lon)
        if search is not None:
            conditions.append("(code_station ILIKE :search OR libelle_station ILIKE :search OR nom_cours_eau ILIKE :search)")
            bind["search"] = f"%{search}%"

        where = " AND ".join(conditions)
        query = f"""
            SELECT code_station, libelle_station, code_site, libelle_site,
                   code_cours_eau, nom_cours_eau, code_departement, nom_departement,
                   date_ouverture_station, longitude_station, latitude_station,
                   grandeur_hydro_principale, premiere_mesure, derniere_mesure,
                   nb_jours_total, nb_mois_total, resultat_moyen_global,
                   resultat_min_global, resultat_max_global, resultat_stddev_global,
                   annee_dernier_bilan, resultat_moyen_dern_annee,
                   classification_resultat_dern_annee, percentile_resultat_dern_annee
            FROM gold.dim_hydro_stations
            WHERE {where}
            ORDER BY code_station
        """
        result = await db.execute(text(query), bind)
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("hydro_list", params, LIST_TTL, fetch)


@router.get("/stations/{code_station}/percentiles", response_model=HydroPercentiles)
async def get_percentiles(
    code_station: str,
    db: AsyncSession = Depends(get_db),
):
    async def fetch():
        query = """
            SELECT
                PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY resultat_obs_elab) AS p10,
                PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY resultat_obs_elab) AS p25,
                PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY resultat_obs_elab) AS p75,
                PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY resultat_obs_elab) AS p90
            FROM gold.hydro_daily_chroniques
            WHERE code_station = :code AND resultat_obs_elab IS NOT NULL
        """
        result = await db.execute(text(query), {"code": code_station})
        row = result.mappings().first()
        if not row or row["p10"] is None:
            raise HTTPException(404, f"No data for hydro station {code_station}")
        return dict(row)

    return await cached_response("hydro_pctl", {"code_station": code_station}, PERCENTILES_TTL, fetch)


@router.get("/stations/{code_station}/daily", response_model=list[HydroDaily])
async def get_daily(
    code_station: str,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(3650, ge=1, le=36500),
    db: AsyncSession = Depends(get_db),
):
    params = {"code_station": code_station, "start_date": start_date, "end_date": end_date, "limit": limit}

    async def fetch():
        query = """
            SELECT date, resultat_obs_elab, grandeur_hydro_elab,
                   temperature_2m, total_precipitation, potential_evaporation
            FROM gold.hydro_daily_chroniques
            WHERE code_station = :code
        """
        bind = {"code": code_station}
        if start_date is not None:
            query += " AND date >= :start_date"
            bind["start_date"] = start_date
        if end_date is not None:
            query += " AND date <= :end_date"
            bind["end_date"] = end_date
        query += " ORDER BY date LIMIT :limit"
        bind["limit"] = limit
        result = await db.execute(text(query), bind)
        rows = [dict(r) for r in result.mappings().all()]
        if not rows:
            exists = await db.execute(
                text("SELECT 1 FROM gold.dim_hydro_stations WHERE code_station = :code"), {"code": code_station}
            )
            if exists.first() is None:
                raise HTTPException(404, f"Hydro station {code_station} not found")
        return rows

    return await cached_response("hydro_daily", params, DAILY_TTL, fetch)


@router.get("/stations/{code_station}/monthly", response_model=list[HydroMonthly])
async def get_monthly(
    code_station: str,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(600, ge=1, le=1200),
    db: AsyncSession = Depends(get_db),
):
    params = {"code_station": code_station, "start_date": start_date, "end_date": end_date, "limit": limit}

    async def fetch():
        query = """
            SELECT mois, resultat_moyen, resultat_min, resultat_max, amplitude_mensuelle,
                   temperature_moyenne, precipitation_totale, evaporation_moyenne,
                   nb_jours_mesures, resultat_moy_mobile_3m, resultat_moy_mobile_12m,
                   precipitation_moy_mobile_12m, variation_resultat_vs_mois_prec,
                   variation_resultat_vs_annee_prec
            FROM gold.fct_monthly_hydro
            WHERE code_station = :code
        """
        bind = {"code": code_station}
        if start_date is not None:
            query += " AND mois >= :start_date"
            bind["start_date"] = start_date
        if end_date is not None:
            query += " AND mois <= :end_date"
            bind["end_date"] = end_date
        query += " ORDER BY mois LIMIT :limit"
        bind["limit"] = limit
        result = await db.execute(text(query), bind)
        rows = [dict(r) for r in result.mappings().all()]
        if not rows:
            exists = await db.execute(
                text("SELECT 1 FROM gold.dim_hydro_stations WHERE code_station = :code"), {"code": code_station}
            )
            if exists.first() is None:
                raise HTTPException(404, f"Hydro station {code_station} not found")
        return rows

    return await cached_response("hydro_monthly", params, MONTHLY_TTL, fetch)


@router.get("/stations/{code_station}/yearly", response_model=list[HydroYearly])
async def get_yearly(
    code_station: str,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    params = {"code_station": code_station, "start_date": start_date, "end_date": end_date, "limit": limit}

    async def fetch():
        query = """
            SELECT annee, resultat_moyen_annuel, resultat_min_annuel, resultat_max_annuel,
                   amplitude_annuelle, temperature_moyenne_annuelle,
                   precipitation_totale_annuelle, nb_jours_mesures_annuel,
                   percentile_resultat_historique, classification_resultat_annuel
            FROM gold.fct_yearly_hydro
            WHERE code_station = :code
        """
        bind = {"code": code_station}
        if start_date is not None:
            query += " AND annee >= :start_year"
            bind["start_year"] = start_date.year
        if end_date is not None:
            query += " AND annee <= :end_year"
            bind["end_year"] = end_date.year
        query += " ORDER BY annee LIMIT :limit"
        bind["limit"] = limit
        result = await db.execute(text(query), bind)
        rows = [dict(r) for r in result.mappings().all()]
        if not rows:
            exists = await db.execute(
                text("SELECT 1 FROM gold.dim_hydro_stations WHERE code_station = :code"), {"code": code_station}
            )
            if exists.first() is None:
                raise HTTPException(404, f"Hydro station {code_station} not found")
        return rows

    return await cached_response("hydro_yearly", params, YEARLY_TTL, fetch)


@router.get("/stations/{code_station}", response_model=HydroStation)
async def get_station(
    code_station: str,
    db: AsyncSession = Depends(get_db),
):
    async def fetch():
        query = """
            SELECT code_station, libelle_station, code_site, libelle_site,
                   code_cours_eau, nom_cours_eau, code_departement, nom_departement,
                   date_ouverture_station, longitude_station, latitude_station,
                   grandeur_hydro_principale, premiere_mesure, derniere_mesure,
                   nb_jours_total, nb_mois_total, resultat_moyen_global,
                   resultat_min_global, resultat_max_global, resultat_stddev_global,
                   annee_dernier_bilan, resultat_moyen_dern_annee,
                   classification_resultat_dern_annee, percentile_resultat_dern_annee
            FROM gold.dim_hydro_stations WHERE code_station = :code
        """
        result = await db.execute(text(query), {"code": code_station})
        row = result.mappings().first()
        if not row:
            raise HTTPException(404, f"Hydro station {code_station} not found")
        return dict(row)

    return await cached_response("hydro_detail", {"code_station": code_station}, DETAIL_TTL, fetch)


@router.get("/trends", response_model=list[HydroTrend])
async def get_trends(
    saison: Optional[SaisonType] = Query(None),
    code_departement: Optional[str] = Query(None, min_length=1, max_length=3),
    classification_tendance: Optional[ClassificationTendanceType] = Query(None),
    fiabilite_min: Optional[float] = Query(None),
    grandeur_hydro_elab: Optional[str] = Query(None),
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    params = {
        "saison": saison, "code_departement": code_departement,
        "classification_tendance": classification_tendance,
        "fiabilite_min": fiabilite_min, "grandeur_hydro_elab": grandeur_hydro_elab,
        "active_only": active_only,
    }

    async def fetch():
        conditions = ["1=1"]
        bind = {}
        if active_only:
            conditions.append(
                "code_station IN (SELECT code_station FROM gold.dim_hydro_stations WHERE derniere_mesure >= :year_start)"
            )
            bind["year_start"] = date(date.today().year, 1, 1)
        if saison is not None:
            conditions.append("saison = :saison")
            bind["saison"] = saison
        if code_departement is not None:
            conditions.append("code_departement = :dept")
            bind["dept"] = code_departement
        if classification_tendance is not None:
            conditions.append("classification_tendance = :classif")
            bind["classif"] = classification_tendance
        if fiabilite_min is not None:
            conditions.append("fiabilite_tendance >= :fiab_min")
            bind["fiab_min"] = fiabilite_min
        if grandeur_hydro_elab is not None:
            conditions.append("grandeur_hydro_elab = :grandeur")
            bind["grandeur"] = grandeur_hydro_elab

        where = " AND ".join(conditions)
        query = f"""
            SELECT code_station, grandeur_hydro_elab, saison, code_departement, nom_departement,
                   variation_annuelle, fiabilite_tendance, nb_points,
                   classification_tendance, projection_variation_5ans
            FROM gold.agg_hydro_trends
            WHERE {where}
            ORDER BY code_station
        """
        result = await db.execute(text(query), bind)
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("hydro_trends", params, TRENDS_TTL, fetch)
```

---

### Task 5: Create common router

**Files:**
- Create: `backend/app/routers/common.py`

Contains: GeoJSON, alerts, national stats, department stats. Drops the unused compare endpoint.

```python
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import cached_response
from app.database import get_db
from app.models.common import Alert, DepartmentStats, NationalStats

router = APIRouter(prefix="/api/v1/common", tags=["common"])

GEOJSON_TTL = 3600
ALERTS_TTL = 3600
STATS_TTL = 21600

SeverityType = Literal["TRES_BAS", "BAS", "HAUT", "TRES_HAUT"]


@router.get("/stations/geojson")
async def get_stations_geojson(
    type: Optional[Literal["piezo", "hydro", "all"]] = Query("all"),
    db: AsyncSession = Depends(get_db),
):
    params = {"type": type}

    async def fetch():
        features = []

        if type in (None, "all", "piezo"):
            result = await db.execute(text("""
                SELECT code_bss AS code, 'piezo' AS type,
                       latitude, longitude, nom_commune AS commune,
                       code_departement, nom_departement AS departement,
                       classification_derniere_annee AS classification,
                       codes_bdlisa, derniere_mesure
                FROM gold.dim_piezo_stations
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
            """))
            for row in result.mappings().all():
                r = dict(row)
                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [r["longitude"], r["latitude"]]},
                    "properties": {
                        "code": r["code"], "type": r["type"],
                        "classification": r["classification"],
                        "commune": r["commune"], "departement": r["departement"],
                        "code_departement": r["code_departement"],
                        "codes_bdlisa": r["codes_bdlisa"],
                        "derniere_mesure": str(r["derniere_mesure"]) if r["derniere_mesure"] else None,
                    },
                })

        if type in (None, "all", "hydro"):
            result = await db.execute(text("""
                SELECT code_station AS code, 'hydro' AS type,
                       latitude_station AS latitude, longitude_station AS longitude,
                       libelle_station AS commune,
                       code_departement, nom_departement AS departement,
                       classification_resultat_dern_annee AS classification,
                       LEFT(code_cours_eau, 1) AS code_district, derniere_mesure
                FROM gold.dim_hydro_stations
                WHERE latitude_station IS NOT NULL AND longitude_station IS NOT NULL
            """))
            for row in result.mappings().all():
                r = dict(row)
                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [r["longitude"], r["latitude"]]},
                    "properties": {
                        "code": r["code"], "type": r["type"],
                        "classification": r["classification"],
                        "commune": r["commune"], "departement": r["departement"],
                        "code_departement": r["code_departement"],
                        "code_district": r["code_district"],
                        "derniere_mesure": str(r["derniere_mesure"]) if r["derniere_mesure"] else None,
                    },
                })

        return {"type": "FeatureCollection", "features": features}

    return await cached_response("stations_geojson", params, GEOJSON_TTL, fetch)


@router.get("/alerts", response_model=list[Alert])
async def list_alerts(
    severity: Optional[list[SeverityType]] = Query(None),
    type: Optional[Literal["piezo", "hydro"]] = Query(None),
    code_departement: Optional[str] = Query(None, min_length=1, max_length=3),
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    severity_list = severity if severity is not None else ["TRES_BAS", "TRES_HAUT"]
    params = {
        "severity": severity_list, "type": type,
        "code_departement": code_departement, "active_only": active_only,
    }

    async def fetch():
        parts = []
        bind = {"severity": severity_list}
        year_start = date(date.today().year, 1, 1)

        if type is None or type == "piezo":
            conds = ["classification_derniere_annee = ANY(:severity)"]
            if code_departement:
                conds.append("code_departement = :dept")
            if active_only:
                conds.append("derniere_mesure >= :year_start")
                bind["year_start"] = year_start
            parts.append(f"""
                SELECT code_bss AS code, 'piezo' AS type,
                       latitude, longitude,
                       nom_commune AS commune, code_departement, nom_departement AS departement,
                       classification_derniere_annee AS classification, derniere_mesure
                FROM gold.dim_piezo_stations
                WHERE {" AND ".join(conds)}
            """)

        if type is None or type == "hydro":
            conds = ["classification_resultat_dern_annee = ANY(:severity)"]
            if code_departement:
                conds.append("code_departement = :dept")
            if active_only:
                conds.append("derniere_mesure >= :year_start")
                bind["year_start"] = year_start
            parts.append(f"""
                SELECT code_station AS code, 'hydro' AS type,
                       latitude_station AS latitude, longitude_station AS longitude,
                       libelle_station AS commune, code_departement, nom_departement AS departement,
                       classification_resultat_dern_annee AS classification, derniere_mesure
                FROM gold.dim_hydro_stations
                WHERE {" AND ".join(conds)}
            """)

        if code_departement:
            bind["dept"] = code_departement

        union = " UNION ALL ".join(parts)
        query = f"{union} ORDER BY classification, code"
        result = await db.execute(text(query), bind)
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("alerts", params, ALERTS_TTL, fetch)


@router.get("/stats/national", response_model=NationalStats)
async def get_national_stats(db: AsyncSession = Depends(get_db)):
    async def fetch():
        result = await db.execute(text("""
            WITH piezo AS (
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE classification_derniere_annee = 'TRES_BAS') AS tres_bas,
                       count(*) FILTER (WHERE classification_derniere_annee = 'BAS') AS bas,
                       count(*) FILTER (WHERE classification_derniere_annee = 'NORMAL') AS normal,
                       count(*) FILTER (WHERE classification_derniere_annee = 'HAUT') AS haut,
                       count(*) FILTER (WHERE classification_derniere_annee = 'TRES_HAUT') AS tres_haut,
                       count(*) FILTER (WHERE classification_derniere_annee IS NULL) AS no_class
                FROM gold.dim_piezo_stations
            ),
            hydro AS (
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE classification_resultat_dern_annee = 'TRES_BAS') AS tres_bas,
                       count(*) FILTER (WHERE classification_resultat_dern_annee = 'BAS') AS bas,
                       count(*) FILTER (WHERE classification_resultat_dern_annee = 'NORMAL') AS normal,
                       count(*) FILTER (WHERE classification_resultat_dern_annee = 'HAUT') AS haut,
                       count(*) FILTER (WHERE classification_resultat_dern_annee = 'TRES_HAUT') AS tres_haut
                FROM gold.dim_hydro_stations
            )
            SELECT p.total AS total_piezo, p.tres_bas AS piezo_tres_bas, p.bas AS piezo_bas,
                   p.normal AS piezo_normal, p.haut AS piezo_haut, p.tres_haut AS piezo_tres_haut,
                   p.no_class AS piezo_no_class,
                   h.total AS total_hydro, h.tres_bas AS hydro_tres_bas, h.bas AS hydro_bas,
                   h.normal AS hydro_normal, h.haut AS hydro_haut, h.tres_haut AS hydro_tres_haut
            FROM piezo p CROSS JOIN hydro h
        """))
        return dict(result.mappings().fetchone())

    return await cached_response("national_stats", {}, STATS_TTL, fetch)


@router.get("/stats/departments", response_model=list[DepartmentStats])
async def get_department_stats(db: AsyncSession = Depends(get_db)):
    async def fetch():
        result = await db.execute(text("""
            WITH piezo AS (
                SELECT code_departement, nom_departement,
                       count(*) AS nb_piezo,
                       count(*) FILTER (WHERE classification_derniere_annee = 'TRES_BAS') AS tres_bas
                FROM gold.dim_piezo_stations
                WHERE code_departement IS NOT NULL
                GROUP BY code_departement, nom_departement
            ),
            hydro AS (
                SELECT code_departement, count(*) AS nb_hydro
                FROM gold.dim_hydro_stations
                WHERE code_departement IS NOT NULL
                GROUP BY code_departement
            ),
            trends AS (
                SELECT code_departement, avg(variation_annuelle_m) AS avg_variation
                FROM gold.agg_station_trends
                WHERE saison = 'annuel'
                GROUP BY code_departement
            )
            SELECT p.code_departement, p.nom_departement,
                   p.nb_piezo, COALESCE(h.nb_hydro, 0) AS nb_hydro,
                   ROUND(p.tres_bas::numeric / NULLIF(p.nb_piezo, 0) * 100, 1) AS pct_tres_bas,
                   t.avg_variation
            FROM piezo p
            LEFT JOIN hydro h ON p.code_departement = h.code_departement
            LEFT JOIN trends t ON p.code_departement = t.code_departement
            ORDER BY p.code_departement
        """))
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("department_stats", {}, STATS_TTL, fetch)
```

---

### Task 6: Update main.py

**Files:**
- Modify: `backend/app/main.py`

**Changes:**
- Replace router imports: `stations, timeseries, trends, stats, alerts` → `piezo, hydro, common`
- Update `include_router()` calls

```python
# Replace these imports:
from app.routers import stations, timeseries, trends, stats, era5, alerts, wfs

# With:
from app.routers import piezo, hydro, common, era5, wfs

# Replace these registrations:
app.include_router(stations.router)
app.include_router(timeseries.router)
app.include_router(trends.router)
app.include_router(stats.router)
app.include_router(era5.router)
app.include_router(alerts.router)
app.include_router(wfs.router)

# With:
app.include_router(piezo.router)
app.include_router(hydro.router)
app.include_router(common.router)
app.include_router(era5.router)
app.include_router(wfs.router)
```

---

### Task 7: Delete old files

**Files to delete:**
- `backend/app/routers/stations.py`
- `backend/app/routers/timeseries.py`
- `backend/app/routers/trends.py`
- `backend/app/routers/stats.py`
- `backend/app/routers/alerts.py`
- `backend/app/models/station.py`
- `backend/app/models/timeseries.py`

Run: `rm backend/app/routers/{stations,timeseries,trends,stats,alerts}.py backend/app/models/{station,timeseries}.py`

---

### Task 8: Update frontend api.ts

**Files:**
- Modify: `frontend/src/lib/api.ts`

URL mapping (old → new):

| Old path | New path |
|---|---|
| `/stations/piezo` | `/piezo/stations` |
| `/stations/hydro` | `/hydro/stations` |
| `/stations/piezo/{code}` | `/piezo/stations/{code}` |
| `/stations/hydro/{code}` | `/hydro/stations/{code}` |
| `/stations/piezo/{code}/percentiles` | `/piezo/stations/{code}/percentiles` |
| `/stations/hydro/{code}/percentiles` | `/hydro/stations/{code}/percentiles` |
| `/stations/geojson` | `/common/stations/geojson` |
| `/timeseries/piezo/{code}/daily` | `/piezo/stations/{code}/daily` |
| `/timeseries/hydro/{code}/daily` | `/hydro/stations/{code}/daily` |
| `/timeseries/piezo/{code}/monthly` | `/piezo/stations/{code}/monthly` |
| `/timeseries/hydro/{code}/monthly` | `/hydro/stations/{code}/monthly` |
| `/timeseries/piezo/{code}/yearly` | `/piezo/stations/{code}/yearly` |
| `/timeseries/hydro/{code}/yearly` | `/hydro/stations/{code}/yearly` |
| `/trends/piezo` | `/piezo/trends` |
| `/trends/hydro` | `/hydro/trends` |
| `/alerts` | `/common/alerts` |
| `/stats/national` | `/common/stats/national` |
| `/stats/departments` | `/common/stats/departments` |

New `api.ts` structure (regrouped to match backend):

```typescript
export const api = {
  piezo: {
    stations: (params?: Record<string, string | string[] | undefined>) =>
      fetchJson<PiezoStation[]>('/piezo/stations', params),
    detail: (code: string) => fetchJson<PiezoStation>(`/piezo/stations/${code}`),
    percentiles: (code: string) =>
      fetchJson<StationPercentiles>(`/piezo/stations/${encodeURIComponent(code)}/percentiles`),
    daily: (code: string, params?: Record<string, string | undefined>) =>
      fetchJson<DailyPiezoMeasurement[]>(`/piezo/stations/${code}/daily`, params),
    monthly: (code: string) => fetchJson<MonthlyPiezoData[]>(`/piezo/stations/${code}/monthly`),
    yearly: (code: string) => fetchJson<YearlyPiezoData[]>(`/piezo/stations/${code}/yearly`),
    trends: (params?: Record<string, string | undefined>) => fetchJson<PiezoStation[]>('/piezo/trends', params),
  },
  hydro: {
    stations: (params?: Record<string, string | string[] | undefined>) =>
      fetchJson<HydroStation[]>('/hydro/stations', params),
    detail: (code: string) => fetchJson<HydroStation>(`/hydro/stations/${code}`),
    percentiles: (code: string) =>
      fetchJson<StationPercentiles>(`/hydro/stations/${encodeURIComponent(code)}/percentiles`),
    daily: (code: string, params?: Record<string, string | undefined>) =>
      fetchJson<DailyHydroMeasurement[]>(`/hydro/stations/${code}/daily`, params),
    monthly: (code: string) => fetchJson<MonthlyHydroData[]>(`/hydro/stations/${code}/monthly`),
    yearly: (code: string) => fetchJson<YearlyHydroData[]>(`/hydro/stations/${code}/yearly`),
    trends: (params?: Record<string, string | undefined>) => fetchJson<HydroStation[]>('/hydro/trends', params),
  },
  common: {
    geojson: (stationType?: 'piezo' | 'hydro' | 'all') =>
      fetchJson<StationGeoJSON>('/common/stations/geojson', stationType ? { type: stationType } : undefined),
    alerts: (params?: Record<string, string | string[] | undefined>) =>
      fetchJson<Alert[]>('/common/alerts', params),
    statsNational: () => fetchJson<NationalStats>('/common/stats/national'),
    statsDepartments: () => fetchJson<DepartmentStats[]>('/common/stats/departments'),
  },
  era5: {
    grid: () => fetchJson<ERA5GridPoint[]>('/era5/grid'),
    snapshot: (date: string) => fetchJson<ERA5GridPoint[]>('/era5/snapshot', { date }),
    dates: () => fetchJson<string[]>('/era5/dates'),
    monthly: (month: string) => fetchJson<ERA5GridPoint[]>('/era5/monthly', { month }),
  },
  wfs: {
    layer: (layerId: string, bbox?: string) =>
      fetchJson<any>(`/wfs/${layerId}`, bbox ? { bbox } : undefined),
  },
}
```

---

### Task 9: Update all frontend call sites

**Files to modify (find & replace `api.` references):**

| File | Old call | New call |
|---|---|---|
| `hooks/useStations.ts` | `api.stations.piezo(filters)` | `api.piezo.stations(filters)` |
| `hooks/useStations.ts` | `api.stations.hydro(filters)` | `api.hydro.stations(filters)` |
| `hooks/useStations.ts` | `api.stations.piezoDetail(code)` | `api.piezo.detail(code)` |
| `hooks/useStations.ts` | `api.stations.hydroDetail(code)` | `api.hydro.detail(code)` |
| `hooks/useStations.ts` | `api.stations.geojson()` | `api.common.geojson()` |
| `hooks/useTimeseries.ts` | `api.timeseries.piezoMonthly(code)` | `api.piezo.monthly(code)` |
| `hooks/useTimeseries.ts` | `api.timeseries.hydroMonthly(code)` | `api.hydro.monthly(code)` |
| `hooks/useTimeseries.ts` | `api.timeseries.piezoYearly(code)` | `api.piezo.yearly(code)` |
| `hooks/useTimeseries.ts` | `api.timeseries.hydroYearly(code)` | `api.hydro.yearly(code)` |
| `hooks/useTimeseries.ts` | `api.timeseries.piezoDaily(code, ...)` | `api.piezo.daily(code, ...)` |
| `hooks/useTimeseries.ts` | `api.timeseries.hydroDaily(code, ...)` | `api.hydro.daily(code, ...)` |
| `pages/StationPage.tsx` | `api.stations.piezoPercentiles(code)` | `api.piezo.percentiles(code)` |
| `pages/StationPage.tsx` | `api.stations.hydroPercentiles(code)` | `api.hydro.percentiles(code)` |
| `pages/TrendsPage.tsx` | `api.stats.departments` | `api.common.statsDepartments` |
| `pages/TrendsPage.tsx` | `api.stats.national` | `api.common.statsNational` |
| `pages/AlertsPage.tsx` | `api.alerts.list(...)` | `api.common.alerts(...)` |
| `components/map/KPIBar.tsx` | `api.stats.national` | `api.common.statsNational` |
| `pages/ComparePage.tsx` | `api.timeseries.piezoMonthly(s.code)` | `api.piezo.monthly(s.code)` |
| `pages/ComparePage.tsx` | `api.timeseries.hydroMonthly(s.code)` | `api.hydro.monthly(s.code)` |

---

### Task 10: Build, lint, and verify

**Step 1: Lint backend**

Run: `cd backend && ruff check app/ && ruff format app/`

**Step 2: Type-check frontend**

Run: `cd frontend && npx tsc --noEmit`

**Step 3: Build frontend**

Run: `cd frontend && npm run build`

**Step 4: Docker build and smoke test**

Run:
```bash
docker compose up -d --build backend frontend
# Wait for startup
curl -s http://localhost:49510/api/v1/health | python3 -m json.tool
curl -s http://localhost:49510/api/v1/piezo/stations | head -c 200
curl -s http://localhost:49510/api/v1/hydro/stations | head -c 200
curl -s http://localhost:49510/api/v1/common/stats/national | python3 -m json.tool
curl -s http://localhost:49510/api/v1/common/alerts | head -c 200
curl -s http://localhost:49510/api/v1/era5/dates | head -c 200
```

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: regroup API into domain-based routers (piezo, hydro, common)

- Merge stations/timeseries/trends/stats/alerts into 3 domain routers
- Unify caching on cached_response() (remove cached())
- Add response_model Pydantic validation on all endpoints
- Explicit SQL columns everywhere (no SELECT *)
- Drop unused compare endpoint
- Drop pagination (limit/offset/X-Total-Count) on list endpoints
- Update frontend api.ts URLs to match new structure
- Clean up orphaned Pydantic models"
```

---

### Task 11: Flush Redis cache

After deploying the new API, all cached keys use different prefixes/params so old cache is stale. Flush Redis:

```bash
docker compose exec juno-redis redis-cli FLUSHDB
```
