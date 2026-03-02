import asyncio
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import cached_response
from app.database import get_db


router = APIRouter(prefix="/api/v1/timeseries", tags=["timeseries"])

DAILY_TTL = 21600       # 6h
MONTHLY_TTL = 43200     # 12h
YEARLY_TTL = 86400      # 24h
COMPARE_TTL = 1800      # 30min


@router.get("/piezo/{code_bss:path}/daily")
async def get_piezo_daily(
    code_bss: str,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(3650, ge=1, le=36500, description="Max rows returned (default 10 years)"),
    db: AsyncSession = Depends(get_db),
):
    params = {"code_bss": code_bss, "start_date": str(start_date), "end_date": str(end_date), "limit": limit}

    async def fetch():
        query = """
            SELECT date, niveau_nappe_eau, profondeur_nappe,
                   temperature_2m, total_precipitation, potential_evaporation
            FROM gold.hubeau_daily_chroniques
            WHERE code_bss = :code
        """
        bind_params = {"code": code_bss}
        if start_date is not None:
            query += " AND date >= :start_date"
            bind_params["start_date"] = start_date
        if end_date is not None:
            query += " AND date <= :end_date"
            bind_params["end_date"] = end_date
        query += " ORDER BY date LIMIT :limit"
        bind_params["limit"] = limit
        result = await db.execute(text(query), bind_params)
        rows = [dict(row) for row in result.mappings().all()]
        if not rows:
            exists = await db.execute(
                text("SELECT 1 FROM gold.dim_piezo_stations WHERE code_bss = :code"),
                {"code": code_bss},
            )
            if exists.first() is None:
                raise HTTPException(status_code=404, detail=f"Piezo station {code_bss} not found")
        return rows

    return await cached_response("piezo_daily", params, DAILY_TTL, fetch)


@router.get("/hydro/{code_station}/daily")
async def get_hydro_daily(
    code_station: str,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(3650, ge=1, le=36500, description="Max rows returned (default 10 years)"),
    db: AsyncSession = Depends(get_db),
):
    params = {"code_station": code_station, "start_date": str(start_date), "end_date": str(end_date), "limit": limit}

    async def fetch():
        query = """
            SELECT date, resultat_obs_elab, grandeur_hydro_elab,
                   temperature_2m, total_precipitation, potential_evaporation
            FROM gold.hydro_daily_chroniques
            WHERE code_station = :code
        """
        bind_params = {"code": code_station}
        if start_date is not None:
            query += " AND date >= :start_date"
            bind_params["start_date"] = start_date
        if end_date is not None:
            query += " AND date <= :end_date"
            bind_params["end_date"] = end_date
        query += " ORDER BY date LIMIT :limit"
        bind_params["limit"] = limit
        result = await db.execute(text(query), bind_params)
        rows = [dict(row) for row in result.mappings().all()]
        if not rows:
            exists = await db.execute(
                text("SELECT 1 FROM gold.dim_hydro_stations WHERE code_station = :code"),
                {"code": code_station},
            )
            if exists.first() is None:
                raise HTTPException(status_code=404, detail=f"Hydro station {code_station} not found")
        return rows

    return await cached_response("hydro_daily", params, DAILY_TTL, fetch)


@router.get("/piezo/{code_bss:path}/monthly")
async def get_piezo_monthly(
    code_bss: str,
    start_date: Optional[date] = Query(None, description="Filter mois >= start_date"),
    end_date: Optional[date] = Query(None, description="Filter mois <= end_date"),
    limit: int = Query(600, ge=1, le=1200, description="Max rows returned"),
    db: AsyncSession = Depends(get_db),
):
    params = {"code_bss": code_bss, "start_date": str(start_date), "end_date": str(end_date), "limit": limit}

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
        bind_params = {"code": code_bss}
        if start_date is not None:
            query += " AND mois >= :start_date"
            bind_params["start_date"] = start_date
        if end_date is not None:
            query += " AND mois <= :end_date"
            bind_params["end_date"] = end_date
        query += " ORDER BY mois LIMIT :limit"
        bind_params["limit"] = limit
        result = await db.execute(text(query), bind_params)
        rows = [dict(row) for row in result.mappings().all()]
        if not rows:
            exists = await db.execute(
                text("SELECT 1 FROM gold.dim_piezo_stations WHERE code_bss = :code"),
                {"code": code_bss},
            )
            if exists.first() is None:
                raise HTTPException(status_code=404, detail=f"Piezo station {code_bss} not found")
        return rows

    return await cached_response("piezo_monthly", params, MONTHLY_TTL, fetch)


@router.get("/hydro/{code_station}/monthly")
async def get_hydro_monthly(
    code_station: str,
    start_date: Optional[date] = Query(None, description="Filter mois >= start_date"),
    end_date: Optional[date] = Query(None, description="Filter mois <= end_date"),
    limit: int = Query(600, ge=1, le=1200, description="Max rows returned"),
    db: AsyncSession = Depends(get_db),
):
    params = {"code_station": code_station, "start_date": str(start_date), "end_date": str(end_date), "limit": limit}

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
        bind_params = {"code": code_station}
        if start_date is not None:
            query += " AND mois >= :start_date"
            bind_params["start_date"] = start_date
        if end_date is not None:
            query += " AND mois <= :end_date"
            bind_params["end_date"] = end_date
        query += " ORDER BY mois LIMIT :limit"
        bind_params["limit"] = limit
        result = await db.execute(text(query), bind_params)
        rows = [dict(row) for row in result.mappings().all()]
        if not rows:
            exists = await db.execute(
                text("SELECT 1 FROM gold.dim_hydro_stations WHERE code_station = :code"),
                {"code": code_station},
            )
            if exists.first() is None:
                raise HTTPException(status_code=404, detail=f"Hydro station {code_station} not found")
        return rows

    return await cached_response("hydro_monthly", params, MONTHLY_TTL, fetch)


