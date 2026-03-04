from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import cached_response
from app.database import get_db
from app.models.common import Alert, DepartmentStats, NationalStats

router = APIRouter(prefix="/api/v1/common", tags=["common"])

GEOJSON_TTL = 3600
ALERTS_TTL = 3600
STATS_TTL = 21600

SeverityType = Literal["TRES_BAS", "BAS", "HAUT", "TRES_HAUT"]


@router.get("/stations/geojson")
async def get_stations_geojson(
    type: Optional[Literal["piezo", "hydro", "all"]] = Query("all"),
    db: AsyncSession = Depends(get_db),
):
    params = {"type": type}

    async def fetch():
        features = []

        if type in (None, "all", "piezo"):
            result = await db.execute(text("""
                SELECT code_bss AS code, 'piezo' AS type,
                       latitude, longitude, nom_commune AS commune,
                       code_departement, nom_departement AS departement,
                       classification_derniere_annee AS classification,
                       codes_bdlisa, derniere_mesure,
                       nb_mesures_total
                FROM gold.dim_piezo_stations
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
            """))
            for row in result.mappings().all():
                r = dict(row)
                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [r["longitude"], r["latitude"]]},
                    "properties": {
                        "code": r["code"], "type": r["type"],
                        "classification": r["classification"],
                        "commune": r["commune"], "departement": r["departement"],
                        "code_departement": r["code_departement"],
                        "codes_bdlisa": r["codes_bdlisa"],
                        "derniere_mesure": str(r["derniere_mesure"]) if r["derniere_mesure"] else None,
                        "nb_observations": r["nb_mesures_total"],
                    },
                })

        if type in (None, "all", "hydro"):
            result = await db.execute(text("""
                SELECT code_station AS code, 'hydro' AS type,
                       latitude_station AS latitude, longitude_station AS longitude,
                       libelle_station AS commune,
                       code_departement, nom_departement AS departement,
                       classification_resultat_dern_annee AS classification,
                       LEFT(code_cours_eau, 1) AS code_district, derniere_mesure,
                       nb_jours_total
                FROM gold.dim_hydro_stations
                WHERE latitude_station IS NOT NULL AND longitude_station IS NOT NULL
            """))
            for row in result.mappings().all():
                r = dict(row)
                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [r["longitude"], r["latitude"]]},
                    "properties": {
                        "code": r["code"], "type": r["type"],
                        "classification": r["classification"],
                        "commune": r["commune"], "departement": r["departement"],
                        "code_departement": r["code_departement"],
                        "code_district": r["code_district"],
                        "derniere_mesure": str(r["derniere_mesure"]) if r["derniere_mesure"] else None,
                        "nb_observations": r["nb_jours_total"],
                    },
                })

        return {"type": "FeatureCollection", "features": features}

    return await cached_response("stations_geojson", params, GEOJSON_TTL, fetch)


