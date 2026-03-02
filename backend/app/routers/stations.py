from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import cache_key, cached, cached_response, get_redis
from app.database import get_db
from app.json_response import FastJSONResponse
from app.models.station import (
    HydroStationDetail,
    PiezoStationDetail,
)

router = APIRouter(prefix="/api/v1/stations", tags=["stations"])

PIEZO_LIST_TTL = 3600
HYDRO_LIST_TTL = 3600
DETAIL_TTL = 3600

ClassificationType = Literal["TRES_BAS", "BAS", "NORMAL", "HAUT", "TRES_HAUT"]


@router.get("/piezo")
async def list_piezo_stations(
    min_observations: Optional[int] = Query(None, ge=0, description="Minimum nb_mesures_total"),
    last_measurement_after: Optional[date] = Query(None, description="derniere_mesure >= value"),
    classification: Optional[list[ClassificationType]] = Query(None, description="classification_derniere_annee values"),
    code_departement: Optional[str] = Query(None, min_length=1, max_length=3, description="Filter by department code"),
    limit: int = Query(10000, ge=1, le=50000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    params = {
        "min_observations": min_observations,
        "last_measurement_after": str(last_measurement_after) if last_measurement_after else None,
        "classification": classification,
        "code_departement": code_departement,
        "limit": limit,
        "offset": offset,
    }

    async def fetch():
        query = """
            SELECT code_bss, latitude, longitude, nom_commune, code_departement,
                   nom_departement, classification_derniere_annee,
                   niveau_moyen_global, premiere_mesure, derniere_mesure, nb_mesures_total
            FROM gold.dim_piezo_stations
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

        query += " LIMIT :limit OFFSET :offset"
        bind_params["limit"] = limit
        bind_params["offset"] = offset

        result = await db.execute(text(query), bind_params)
        rows = result.mappings().all()
        return [dict(row) for row in rows]

    return await cached_response("piezo_list", params, PIEZO_LIST_TTL, fetch)


@router.get("/hydro")
async def list_hydro_stations(
    min_observations: Optional[int] = Query(None, ge=0, description="Minimum nb_jours_total"),
    last_measurement_after: Optional[date] = Query(None, description="derniere_mesure >= value"),
    classification: Optional[list[ClassificationType]] = Query(None, description="classification_resultat_dern_annee values"),
    code_departement: Optional[str] = Query(None, min_length=1, max_length=3, description="Filter by department code"),
    limit: int = Query(10000, ge=1, le=50000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    params = {
        "min_observations": min_observations,
        "last_measurement_after": str(last_measurement_after) if last_measurement_after else None,
        "classification": classification,
        "code_departement": code_departement,
        "limit": limit,
        "offset": offset,
    }

    async def fetch():
        query = """
            SELECT code_station, longitude_station AS longitude, latitude_station AS latitude,
                   code_departement, nom_departement, libelle_station, nom_cours_eau,
                   grandeur_hydro_principale, classification_resultat_dern_annee,
                   resultat_moyen_global, premiere_mesure, derniere_mesure, nb_jours_total
            FROM gold.dim_hydro_stations
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

        query += " LIMIT :limit OFFSET :offset"
        bind_params["limit"] = limit
        bind_params["offset"] = offset

        result = await db.execute(text(query), bind_params)
        rows = result.mappings().all()
        return [dict(row) for row in rows]

    return await cached_response("hydro_list", params, HYDRO_LIST_TTL, fetch)


@router.get("/piezo/{code_bss:path}", response_model=PiezoStationDetail)
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