@router.get("/piezo/{code_bss:path}/yearly")
async def get_piezo_yearly(
    code_bss: str,
    start_date: Optional[date] = Query(None, description="Filter annee >= year of start_date"),
    end_date: Optional[date] = Query(None, description="Filter annee <= year of end_date"),
    limit: int = Query(100, ge=1, le=200, description="Max rows returned"),
    db: AsyncSession = Depends(get_db),
):
    params = {"code_bss": code_bss, "start_date": str(start_date), "end_date": str(end_date), "limit": limit}

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
        bind_params = {"code": code_bss}
        if start_date is not None:
            query += " AND annee >= :start_year"
            bind_params["start_year"] = start_date.year
        if end_date is not None:
            query += " AND annee <= :end_year"
            bind_params["end_year"] = end_date.year
        query += " ORDER BY annee LIMIT :limit"
        bind_params["limit"] = limit
        result = await db.execute(text(query), bind_params)
        rows = [dict(row) for row in result.mappings().all()]
        if not rows:
            exists = await db.execute(
                text("SELECT 1 FROM gold.dim_piezo_stations WHERE code_bss = :code"),
                {"code": code_bss},
            )
            if exists.first() is None:
                raise HTTPException(status_code=404, detail=f"Piezo station {code_bss} not found")
        return rows

    return await cached_response("piezo_yearly", params, YEARLY_TTL, fetch)


@router.get("/hydro/{code_station}/yearly")
async def get_hydro_yearly(
    code_station: str,
    start_date: Optional[date] = Query(None, description="Filter annee >= year of start_date"),
    end_date: Optional[date] = Query(None, description="Filter annee <= year of end_date"),
    limit: int = Query(100, ge=1, le=200, description="Max rows returned"),
    db: AsyncSession = Depends(get_db),
):
    params = {"code_station": code_station, "start_date": str(start_date), "end_date": str(end_date), "limit": limit}

    async def fetch():
        query = """
            SELECT annee, resultat_moyen_annuel, resultat_min_annuel, resultat_max_annuel,
                   amplitude_annuelle, temperature_moyenne_annuelle,
                   precipitation_totale_annuelle, nb_jours_mesures_annuel,
                   percentile_resultat_historique, classification_resultat_annuel
            FROM gold.fct_yearly_hydro
            WHERE code_station = :code
        """
        bind_params = {"code": code_station}
        if start_date is not None:
            query += " AND annee >= :start_year"
            bind_params["start_year"] = start_date.year
        if end_date is not None:
            query += " AND annee <= :end_year"
            bind_params["end_year"] = end_date.year
        query += " ORDER BY annee LIMIT :limit"
        bind_params["limit"] = limit
        result = await db.execute(text(query), bind_params)
        rows = [dict(row) for row in result.mappings().all()]
        if not rows:
            exists = await db.execute(
                text("SELECT 1 FROM gold.dim_hydro_stations WHERE code_station = :code"),
                {"code": code_station},
            )
            if exists.first() is None:
                raise HTTPException(status_code=404, detail=f"Hydro station {code_station} not found")
        return rows

    return await cached_response("hydro_yearly", params, YEARLY_TTL, fetch)


GranularityType = Literal["daily", "monthly"]


@router.get("/compare")
async def compare_stations(
    stations: list[str] = Query(..., description="Station codes to compare (repeated query param)"),
    type: Literal["piezo", "hydro"] = Query(..., description="Station type"),
    granularity: GranularityType = Query("monthly", description="Data granularity"),
    db: AsyncSession = Depends(get_db),
):
    if len(stations) < 1 or len(stations) > 10:
        raise HTTPException(status_code=400, detail="Provide between 1 and 10 station codes")

    params = {"stations": sorted(stations), "type": type, "granularity": granularity}

    async def fetch():
        async def fetch_one(station_code: str):
            if type == "piezo":
                if granularity == "daily":
                    query = """
                        SELECT date, niveau_nappe_eau, profondeur_nappe
                        FROM gold.hubeau_daily_chroniques
                        WHERE code_bss = :code
                        ORDER BY date
                        LIMIT 3650
                    """
                else:
                    query = """
                        SELECT mois, niveau_moyen, niveau_min, niveau_max
                        FROM gold.fct_monthly_chroniques
                        WHERE code_bss = :code
                        ORDER BY mois
                    """
            else:  # hydro
                if granularity == "daily":
                    query = """
                        SELECT date, resultat_obs_elab, grandeur_hydro_elab
                        FROM gold.hydro_daily_chroniques
                        WHERE code_station = :code
                        ORDER BY date
                        LIMIT 3650
                    """
                else:
                    query = """
                        SELECT mois, resultat_moyen, resultat_min, resultat_max
                        FROM gold.fct_monthly_hydro
                        WHERE code_station = :code
                        ORDER BY mois
                    """

            res = await db.execute(text(query), {"code": station_code})
            return station_code, [dict(row) for row in res.mappings().all()]

        results = await asyncio.gather(*(fetch_one(code) for code in stations))
        return {code: rows for code, rows in results}

    return await cached_response("compare", params, COMPARE_TTL, fetch)
