import asyncio
from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import cached_response
from app.classification import get_classification_lookup
from app.database import async_session, get_db
from app.models.common import Alert, DepartmentStats, NationalStats

router = APIRouter(prefix="/api/v1/common", tags=["common"])

GEOJSON_TTL = 3600
ALERTS_TTL = 3600
STATS_TTL = 21600
TIMELINE_TTL = 86400  # 24h — historical data, rarely changes

SeverityType = Literal["EXTREMEMENT_BAS", "TRES_BAS", "BAS", "HAUT", "TRES_HAUT", "EXTREMEMENT_HAUT"]


def _overlay_classification(features: list[dict], lookup: dict | None) -> None:
    """Replace DB classification with computed classification in-place,
    and add reliability level from the same lookup."""
    if not lookup:
        return
    reliability = lookup.get("reliability", {})
    for f in features:
        p = f["properties"]
        computed = lookup.get(p["type"], {}).get(p["code"])
        if computed and computed != "UNKNOWN":
            p["classification"] = computed
        if reliability:
            p["fiabilite"] = reliability.get(p["code"], "insuffisant")


@router.get("/stations/geojson")
async def get_stations_geojson(
    type: Optional[Literal["piezo", "hydro", "all"]] = Query("all"),
    db: AsyncSession = Depends(get_db),
):
    params = {"type": type}

    async def fetch():
        features = []
        want_piezo = type in (None, "all", "piezo")
        want_hydro = type in (None, "all", "hydro")

        piezo_query = text("""
            SELECT code_bss AS code, 'piezo' AS type,
                   latitude, longitude, nom_commune AS commune,
                   code_departement, nom_departement AS departement,
                   classification_derniere_annee AS classification,
                   codes_bdlisa, derniere_mesure,
                   nb_mesures_total
            FROM gold.dim_piezo_stations
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        """)
        hydro_query = text("""
            SELECT code_station AS code, 'hydro' AS type,
                   latitude_station AS latitude, longitude_station AS longitude,
                   libelle_station AS commune,
                   code_departement, nom_departement AS departement,
                   classification_resultat_dern_annee AS classification,
                   LEFT(code_cours_eau, 1) AS code_district, code_site, derniere_mesure,
                   nb_jours_total
            FROM gold.dim_hydro_stations
            WHERE latitude_station IS NOT NULL AND longitude_station IS NOT NULL
        """)

        async def run_piezo():
            async with async_session() as session:
                return await session.execute(piezo_query)

        async def run_hydro():
            async with async_session() as session:
                return await session.execute(hydro_query)

        if want_piezo and want_hydro:
            piezo_result, hydro_result = await asyncio.gather(run_piezo(), run_hydro())
        elif want_piezo:
            piezo_result = await run_piezo()
            hydro_result = None
        elif want_hydro:
            hydro_result = await run_hydro()
            piezo_result = None
        else:
            piezo_result = None
            hydro_result = None

        if piezo_result is not None:
            for row in piezo_result.mappings().all():
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

        if hydro_result is not None:
            for row in hydro_result.mappings().all():
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
                        "code_site": r["code_site"],
                        "derniere_mesure": str(r["derniere_mesure"]) if r["derniere_mesure"] else None,
                        "nb_observations": r["nb_jours_total"],
                    },
                })

        # Overlay computed drought-index classifications
        lookup = await get_classification_lookup()
        _overlay_classification(features, lookup)

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
        lookup = await get_classification_lookup()
        bind: dict = {}
        recent_cutoff = date.today() - timedelta(days=90)

        if lookup:
            # Filter stations by computed classification
            matching_piezo = [
                code for code, cls in lookup.get("piezo", {}).items()
                if cls in severity_list
            ]
            matching_hydro = [
                code for code, cls in lookup.get("hydro", {}).items()
                if cls in severity_list
            ]
        else:
            matching_piezo = None
            matching_hydro = None

        parts = []

        if type is None or type == "piezo":
            conds = ["1=1"]
            if lookup and matching_piezo is not None:
                if not matching_piezo:
                    pass  # No matching piezo stations — skip this part
                else:
                    conds.append("s.code_bss = ANY(:piezo_codes)")
                    bind["piezo_codes"] = matching_piezo
            else:
                conds.append("s.classification_derniere_annee = ANY(:severity)")
                bind["severity"] = severity_list

            if code_departement:
                conds.append("s.code_departement = :dept")
            if active_only:
                conds.append("s.derniere_mesure >= :recent_cutoff")
                bind["recent_cutoff"] = recent_cutoff

            if not (lookup and not matching_piezo):
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
                              AND classification_niveau_annuel IN ('TRES_BAS', 'BAS')
                        ) y
                        WHERE y.grp = (
                            SELECT annee - ROW_NUMBER() OVER (ORDER BY annee)
                            FROM gold.fct_yearly_stats
                            WHERE code_bss = s.code_bss
                              AND classification_niveau_annuel IN ('TRES_BAS', 'BAS')
                            ORDER BY annee DESC LIMIT 1
                        )
                    ) cs ON true
                    WHERE {" AND ".join(conds)}
                """)

        if type is None or type == "hydro":
            conds = ["1=1"]
            if lookup and matching_hydro is not None:
                if not matching_hydro:
                    pass  # No matching hydro stations — skip
                else:
                    conds.append("s.code_station = ANY(:hydro_codes)")
                    bind["hydro_codes"] = matching_hydro
            else:
                if "severity" not in bind:
                    bind["severity"] = severity_list
                conds.append("s.classification_resultat_dern_annee = ANY(:severity)")

            if code_departement:
                conds.append("s.code_departement = :dept")
            if active_only:
                conds.append("s.derniere_mesure >= :recent_cutoff")
                bind["recent_cutoff"] = recent_cutoff

            if not (lookup and not matching_hydro):
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
                              AND classification_resultat_annuel IN ('TRES_BAS', 'BAS')
                        ) y
                        WHERE y.grp = (
                            SELECT annee - ROW_NUMBER() OVER (ORDER BY annee)
                            FROM gold.fct_yearly_hydro
                            WHERE code_station = s.code_station
                              AND classification_resultat_annuel IN ('TRES_BAS', 'BAS')
                            ORDER BY annee DESC LIMIT 1
                        )
                    ) cs ON true
                    WHERE {" AND ".join(conds)}
                """)

        if not parts:
            return []

        if code_departement:
            bind["dept"] = code_departement

        union = " UNION ALL ".join(parts)
        query = f"{union} ORDER BY classification, code"
        result = await db.execute(text(query), bind)
        rows = [dict(row) for row in result.mappings().all()]

        # Overlay computed classifications
        if lookup:
            for row in rows:
                computed = lookup.get(row["type"], {}).get(row["code"])
                if computed and computed != "UNKNOWN":
                    row["classification"] = computed

        return rows

    return await cached_response("alerts", params, ALERTS_TTL, fetch)


