from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import cached_response
from app.database import get_db


router = APIRouter(prefix="/api/v1/timeseries", tags=["timeseries"])

DAILY_TTL = 300
MONTHLY_TTL = 1800
YEARLY_TTL = 3600


@router.get("/piezo/{code_bss:path}/daily")
async def get_piezo_daily(
    code_bss: str,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    params = {"code_bss": code_bss, "start_date": str(start_date), "end_date": str(end_date)}

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
        query += " ORDER BY date"
        result = await db.execute(text(query), bind_params)
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("piezo_daily", params, DAILY_TTL, fetch)


@router.get("/hydro/{code_station}/daily")
async def get_hydro_daily(
    code_station: str,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    params = {"code_station": code_station, "start_date": str(start_date), "end_date": str(end_date)}

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
        query += " ORDER BY date"
        result = await db.execute(text(query), bind_params)
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("hydro_daily", params, DAILY_TTL, fetch)


@router.get("/piezo/{code_bss:path}/monthly")
async def get_piezo_monthly(
    code_bss: str,
    db: AsyncSession = Depends(get_db),
):
    async def fetch():
        query = """
            SELECT mois, niveau_moyen, niveau_min, niveau_max, amplitude_mensuelle,
                   temperature_moyenne, precipitation_totale, evaporation_moyenne,
                   nb_jours_mesures, niveau_moy_mobile_3m, niveau_moy_mobile_12m,
                   precipitation_moy_mobile_12m, variation_niveau_vs_mois_prec,
                   variation_niveau_vs_annee_prec
            FROM gold.fct_monthly_chroniques
            WHERE code_bss = :code
            ORDER BY mois
        """
        result = await db.execute(text(query), {"code": code_bss})
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("piezo_monthly", {"code_bss": code_bss}, MONTHLY_TTL, fetch)


@router.get("/hydro/{code_station}/monthly")
async def get_hydro_monthly(
    code_station: str,
    db: AsyncSession = Depends(get_db),
):
    async def fetch():
        query = """
            SELECT mois, resultat_moyen, resultat_min, resultat_max, amplitude_mensuelle,
                   temperature_moyenne, precipitation_totale, evaporation_moyenne,
                   nb_jours_mesures, resultat_moy_mobile_3m, resultat_moy_mobile_12m,
                   precipitation_moy_mobile_12m, variation_resultat_vs_mois_prec,
                   variation_resultat_vs_annee_prec
            FROM gold.fct_monthly_hydro
            WHERE code_station = :code
            ORDER BY mois
        """
        result = await db.execute(text(query), {"code": code_station})
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("hydro_monthly", {"code_station": code_station}, MONTHLY_TTL, fetch)


@router.get("/piezo/{code_bss:path}/yearly")
async def get_piezo_yearly(
    code_bss: str,
    db: AsyncSession = Depends(get_db),
):
    async def fetch():
        query = """
            SELECT annee, niveau_moyen_annuel, niveau_min_annuel, niveau_max_annuel,
                   amplitude_annuelle, temperature_moyenne_annuelle,
                   precipitation_totale_annuelle, bilan_hydrique_annuel,
                   nb_jours_mesures_annuel, percentile_niveau_historique,
                   classification_niveau_annuel, niveau_moy_mobile_5ans
            FROM gold.fct_yearly_stats
            WHERE code_bss = :code
            ORDER BY annee
        """
        result = await db.execute(text(query), {"code": code_bss})
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("piezo_yearly", {"code_bss": code_bss}, YEARLY_TTL, fetch)


@router.get("/hydro/{code_station}/yearly")
async def get_hydro_yearly(
    code_station: str,
    db: AsyncSession = Depends(get_db),
):
    async def fetch():
        query = """
            SELECT annee, resultat_moyen_annuel, resultat_min_annuel, resultat_max_annuel,
                   amplitude_annuelle, temperature_moyenne_annuelle,
                   precipitation_totale_annuelle, nb_jours_mesures_annuel,
                   percentile_resultat_historique, classification_resultat_annuel
            FROM gold.fct_yearly_hydro
            WHERE code_station = :code
            ORDER BY annee
        """
        result = await db.execute(text(query), {"code": code_station})
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("hydro_yearly", {"code_station": code_station}, YEARLY_TTL, fetch)