@router.get("/alerts", response_model=list[Alert])
async def list_alerts(
    severity: Optional[list[SeverityType]] = Query(None),
    type: Optional[Literal["piezo", "hydro"]] = Query(None),
    code_departement: Optional[str] = Query(None, min_length=1, max_length=3),
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    severity_list = severity if severity is not None else ["TRES_BAS", "TRES_HAUT"]
    params = {
        "severity": severity_list, "type": type,
        "code_departement": code_departement, "active_only": active_only,
    }

    async def fetch():
        parts = []
        bind = {"severity": severity_list}
        recent_cutoff = date.today() - timedelta(days=90)

        if type is None or type == "piezo":
            conds = ["s.classification_derniere_annee = ANY(:severity)"]
            if code_departement:
                conds.append("s.code_departement = :dept")
            if active_only:
                conds.append("s.derniere_mesure >= :recent_cutoff")
                bind["recent_cutoff"] = recent_cutoff
            parts.append(f"""
                SELECT s.code_bss AS code, 'piezo' AS type,
                       s.latitude, s.longitude,
                       s.nom_commune AS commune, s.code_departement, s.nom_departement AS departement,
                       s.classification_derniere_annee AS classification, s.derniere_mesure,
                       cs.alerte_depuis_annee, cs.nb_annees_consecutives
                FROM gold.dim_piezo_stations s
                LEFT JOIN LATERAL (
                    SELECT min(y.annee) AS alerte_depuis_annee,
                           count(*) AS nb_annees_consecutives
                    FROM (
                        SELECT annee, classification_niveau_annuel,
                               annee - ROW_NUMBER() OVER (ORDER BY annee) AS grp
                        FROM gold.fct_yearly_stats
                        WHERE code_bss = s.code_bss
                          AND classification_niveau_annuel = s.classification_derniere_annee
                    ) y
                    WHERE y.grp = (
                        SELECT annee - ROW_NUMBER() OVER (ORDER BY annee)
                        FROM gold.fct_yearly_stats
                        WHERE code_bss = s.code_bss
                          AND classification_niveau_annuel = s.classification_derniere_annee
                        ORDER BY annee DESC LIMIT 1
                    )
                ) cs ON true
                WHERE {" AND ".join(conds)}
            """)

        if type is None or type == "hydro":
            conds = ["s.classification_resultat_dern_annee = ANY(:severity)"]
            if code_departement:
                conds.append("s.code_departement = :dept")
            if active_only:
                conds.append("s.derniere_mesure >= :recent_cutoff")
                bind["recent_cutoff"] = recent_cutoff
            parts.append(f"""
                SELECT s.code_station AS code, 'hydro' AS type,
                       s.latitude_station AS latitude, s.longitude_station AS longitude,
                       s.libelle_station AS commune, s.code_departement, s.nom_departement AS departement,
                       s.classification_resultat_dern_annee AS classification, s.derniere_mesure,
                       cs.alerte_depuis_annee, cs.nb_annees_consecutives
                FROM gold.dim_hydro_stations s
                LEFT JOIN LATERAL (
                    SELECT min(y.annee) AS alerte_depuis_annee,
                           count(*) AS nb_annees_consecutives
                    FROM (
                        SELECT annee, classification_resultat_annuel,
                               annee - ROW_NUMBER() OVER (ORDER BY annee) AS grp
                        FROM gold.fct_yearly_hydro
                        WHERE code_station = s.code_station
                          AND classification_resultat_annuel = s.classification_resultat_dern_annee
                    ) y
                    WHERE y.grp = (
                        SELECT annee - ROW_NUMBER() OVER (ORDER BY annee)
                        FROM gold.fct_yearly_hydro
                        WHERE code_station = s.code_station
                          AND classification_resultat_annuel = s.classification_resultat_dern_annee
                        ORDER BY annee DESC LIMIT 1
                    )
                ) cs ON true
                WHERE {" AND ".join(conds)}
            """)

        if code_departement:
            bind["dept"] = code_departement

        union = " UNION ALL ".join(parts)
        query = f"{union} ORDER BY classification, code"
        result = await db.execute(text(query), bind)
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("alerts", params, ALERTS_TTL, fetch)


@router.get("/stats/national", response_model=NationalStats)
async def get_national_stats(db: AsyncSession = Depends(get_db)):
    async def fetch():
        recent_cutoff = date.today() - timedelta(days=90)
        result = await db.execute(text("""
            WITH piezo AS (
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE classification_derniere_annee = 'TRES_BAS') AS tres_bas,
                       count(*) FILTER (WHERE classification_derniere_annee = 'BAS') AS bas,
                       count(*) FILTER (WHERE classification_derniere_annee = 'NORMAL') AS normal,
                       count(*) FILTER (WHERE classification_derniere_annee = 'HAUT') AS haut,
                       count(*) FILTER (WHERE classification_derniere_annee = 'TRES_HAUT') AS tres_haut,
                       count(*) FILTER (WHERE classification_derniere_annee IS NULL) AS no_class
                FROM gold.dim_piezo_stations
                WHERE derniere_mesure >= :recent_cutoff
            ),
            hydro AS (
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE classification_resultat_dern_annee = 'TRES_BAS') AS tres_bas,
                       count(*) FILTER (WHERE classification_resultat_dern_annee = 'BAS') AS bas,
                       count(*) FILTER (WHERE classification_resultat_dern_annee = 'NORMAL') AS normal,
                       count(*) FILTER (WHERE classification_resultat_dern_annee = 'HAUT') AS haut,
                       count(*) FILTER (WHERE classification_resultat_dern_annee = 'TRES_HAUT') AS tres_haut
                FROM gold.dim_hydro_stations
                WHERE derniere_mesure >= :recent_cutoff
            )
            SELECT p.total AS total_piezo, p.tres_bas AS piezo_tres_bas, p.bas AS piezo_bas,
                   p.normal AS piezo_normal, p.haut AS piezo_haut, p.tres_haut AS piezo_tres_haut,
                   p.no_class AS piezo_no_class,
                   h.total AS total_hydro, h.tres_bas AS hydro_tres_bas, h.bas AS hydro_bas,
                   h.normal AS hydro_normal, h.haut AS hydro_haut, h.tres_haut AS hydro_tres_haut
            FROM piezo p CROSS JOIN hydro h
        """), {"recent_cutoff": recent_cutoff})
        return dict(result.mappings().fetchone())

    return await cached_response("national_stats", {}, STATS_TTL, fetch)


@router.get("/stats/departments", response_model=list[DepartmentStats])
async def get_department_stats(db: AsyncSession = Depends(get_db)):
    async def fetch():
        recent_cutoff = date.today() - timedelta(days=90)
        result = await db.execute(text("""
            WITH piezo AS (
                SELECT code_departement, nom_departement,
                       count(*) AS nb_piezo,
                       count(*) FILTER (WHERE classification_derniere_annee = 'TRES_BAS') AS tres_bas
                FROM gold.dim_piezo_stations
                WHERE code_departement IS NOT NULL AND derniere_mesure >= :recent_cutoff
                GROUP BY code_departement, nom_departement
            ),
            hydro AS (
                SELECT code_departement, count(*) AS nb_hydro
                FROM gold.dim_hydro_stations
                WHERE code_departement IS NOT NULL AND derniere_mesure >= :recent_cutoff
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
        """), {"recent_cutoff": recent_cutoff})
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("department_stats", {}, STATS_TTL, fetch)