@router.get("/stats/national", response_model=NationalStats)
async def get_national_stats(db: AsyncSession = Depends(get_db)):
    async def fetch():
        recent_cutoff = date.today() - timedelta(days=90)
        lookup = await get_classification_lookup()

        if lookup:
            # Compute stats from classification lookup
            result = await db.execute(text("""
                SELECT code_bss AS code, 'piezo' AS type
                FROM gold.dim_piezo_stations
                WHERE derniere_mesure >= :recent_cutoff
                UNION ALL
                SELECT code_station AS code, 'hydro' AS type
                FROM gold.dim_hydro_stations
                WHERE derniere_mesure >= :recent_cutoff
            """), {"recent_cutoff": recent_cutoff})
            rows = result.mappings().all()

            counts = {
                "total_piezo": 0, "total_hydro": 0,
                "piezo_no_class": 0,
            }
            for cls in ["extremement_bas", "tres_bas", "bas", "normal", "haut", "tres_haut", "extremement_haut"]:
                counts[f"piezo_{cls}"] = 0
                counts[f"hydro_{cls}"] = 0

            for row in rows:
                stype = row["type"]
                code = row["code"]
                cls = lookup.get(stype, {}).get(code, "UNKNOWN")
                prefix = stype
                counts[f"total_{prefix}"] += 1
                key = f"{prefix}_{cls.lower()}"
                if key in counts:
                    counts[key] += 1
                elif prefix == "piezo":
                    counts["piezo_no_class"] += 1

            return counts
        else:
            # Fallback: DB-based stats (5-class)
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
        lookup = await get_classification_lookup()

        if lookup:
            # Compute department stats from classification lookup
            result = await db.execute(text("""
                SELECT code_bss AS code, 'piezo' AS type, code_departement, nom_departement
                FROM gold.dim_piezo_stations
                WHERE code_departement IS NOT NULL AND derniere_mesure >= :recent_cutoff
            """), {"recent_cutoff": recent_cutoff})
            piezo_rows = result.mappings().all()

            result = await db.execute(text("""
                SELECT code_station AS code, code_departement
                FROM gold.dim_hydro_stations
                WHERE code_departement IS NOT NULL AND derniere_mesure >= :recent_cutoff
            """), {"recent_cutoff": recent_cutoff})
            hydro_rows = result.mappings().all()

            result = await db.execute(text("""
                SELECT code_departement, avg(variation_annuelle_m) AS avg_variation
                FROM gold.agg_station_trends
                WHERE saison = 'annuel'
                GROUP BY code_departement
            """))
            trends = {r["code_departement"]: r["avg_variation"] for r in result.mappings().all()}

            # Hydro count per dept
            hydro_per_dept: dict[str, int] = {}
            for r in hydro_rows:
                dept = r["code_departement"]
                hydro_per_dept[dept] = hydro_per_dept.get(dept, 0) + 1

            # Piezo stats per dept
            dept_data: dict[str, dict] = {}
            for r in piezo_rows:
                dept = r["code_departement"]
                if dept not in dept_data:
                    dept_data[dept] = {
                        "code_departement": dept,
                        "nom_departement": r["nom_departement"],
                        "nb_piezo": 0,
                        "tres_bas_count": 0,
                    }
                dept_data[dept]["nb_piezo"] += 1
                cls = lookup.get("piezo", {}).get(r["code"], "UNKNOWN")
                if cls in ("EXTREMEMENT_BAS", "TRES_BAS"):
                    dept_data[dept]["tres_bas_count"] += 1

            out = []
            for dept, d in sorted(dept_data.items()):
                nb_piezo = d["nb_piezo"]
                out.append({
                    "code_departement": dept,
                    "nom_departement": d["nom_departement"],
                    "nb_piezo": nb_piezo,
                    "nb_hydro": hydro_per_dept.get(dept, 0),
                    "pct_tres_bas": round(d["tres_bas_count"] / nb_piezo * 100, 1) if nb_piezo > 0 else None,
                    "avg_variation": trends.get(dept),
                })
            return out
        else:
            # Fallback: existing SQL
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


