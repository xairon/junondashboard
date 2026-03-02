from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import cached_response
from app.database import get_db

router = APIRouter(prefix="/api/v1/trends", tags=["trends"])

TRENDS_TTL = 3600

SaisonType = Literal["annuel", "printemps", "ete", "automne", "hiver"]


@router.get("/piezo")
async def get_piezo_trends(
    saison: Optional[SaisonType] = Query(None),
    code_departement: Optional[str] = Query(None, min_length=1, max_length=3),
    db: AsyncSession = Depends(get_db),
):
    params = {"saison": saison, "code_departement": code_departement}

    async def fetch():
        conditions = ["1=1"]
        bind_params = {}
        if saison is not None:
            conditions.append("saison = :saison")
            bind_params["saison"] = saison
        if code_departement is not None:
            conditions.append("code_departement = :dept")
            bind_params["dept"] = code_departement
        where = " AND ".join(conditions)
        query = f"""
            SELECT code_bss, saison, code_departement, nom_departement,
                   variation_annuelle_m, fiabilite_tendance, nb_points,
                   classification_tendance, projection_variation_5ans_m
            FROM gold.agg_station_trends
            WHERE {where}
            ORDER BY code_bss
        """
        result = await db.execute(text(query), bind_params)
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("piezo_trends", params, TRENDS_TTL, fetch)


@router.get("/hydro")
async def get_hydro_trends(
    saison: Optional[SaisonType] = Query(None),
    code_departement: Optional[str] = Query(None, min_length=1, max_length=3),
    db: AsyncSession = Depends(get_db),
):
    params = {"saison": saison, "code_departement": code_departement}

    async def fetch():
        conditions = ["1=1"]
        bind_params = {}
        if saison is not None:
            conditions.append("saison = :saison")
            bind_params["saison"] = saison
        if code_departement is not None:
            conditions.append("code_departement = :dept")
            bind_params["dept"] = code_departement
        where = " AND ".join(conditions)
        query = f"""
            SELECT code_station, grandeur_hydro_elab, saison, code_departement, nom_departement,
                   variation_annuelle, fiabilite_tendance, nb_points,
                   classification_tendance, projection_variation_5ans
            FROM gold.agg_hydro_trends
            WHERE {where}
            ORDER BY code_station
        """
        result = await db.execute(text(query), bind_params)
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("hydro_trends", params, TRENDS_TTL, fetch)
