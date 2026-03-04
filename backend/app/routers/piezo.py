from datetime import date, timedelta
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
                   code_departement, nom_departement, codes_bdlisa,
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
                   code_departement, nom_departement, codes_bdlisa,
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
                "code_bss IN (SELECT code_bss FROM gold.dim_piezo_stations WHERE derniere_mesure >= :recent_cutoff)"
            )
            bind["recent_cutoff"] = date.today() - timedelta(days=90)
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
