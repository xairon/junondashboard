from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import cached_response
from app.database import get_db

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])

STATS_TTL = 21600  # 6h


@router.get("/national")
async def get_national_stats(
    db: AsyncSession = Depends(get_db),
):
    async def fetch():
        query = """
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
        """
        result = await db.execute(text(query))
        return dict(result.mappings().fetchone())

    return await cached_response("national_stats", {}, STATS_TTL, fetch)


@router.get("/departments")
async def get_department_stats(
    db: AsyncSession = Depends(get_db),
):
    async def fetch():
        query = """
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
        """
        result = await db.execute(text(query))
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("department_stats", {}, STATS_TTL, fetch)
