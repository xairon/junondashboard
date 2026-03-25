from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import cached_response
from app.classification import get_classification_lookup
from app.database import get_db
from app.models.hydro import (
    HydroDaily, HydroMonthly, HydroPercentiles, HydroSiteSiblings, HydroSPI, HydroSSFI, HydroStation, HydroTrend, HydroYearly,
)
from app.drought import compute_spi, compute_ssfi

router = APIRouter(prefix="/api/v1/hydro", tags=["hydro"])

LIST_TTL = 3600
DETAIL_TTL = 3600
DAILY_TTL = 21600
MONTHLY_TTL = 43200
YEARLY_TTL = 86400
PERCENTILES_TTL = 86400
TRENDS_TTL = 43200

ClassificationType = Literal["EXTREMEMENT_BAS", "TRES_BAS", "BAS", "NORMAL", "HAUT", "TRES_HAUT", "EXTREMEMENT_HAUT"]
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
        lookup = await get_classification_lookup()
        conditions = ["1=1"]
        bind = {}

        if min_observations is not None:
            conditions.append("nb_jours_total >= :min_obs")
            bind["min_obs"] = min_observations
        if last_measurement_after is not None:
            conditions.append("derniere_mesure >= :last_after")
            bind["last_after"] = last_measurement_after
        if classification is not None and not lookup:
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
        rows = [dict(row) for row in result.mappings().all()]

        if lookup:
            for row in rows:
                computed = lookup.get("hydro", {}).get(row["code_station"])
                if computed and computed != "UNKNOWN":
                    row["classification_resultat_dern_annee"] = computed
            if classification is not None:
                rows = [r for r in rows if r["classification_resultat_dern_annee"] in classification]

        return rows

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


SSFI_TTL = 86400


@router.get("/stations/{code_station}/ssfi", response_model=list[HydroSSFI])
async def get_ssfi(
    code_station: str,
    db: AsyncSession = Depends(get_db),
):
    """Compute Standardized Streamflow Index (SSFI) from monthly data."""

    async def fetch():
        query = """
            SELECT mois, resultat_moyen
            FROM gold.fct_monthly_hydro
            WHERE code_station = :code AND resultat_moyen IS NOT NULL
            ORDER BY mois
        """
        result = await db.execute(text(query), {"code": code_station})
        rows = result.mappings().all()
        if not rows:
            exists = await db.execute(
                text("SELECT 1 FROM gold.dim_hydro_stations WHERE code_station = :code"), {"code": code_station}
            )
            if exists.first() is None:
                raise HTTPException(404, f"Hydro station {code_station} not found")
            return []

        months = [str(r["mois"]) for r in rows]
        values = [float(r["resultat_moyen"]) if r["resultat_moyen"] is not None else None for r in rows]
        return compute_ssfi(months, values)

    return await cached_response("hydro_ssfi", {"code_station": code_station}, SSFI_TTL, fetch)


@router.get("/stations/{code_station}/spi", response_model=list[HydroSPI])
async def get_spi(
    code_station: str,
    db: AsyncSession = Depends(get_db),
):
    """Compute Standardized Precipitation Index (SPI) from monthly precipitation."""

    async def fetch():
        query = """
            SELECT mois, precipitation_totale
            FROM gold.fct_monthly_hydro
            WHERE code_station = :code AND precipitation_totale IS NOT NULL
            ORDER BY mois
        """
        result = await db.execute(text(query), {"code": code_station})
        rows = result.mappings().all()
        if not rows:
            exists = await db.execute(
                text("SELECT 1 FROM gold.dim_hydro_stations WHERE code_station = :code"), {"code": code_station}
            )
            if exists.first() is None:
                raise HTTPException(404, f"Hydro station {code_station} not found")
            return []

        months = [str(r["mois"]) for r in rows]
        values = [float(r["precipitation_totale"]) if r["precipitation_totale"] is not None else None for r in rows]
        return compute_spi(months, values)

    return await cached_response("hydro_spi", {"code_station": code_station}, SSFI_TTL, fetch)


