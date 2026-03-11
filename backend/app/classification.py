"""Batch computation of current drought classifications for all stations.

Computes SPLI (piezo) and SSFI (hydro) for the latest month of each station,
caches the result in Redis for 24h.  Used by GeoJSON, alerts, and stats endpoints
to provide standardized index-based classifications instead of raw percentiles.
"""

from __future__ import annotations

import asyncio
import json
import logging

from sqlalchemy import text

from app.cache import get_redis
from app.database import async_session
from app.drought import classify_latest_spli, classify_latest_ssfi

logger = logging.getLogger(__name__)

CLASSIFICATION_TTL = 86400  # 24h
CLASSIFICATION_KEY = "hydro:classifications:current"


async def get_classification_lookup() -> dict[str, dict[str, str]] | None:
    """Return cached classification lookup, or None if unavailable."""
    r = get_redis()
    if r is None:
        return None
    try:
        cached = await r.get(CLASSIFICATION_KEY)
        if cached:
            return json.loads(cached)
    except Exception as e:
        logger.debug("Redis error reading classifications: %s", e)
    return None


async def warm_classification_cache() -> None:
    """Compute classifications for all stations and cache in Redis."""
    logger.info("Computing drought classifications for all stations...")
    try:
        result = await _compute_all_classifications()
        r = get_redis()
        if r is not None:
            await r.setex(CLASSIFICATION_KEY, CLASSIFICATION_TTL, json.dumps(result))
        logger.info(
            "Classifications cached: %d piezo, %d hydro",
            len(result.get("piezo", {})),
            len(result.get("hydro", {})),
        )
    except Exception:
        logger.exception("Failed to compute classifications")


def _compute_reliability(months: list[str]) -> str:
    """Compute station data reliability from its monthly date list.

    Counts distinct years with >= 6 months of data:
      - >= 10 years → 'fiable'
      - 5-9 years  → 'indicatif'
      - < 5 years  → 'insuffisant'
    """
    year_counts: dict[int, int] = {}
    for m in months:
        year = int(m[:4])
        year_counts[year] = year_counts.get(year, 0) + 1
    nb_reliable_years = sum(1 for c in year_counts.values() if c >= 6)
    if nb_reliable_years >= 10:
        return "fiable"
    elif nb_reliable_years >= 5:
        return "indicatif"
    return "insuffisant"


async def _compute_all_classifications() -> dict[str, dict[str, str]]:
    """Compute SPLI/SSFI classification and reliability for every station."""
    async with async_session() as db:
        piezo_result = await db.execute(text("""
            SELECT code_bss, mois, niveau_moyen
            FROM gold.fct_monthly_chroniques
            WHERE niveau_moyen IS NOT NULL
            ORDER BY code_bss, mois
        """))
        piezo_rows = piezo_result.mappings().all()

        hydro_result = await db.execute(text("""
            SELECT code_station, mois, resultat_moyen
            FROM gold.fct_monthly_hydro
            WHERE resultat_moyen IS NOT NULL
            ORDER BY code_station, mois
        """))
        hydro_rows = hydro_result.mappings().all()

    # Group piezo by station
    piezo_stations: dict[str, tuple[list, list]] = {}
    for r in piezo_rows:
        code = r["code_bss"]
        if code not in piezo_stations:
            piezo_stations[code] = ([], [])
        piezo_stations[code][0].append(str(r["mois"]))
        piezo_stations[code][1].append(float(r["niveau_moyen"]))

    # Group hydro by station
    hydro_stations: dict[str, tuple[list, list]] = {}
    for r in hydro_rows:
        code = r["code_station"]
        if code not in hydro_stations:
            hydro_stations[code] = ([], [])
        hydro_stations[code][0].append(str(r["mois"]))
        hydro_stations[code][1].append(float(r["resultat_moyen"]))

    # Run CPU-bound KDE/gamma fitting + reliability in thread pool
    def compute_piezo():
        classifications = {}
        reliability = {}
        for code, (months, values) in piezo_stations.items():
            _, classification = classify_latest_spli(months, values)
            classifications[code] = classification
            reliability[code] = _compute_reliability(months)
        return classifications, reliability

    def compute_hydro():
        classifications = {}
        reliability = {}
        for code, (months, values) in hydro_stations.items():
            _, classification = classify_latest_ssfi(months, values)
            classifications[code] = classification
            reliability[code] = _compute_reliability(months)
        return classifications, reliability

    loop = asyncio.get_event_loop()
    (piezo_cls, piezo_rel), (hydro_cls, hydro_rel) = await asyncio.gather(
        loop.run_in_executor(None, compute_piezo),
        loop.run_in_executor(None, compute_hydro),
    )

    return {
        "piezo": piezo_cls,
        "hydro": hydro_cls,
        "reliability": {**piezo_rel, **hydro_rel},
    }