@router.get("/classifications/timeline")
async def get_classification_timeline():
    """Monthly classification timeline for all stations.

    Uses calendar-month percentile ranking: each month's value is compared
    against all values for the *same calendar month* across all years,
    removing seasonality effects.

    Returns compact format: periods[] + stations dict with integer arrays.
    Classification codes: 0=EXTREMEMENT_BAS, 1=TRES_BAS, 2=BAS, 3=NORMAL,
    4=HAUT, 5=TRES_HAUT, 6=EXTREMEMENT_HAUT, 7=UNKNOWN.
    """

    async def fetch():
        # Run both queries in parallel, each with its own session
        async def run_piezo():
            async with async_session() as session:
                return await session.execute(text("""
                    WITH ranked AS (
                        SELECT code_bss AS code,
                               TO_CHAR(mois, 'YYYY-MM') AS period,
                               PERCENT_RANK() OVER (
                                   PARTITION BY code_bss, EXTRACT(MONTH FROM mois)
                                   ORDER BY niveau_moyen
                               ) AS pctile
                        FROM gold.fct_monthly_chroniques
                        WHERE niveau_moyen IS NOT NULL AND mois >= '2000-01-01'
                    )
                    SELECT code, period,
                        CASE
                            WHEN pctile < 0.05 THEN 0
                            WHEN pctile < 0.10 THEN 1
                            WHEN pctile < 0.25 THEN 2
                            WHEN pctile < 0.75 THEN 3
                            WHEN pctile < 0.90 THEN 4
                            WHEN pctile < 0.95 THEN 5
                            ELSE 6
                        END AS cls
                    FROM ranked
                    ORDER BY code, period
                """))

        async def run_hydro():
            async with async_session() as session:
                return await session.execute(text("""
                    WITH ranked AS (
                        SELECT code_station AS code,
                               TO_CHAR(mois, 'YYYY-MM') AS period,
                               PERCENT_RANK() OVER (
                                   PARTITION BY code_station, EXTRACT(MONTH FROM mois)
                                   ORDER BY resultat_moyen
                               ) AS pctile
                        FROM gold.fct_monthly_hydro
                        WHERE resultat_moyen IS NOT NULL AND mois >= '2000-01-01'
                    )
                    SELECT code, period,
                        CASE
                            WHEN pctile < 0.05 THEN 0
                            WHEN pctile < 0.10 THEN 1
                            WHEN pctile < 0.25 THEN 2
                            WHEN pctile < 0.75 THEN 3
                            WHEN pctile < 0.90 THEN 4
                            WHEN pctile < 0.95 THEN 5
                            ELSE 6
                        END AS cls
                    FROM ranked
                    ORDER BY code, period
                """))

        piezo_result, hydro_result = await asyncio.gather(run_piezo(), run_hydro())

        # Collect all unique periods and build per-station dicts
        periods_set: set[str] = set()
        station_periods: dict[str, dict[str, int]] = {}

        for row in piezo_result.mappings():
            periods_set.add(row["period"])
            station_periods.setdefault(row["code"], {})[row["period"]] = row["cls"]

        for row in hydro_result.mappings():
            periods_set.add(row["period"])
            station_periods.setdefault(row["code"], {})[row["period"]] = row["cls"]

        periods = sorted(periods_set)

        # Convert to compact arrays (7 = UNKNOWN for missing periods)
        stations = {
            code: [vals.get(p, 7) for p in periods]
            for code, vals in station_periods.items()
        }

        return {"periods": periods, "stations": stations}

    return await cached_response("timeline", {}, TIMELINE_TTL, fetch)
