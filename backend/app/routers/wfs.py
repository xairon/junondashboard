import asyncio
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

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
    "masse-eau-sout": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/MasseDEau_VRAP2022",
        "typename": "MasseDEauSouterraine_VRAP2022_FXX",
    },
    "masse-eau-riv": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/MasseDEau_VRAP2022",
        "typename": "MasseDEauRiviere_VRAP2022_FXX",
    },
}


@router.get("/{layer_id}")
async def get_wfs_layer(
    layer_id: str,
    bbox: Optional[str] = Query(None, description="Bounding box: min_lon,min_lat,max_lon,max_lat"),
):
    if layer_id not in WFS_LAYERS:
        raise HTTPException(status_code=404, detail=f"Unknown layer: {layer_id}")

    layer = WFS_LAYERS[layer_id]
    cache_params = {"layer_id": layer_id, "bbox": bbox}

    async def fetch():
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

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(layer["base_url"], params=params)
            if resp.status_code != 200:
                logger.error("WFS error for %s: %s %s", layer_id, resp.status_code, resp.text[:200])
                raise HTTPException(status_code=502, detail=f"WFS service error for {layer_id}")
            try:
                return resp.json()
            except Exception:
                logger.error("WFS non-JSON response for %s: %s", layer_id, resp.text[:200])
                raise HTTPException(status_code=502, detail=f"WFS service returned non-JSON for {layer_id}")

    return await cached_response(f"wfs_{layer_id}", cache_params, WFS_TTL, fetch)


async def warm_wfs_cache():
    """Pre-fetch all WFS layers into Redis cache at startup."""
    r = get_redis()
    if r is None:
        logger.info("Redis not available, skipping WFS cache warm-up")
        return

    for layer_id, layer in WFS_LAYERS.items():
        key = cache_key(f"wfs_{layer_id}", {"layer_id": layer_id, "bbox": None})
        try:
            existing = await r.get(key)
            if existing:
                logger.info("WFS cache already warm for %s", layer_id)
                continue
        except Exception:
            pass

        try:
            params = {
                "SERVICE": "WFS",
                "VERSION": "2.0.0",
                "REQUEST": "GetFeature",
                "TYPENAMES": layer["typename"],
                "OUTPUTFORMAT": "application/json; subtype=geojson",
                "SRSNAME": "EPSG:4326",
            }
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.get(layer["base_url"], params=params)
                if resp.status_code == 200:
                    from app.json_response import FastJSONResponse
                    body = FastJSONResponse(resp.json()).body
                    await r.setex(key, WFS_TTL, body)
                    logger.info("WFS cache warmed for %s (%d bytes)", layer_id, len(body))
                else:
                    logger.warning("WFS warm-up failed for %s: %s", layer_id, resp.status_code)
        except Exception as e:
            logger.warning("WFS warm-up error for %s: %s", layer_id, e)

        await asyncio.sleep(0.5)  # rate-limit requests to SANDRE