SIBLINGS_TTL = 3600


@router.get("/stations/{code_station}/siblings", response_model=HydroSiteSiblings)
async def get_siblings(
    code_station: str,
    db: AsyncSession = Depends(get_db),
):
    """Return other hydro stations at the same hydrometric site."""

    async def fetch():
        # Get the station's site code
        result = await db.execute(
            text("SELECT code_site, libelle_site, nom_cours_eau FROM gold.dim_hydro_stations WHERE code_station = :code"),
            {"code": code_station},
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(404, f"Hydro station {code_station} not found")
        code_site = row["code_site"]
        if not code_site:
            raise HTTPException(404, f"No site code for station {code_station}")

        # Find siblings
        query = """
            SELECT code_station, libelle_station, grandeur_hydro_principale,
                   classification_resultat_dern_annee, derniere_mesure
            FROM gold.dim_hydro_stations
            WHERE code_site = :site AND code_station != :code
            ORDER BY code_station
        """
        result = await db.execute(text(query), {"site": code_site, "code": code_station})
        siblings = [dict(r) for r in result.mappings().all()]

        # Overlay computed classifications
        lookup = await get_classification_lookup()
        for s in siblings:
            if lookup:
                computed = lookup.get("hydro", {}).get(s["code_station"])
                if computed and computed != "UNKNOWN":
                    s["classification_resultat_dern_annee"] = computed

        return {
            "code_site": code_site,
            "libelle_site": row["libelle_site"],
            "nom_cours_eau": row["nom_cours_eau"],
            "nb_stations": len(siblings) + 1,  # include the station itself
            "siblings": [
                {
                    "code_station": s["code_station"],
                    "libelle_station": s.get("libelle_station"),
                    "grandeur_hydro_principale": s.get("grandeur_hydro_principale"),
                    "classification": s.get("classification_resultat_dern_annee"),
                    "derniere_mesure": s.get("derniere_mesure"),
                }
                for s in siblings
            ],
        }

    return await cached_response("hydro_siblings", {"code_station": code_station}, SIBLINGS_TTL, fetch)


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
        row_dict = dict(row)
        lookup = await get_classification_lookup()
        if lookup:
            computed = lookup.get("hydro", {}).get(code_station)
            if computed and computed != "UNKNOWN":
                row_dict["classification_resultat_dern_annee"] = computed
        return row_dict

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
        join_clause = ""
        if active_only:
            join_clause = " JOIN gold.dim_hydro_stations ds ON t.code_station = ds.code_station AND ds.derniere_mesure >= :recent_cutoff"
            bind["recent_cutoff"] = date.today() - timedelta(days=90)
        if saison is not None:
            conditions.append("t.saison = :saison")
            bind["saison"] = saison
        if code_departement is not None:
            conditions.append("t.code_departement = :dept")
            bind["dept"] = code_departement
        if classification_tendance is not None:
            conditions.append("t.classification_tendance = :classif")
            bind["classif"] = classification_tendance
        if fiabilite_min is not None:
            conditions.append("t.fiabilite_tendance >= :fiab_min")
            bind["fiab_min"] = fiabilite_min
        if grandeur_hydro_elab is not None:
            conditions.append("t.grandeur_hydro_elab = :grandeur")
            bind["grandeur"] = grandeur_hydro_elab

        where = " AND ".join(conditions)
        query = f"""
            SELECT t.code_station, t.grandeur_hydro_elab, t.saison, t.code_departement, t.nom_departement,
                   t.variation_annuelle, t.fiabilite_tendance, t.nb_points,
                   t.classification_tendance, t.projection_variation_5ans
            FROM gold.agg_hydro_trends t{join_clause}
            WHERE {where}
            ORDER BY t.code_station
        """
        result = await db.execute(text(query), bind)
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("hydro_trends", params, TRENDS_TTL, fetch)
