from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import cache_key, cached, get_redis
from app.database import get_db
from app.models.station import (
    HydroStationDetail,
    HydroStationMap,
    PiezoStationDetail,
    PiezoStationMap,
)

router = APIRouter(prefix="/api/v1/stations", tags=["stations"])

PIEZO_LIST_TTL = 3600
HYDRO_LIST_TTL = 3600
DETAIL_TTL = 3600


@router.get("/piezo", response_model=list[PiezoStationMap])
async def list_piezo_stations(
    min_observations: Optional[float] = Query(None, description="Minimum nb_mesures_total"),
    last_measurement_after: Optional[date] = Query(None, description="derniere_mesure >= value"),
    classification: Optional[list[str]] = Query(None, description="classification_derniere_annee values"),
    code_departement: Optional[str] = Query(None, description="Filter by department code"),
    db: AsyncSession = Depends(get_db),
):
    r = get_redis()
    params = {
        "min_observations": min_observations,
        "last_measurement_after": str(last_measurement_after) if last_measurement_after else None,
        "classification": classification,
        "code_departement": code_departement,
    }
    key = cache_key("piezo_list", params)

    async def fetch():
        query = """
            SELECT code_bss, latitude, longitude, nom_commune, code_departement,
                   nom_departement, libelle_eh, niveau_alerte, tendance_classification,
                   classification_derniere_annee, niveau_moyen_global, niveau_derniere_annee,
                   premiere_mesure, derniere_mesure, nb_mesures_total
            FROM gold.stations_piezo_carte
            WHERE 1=1
        """
        bind_params = {}

        if min_observations is not None:
            query += " AND nb_mesures_total >= :min_obs"
            bind_params["min_obs"] = min_observations

        if last_measurement_after is not None:
            query += " AND derniere_mesure >= :last_after"
            bind_params["last_after"] = last_measurement_after

        if classification is not None:
            query += " AND classification_derniere_annee = ANY(:classification)"
            bind_params["classification"] = classification

        if code_departement is not None:
            query += " AND code_departement = :dept"
            bind_params["dept"] = code_departement

        result = await db.execute(text(query), bind_params)
        rows = result.mappings().all()
        return [dict(row) for row in rows]

    data = await cached(r, key, PIEZO_LIST_TTL, fetch)
    return data


@router.get("/hydro", response_model=list[HydroStationMap])
async def list_hydro_stations(
    min_observations: Optional[float] = Query(None, description="Minimum nb_jours_total"),
    last_measurement_after: Optional[date] = Query(None, description="derniere_mesure >= value"),
    classification: Optional[list[str]] = Query(None, description="classification_resultat_dern_annee values"),
    code_departement: Optional[str] = Query(None, description="Filter by department code"),
    db: AsyncSession = Depends(get_db),
):
    r = get_redis()
    params = {
        "min_observations": min_observations,
        "last_measurement_after": str(last_measurement_after) if last_measurement_after else None,
        "classification": classification,
        "code_departement": code_departement,
    }
    key = cache_key("hydro_list", params)

    async def fetch():
        query = """
            SELECT code_station, latitude, longitude, code_departement, nom_departement,
                   libelle_station, libelle_cours_eau, grandeur_hydro_principale,
                   classification_resultat_dern_annee, resultat_moyen_global,
                   premiere_mesure, derniere_mesure, nb_jours_total
            FROM gold.stations_hydro_carte
            WHERE 1=1
        """
        bind_params = {}

        if min_observations is not None:
            query += " AND nb_jours_total >= :min_obs"
            bind_params["min_obs"] = min_observations

        if last_measurement_after is not None:
            query += " AND derniere_mesure >= :last_after"
            bind_params["last_after"] = last_measurement_after

        if classification is not None:
            query += " AND classification_resultat_dern_annee = ANY(:classification)"
            bind_params["classification"] = classification

        if code_departement is not None:
            query += " AND code_departement = :dept"
            bind_params["dept"] = code_departement

        result = await db.execute(text(query), bind_params)
        rows = result.mappings().all()
        return [dict(row) for row in rows]

    data = await cached(r, key, HYDRO_LIST_TTL, fetch)
    return data


@router.get("/piezo/{code_bss}", response_model=PiezoStationDetail)
async def get_piezo_station(
    code_bss: str,
    db: AsyncSession = Depends(get_db),
):
    r = get_redis()
    key = cache_key("piezo_detail", {"code_bss": code_bss})

    async def fetch():
        query = "SELECT * FROM gold.dim_piezo_stations WHERE code_bss = :code"
        result = await db.execute(text(query), {"code": code_bss})
        row = result.mappings().first()
        if not row:
            return None
        return dict(row)

    data = await cached(r, key, DETAIL_TTL, fetch)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Piezo station {code_bss} not found")
    return data


@router.get("/hydro/{code_station}", response_model=HydroStationDetail)
async def get_hydro_station(
    code_station: str,
    db: AsyncSession = Depends(get_db),
):
    r = get_redis()
    key = cache_key("hydro_detail", {"code_station": code_station})

    async def fetch():
        query = "SELECT * FROM gold.dim_hydro_stations WHERE code_station = :code"
        result = await db.execute(text(query), {"code": code_station})
        row = result.mappings().first()
        if not row:
            return None
        return dict(row)

    data = await cached(r, key, DETAIL_TTL, fetch)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Hydro station {code_station} not found")
    return data
