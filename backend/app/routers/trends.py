from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import cached_response
from app.database import get_db
from app.json_response import FastJSONResponse

router = APIRouter(prefix="/api/v1/trends", tags=["trends"])

TRENDS_TTL = 43200  # 12h

SaisonType = Literal["annuel", "printemps", "ete", "automne", "hiver"]
ClassificationTendanceType = Literal[
    "HAUSSE_FORTE", "HAUSSE_SIGNIFICATIVE", "STABLE", "BAISSE_SIGNIFICATIVE", "BAISSE_FORTE"
]


@router.get("/piezo")
async def get_piezo_trends(
    saison: Optional[SaisonType] = Query(None),
    code_departement: Optional[str] = Query(None, min_length=1, max_length=3),
    classification_tendance: Optional[ClassificationTendanceType] = Query(None, description="Filter by trend classification"),
    fiabilite_min: Optional[float] = Query(None, description="Minimum fiabilite_tendance"),
    limit: int = Query(10000, ge=1, le=50000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    params = {
        "saison": saison,
        "code_departement": code_departement,
        "classification_tendance": classification_tendance,
        "fiabilite_min": fiabilite_min,
        "limit": limit,
        "offset": offset,
    }

    async def fetch():
        conditions = ["1=1"]
        bind_params = {}
        if saison is not None:
            conditions.append("saison = :saison")
            bind_params["saison"] = saison
        if code_departement is not None:
            conditions.append("code_departement = :dept")
            bind_params["dept"] = code_departement
        if classification_tendance is not None:
            conditions.append("classification_tendance = :classif")
            bind_params["classif"] = classification_tendance
        if fiabilite_min is not None:
            conditions.append("fiabilite_tendance >= :fiab_min")
            bind_params["fiab_min"] = fiabilite_min

        where = " AND ".join(conditions)

        # Count query
        count_query = f"SELECT count(*) FROM gold.agg_station_trends WHERE {where}"
        count_result = await db.execute(text(count_query), bind_params)
        total = count_result.scalar()

        query = f"""
            SELECT code_bss, saison, code_departement, nom_departement,
                   variation_annuelle_m, fiabilite_tendance, nb_points,
                   classification_tendance, projection_variation_5ans_m
            FROM gold.agg_station_trends
            WHERE {where}
            ORDER BY code_bss
            LIMIT :limit OFFSET :offset
        """
        bind_params["limit"] = limit
        bind_params["offset"] = offset
        result = await db.execute(text(query), bind_params)
        rows = [dict(row) for row in result.mappings().all()]
        return {"total": total, "rows": rows}

    data = await fetch()
    response = FastJSONResponse(data["rows"])
    response.headers["X-Total-Count"] = str(data["total"])
    return response


@router.get("/hydro")
async def get_hydro_trends(
    saison: Optional[SaisonType] = Query(None),
    code_departement: Optional[str] = Query(None, min_length=1, max_length=3),
    classification_tendance: Optional[ClassificationTendanceType] = Query(None, description="Filter by trend classification"),
    fiabilite_min: Optional[float] = Query(None, description="Minimum fiabilite_tendance"),
    grandeur_hydro_elab: Optional[str] = Query(None, description="Filter by grandeur_hydro_elab"),
    limit: int = Query(10000, ge=1, le=50000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    params = {
        "saison": saison,
        "code_departement": code_departement,
        "classification_tendance": classification_tendance,
        "fiabilite_min": fiabilite_min,
        "grandeur_hydro_elab": grandeur_hydro_elab,
        "limit": limit,
        "offset": offset,
    }

    async def fetch():
        conditions = ["1=1"]
        bind_params = {}
        if saison is not None:
            conditions.append("saison = :saison")
            bind_params["saison"] = saison
        if code_departement is not None:
            conditions.append("code_departement = :dept")
            bind_params["dept"] = code_departement
        if classification_tendance is not None:
            conditions.append("classification_tendance = :classif")
            bind_params["classif"] = classification_tendance
        if fiabilite_min is not None:
            conditions.append("fiabilite_tendance >= :fiab_min")
            bind_params["fiab_min"] = fiabilite_min
        if grandeur_hydro_elab is not None:
            conditions.append("grandeur_hydro_elab = :grandeur")
            bind_params["grandeur"] = grandeur_hydro_elab

        where = " AND ".join(conditions)

        # Count query
        count_query = f"SELECT count(*) FROM gold.agg_hydro_trends WHERE {where}"
        count_result = await db.execute(text(count_query), bind_params)
        total = count_result.scalar()

        query = f"""
            SELECT code_station, grandeur_hydro_elab, saison, code_departement, nom_departement,
                   variation_annuelle, fiabilite_tendance, nb_points,
                   classification_tendance, projection_variation_5ans
            FROM gold.agg_hydro_trends
            WHERE {where}
            ORDER BY code_station
            LIMIT :limit OFFSET :offset
        """
        bind_params["limit"] = limit
        bind_params["offset"] = offset
        result = await db.execute(text(query), bind_params)
        rows = [dict(row) for row in result.mappings().all()]
        return {"total": total, "rows": rows}

    data = await fetch()
    response = FastJSONResponse(data["rows"])
    response.headers["X-Total-Count"] = str(data["total"])
    return response
