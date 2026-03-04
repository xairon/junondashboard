import asyncio
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from starlette.responses import Response

from app.cache import cached_response, get_redis, cache_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/wfs", tags=["wfs"])

WFS_TTL = 86400  # 24h — reference data, rarely changes

WFS_LAYERS = {
    "region-hydro": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "RegionHydro",
    },
    "secteur-hydro": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "SecteurHydro",
    },
    "sous-secteur-hydro": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "SousSecteurHydro",
    },
    "zone-hydro": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "ZoneHydro",
    },
    "cours-eau-1": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "CoursEau1",
    },
    "cours-eau-2": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "CoursEau2",
    },
    "plan-eau": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "PlanEau_FXX",
    },
    "masse-eau-riv": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/MasseDEau_VRAP2022",
        "typename": "MasseDEauRiviere_VRAP2022_FXX",
    },
}


async def _fetch_wfs_raw(layer_id: str, bbox: Optional[str] = None) -> bytes:
    """Fetch WFS layer as raw bytes (no JSON parsing to avoid OOM on large layers)."""
    layer = WFS_LAYERS[layer_id]
    params = {
        "SERVICE": "WFS",
        "VERSION": "2.0.0",
        "REQUEST": "GetFeature",
        "TYPENAMES": layer["typename"],
        "OUTPUTFORMAT": "application/json; subtype=geojson",
        "SRSNAME": "EPSG:4326",
    }
    if bbox:
        params["BBOX"] = bbox

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.get(layer["base_url"], params=params)
        if resp.status_code != 200:
            logger.error("WFS error for %s: %s %s", layer_id, resp.status_code, resp.text[:200])
            raise HTTPException(status_code=502, detail=f"WFS service error for {layer_id}")
        return resp.content  # raw bytes, no parsing


@router.get("/{layer_id}")
async def get_wfs_layer(
    layer_id: str,
    bbox: Optional[str] = Query(None, description="Bounding box: min_lon,min_lat,max_lon,max_lat"),
):
    if layer_id not in WFS_LAYERS:
        raise HTTPException(status_code=404, detail=f"Unknown layer: {layer_id}")

    key = cache_key(f"wfs_{layer_id}", {"layer_id": layer_id, "bbox": bbox})
    r = get_redis()

    # Try cache first
    if r is not None:
        try:
            cached_val = await r.get(key)
            if cached_val:
                return Response(content=cached_val, media_type="application/json")
        except Exception as e:
            logger.debug("Redis error: %s", e)

    # Fetch raw bytes from SANDRE (no JSON parse/re-serialize)
    raw = await _fetch_wfs_raw(layer_id, bbox)

    # Store in cache
    if r is not None:
        try:
            await r.setex(key, WFS_TTL, raw)
            logger.info("WFS cached %s (%d bytes)", layer_id, len(raw))
        except Exception as e:
            logger.debug("Redis error: %s", e)

    return Response(content=raw, media_type="application/json")


async def warm_wfs_cache():
    """Pre-fetch all WFS layers into Redis cache at startup.
    Uses a Redis lock to prevent multiple workers from warming simultaneously."""
    r = get_redis()
    if r is None:
        logger.info("Redis not available, skipping WFS cache warm-up")
        return

    # Acquire lock so only one worker warms the cache
    lock_key = "hydro:wfs_warm_lock"
    try:
        acquired = await r.set(lock_key, "1", nx=True, ex=600)  # 10 min lock
        if not acquired:
            logger.info("WFS warm-up already running in another worker, skipping")
            return
    except Exception:
        pass  # If lock fails, proceed anyway

    try:
        for layer_id in WFS_LAYERS:
            key = cache_key(f"wfs_{layer_id}", {"layer_id": layer_id, "bbox": None})
            try:
                existing = await r.exists(key)
                if existing:
                    logger.info("WFS cache already warm for %s", layer_id)
                    continue
            except Exception:
                pass

            try:
                raw = await _fetch_wfs_raw(layer_id)
                await r.setex(key, WFS_TTL, raw)
                logger.info("WFS cache warmed for %s (%d bytes)", layer_id, len(raw))
            except Exception as e:
                logger.warning("WFS warm-up error for %s: %s", layer_id, e)

            await asyncio.sleep(1)  # rate-limit requests to SANDRE
    finally:
        try:
            await r.delete(lock_key)
        except Exception:
            pass
