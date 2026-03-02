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
    bbox: Optional[str] = Query(None, description="Bounding box: min_lon,min_lat,max_lon,max_lat"),
    limit: int = Query(10000, ge=1, le=50000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    params = {
        "min_observations": min_observations,
        "last_measurement_after": str(last_measurement_after) if last_measurement_after else None,
        "classification": classification,
        "code_departement": code_departement,
        "bbox": bbox,
        "limit": limit,
        "offset": offset,
    }

    async def fetch():
        where_clauses = ["1=1"]
        bind_params = {}

        if min_observations is not None:
            where_clauses.append("nb_mesures_total >= :min_obs")
            bind_params["min_obs"] = min_observations

        if last_measurement_after is not None:
            where_clauses.append("derniere_mesure >= :last_after")
            bind_params["last_after"] = last_measurement_after

        if classification is not None:
            where_clauses.append("classification_derniere_annee = ANY(:classification)")
            bind_params["classification"] = classification

        if code_departement is not None:
            where_clauses.append("code_departement = :dept")
            bind_params["dept"] = code_departement

        if bbox is not None:
            parts = bbox.split(",")
            if len(parts) == 4:
                min_lon, min_lat, max_lon, max_lat = (float(p) for p in parts)
                where_clauses.append("latitude BETWEEN :min_lat AND :max_lat")
                where_clauses.append("longitude BETWEEN :min_lon AND :max_lon")
                bind_params.update({"min_lat": min_lat, "max_lat": max_lat, "min_lon": min_lon, "max_lon": max_lon})

        where_sql = " AND ".join(where_clauses)

        # Count query
        count_query = f"SELECT count(*) FROM gold.dim_piezo_stations WHERE {where_sql}"
        count_result = await db.execute(text(count_query), bind_params)
        total = count_result.scalar()

        # Data query
        query = f"""
            SELECT code_bss, latitude, longitude, nom_commune, code_departement,
                   nom_departement, classification_derniere_annee,
                   niveau_moyen_global, premiere_mesure, derniere_mesure, nb_mesures_total
            FROM gold.dim_piezo_stations
            WHERE {where_sql}
            LIMIT :limit OFFSET :offset
        """
        bind_params["limit"] = limit
        bind_params["offset"] = offset

        result = await db.execute(text(query), bind_params)
        rows = result.mappings().all()
        return {"total": total, "rows": [dict(row) for row in rows]}

    data = await fetch()
    response = FastJSONResponse(data["rows"])
    response.headers["X-Total-Count"] = str(data["total"])
    return response


@router.get("/hydro")
async def list_hydro_stations(
    min_observations: Optional[int] = Query(None, ge=0, description="Minimum nb_jours_total"),
    last_measurement_after: Optional[date] = Query(None, description="derniere_mesure >= value"),
    classification: Optional[list[ClassificationType]] = Query(None, description="classification_resultat_dern_annee values"),
    code_departement: Optional[str] = Query(None, min_length=1, max_length=3, description="Filter by department code"),
    grandeur_hydro: Optional[str] = Query(None, description="Filter by grandeur_hydro_principale"),
    bbox: Optional[str] = Query(None, description="Bounding box: min_lon,min_lat,max_lon,max_lat"),
    limit: int = Query(10000, ge=1, le=50000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    params = {
        "min_observations": min_observations,
        "last_measurement_after": str(last_measurement_after) if last_measurement_after else None,
        "classification": classification,
        "code_departement": code_departement,
        "grandeur_hydro": grandeur_hydro,
        "bbox": bbox,
        "limit": limit,
        "offset": offset,
    }

    async def fetch():
        where_clauses = ["1=1"]
        bind_params = {}

        if min_observations is not None:
            where_clauses.append("nb_jours_total >= :min_obs")
            bind_params["min_obs"] = min_observations

        if last_measurement_after is not None:
            where_clauses.append("derniere_mesure >= :last_after")
            bind_params["last_after"] = last_measurement_after

        if classification is not None:
            where_clauses.append("classification_resultat_dern_annee = ANY(:classification)")
            bind_params["classification"] = classification

        if code_departement is not None:
            where_clauses.append("code_departement = :dept")
            bind_params["dept"] = code_departement

        if grandeur_hydro is not None:
            where_clauses.append("grandeur_hydro_principale = :grandeur_hydro")
            bind_params["grandeur_hydro"] = grandeur_hydro

        if bbox is not None:
            parts = bbox.split(",")
            if len(parts) == 4:
                min_lon, min_lat, max_lon, max_lat = (float(p) for p in parts)
                where_clauses.append("latitude_station BETWEEN :min_lat AND :max_lat")
                where_clauses.append("longitude_station BETWEEN :min_lon AND :max_lon")
                bind_params.update({"min_lat": min_lat, "max_lat": max_lat, "min_lon": min_lon, "max_lon": max_lon})

        where_sql = " AND ".join(where_clauses)

        # Count query
        count_query = f"SELECT count(*) FROM gold.dim_hydro_stations WHERE {where_sql}"
        count_result = await db.execute(text(count_query), bind_params)
        total = count_result.scalar()

        # Data query
        query = f"""
            SELECT code_station, longitude_station AS longitude, latitude_station AS latitude,
                   code_departement, nom_departement, libelle_station, nom_cours_eau,
                   grandeur_hydro_principale, classification_resultat_dern_annee,
                   resultat_moyen_global, premiere_mesure, derniere_mesure, nb_jours_total
            FROM gold.dim_hydro_stations
            WHERE {where_sql}
            LIMIT :limit OFFSET :offset
        """
        bind_params["limit"] = limit
        bind_params["offset"] = offset

        result = await db.execute(text(query), bind_params)
        rows = result.mappings().all()
        return {"total": total, "rows": [dict(row) for row in rows]}

    data = await fetch()
    response = FastJSONResponse(data["rows"])
    response.headers["X-Total-Count"] = str(data["total"])
    return response


GEOJSON_TTL = 3600


@router.get("/geojson")
async def get_stations_geojson(
    type: Optional[Literal["piezo", "hydro", "all"]] = Query("all", description="Station type filter"),
    db: AsyncSession = Depends(get_db),
):
    params = {"type": type}

    async def fetch():
        features = []

        if type in (None, "all", "piezo"):
            piezo_query = """
                SELECT code_bss AS code, 'piezo' AS type,
                       latitude, longitude, nom_commune AS commune,
                       code_departement, nom_departement AS departement,
                       classification_derniere_annee AS classification
                FROM gold.dim_piezo_stations
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
            """
            result = await db.execute(text(piezo_query))
            for row in result.mappings().all():
                r = dict(row)
                features.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [r["longitude"], r["latitude"]],
                    },
                    "properties": {
                        "code": r["code"],
                        "type": r["type"],
                        "classification": r["classification"],
                        "commune": r["commune"],
                        "departement": r["departement"],
                        "code_departement": r["code_departement"],
                    },
                })

        if type in (None, "all", "hydro"):
            hydro_query = """
                SELECT code_station AS code, 'hydro' AS type,
                       latitude_station AS latitude, longitude_station AS longitude,
                       libelle_station AS commune,
                       code_departement, nom_departement AS departement,
                       classification_resultat_dern_annee AS classification
                FROM gold.dim_hydro_stations
                WHERE latitude_station IS NOT NULL AND longitude_station IS NOT NULL
            """
            result = await db.execute(text(hydro_query))
            for row in result.mappings().all():
                r = dict(row)
                features.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [r["longitude"], r["latitude"]],
                    },
                    "properties": {
                        "code": r["code"],
                        "type": r["type"],
                        "classification": r["classification"],
                        "commune": r["commune"],
                        "departement": r["departement"],
                        "code_departement": r["code_departement"],
                    },
                })

        return {
            "type": "FeatureCollection",
            "features": features,
        }

    return await cached_response("stations_geojson", params, GEOJSON_TTL, fetch)


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
