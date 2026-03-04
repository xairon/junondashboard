import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.cache import cached_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/wfs", tags=["wfs"])

WFS_TTL = 86400  # 24h — reference data, rarely changes

WFS_LAYERS = {
    "region-hydro": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "sa:RegionHydro",
    },
    "secteur-hydro": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "sa:SecteurHydro",
    },
    "sous-secteur-hydro": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "sa:SousSecteurHydro",
    },
    "zone-hydro": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "sa:ZoneHydro",
    },
    "cours-eau-1": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "sa:CoursEau1",
    },
    "cours-eau-2": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "sa:CoursEau2",
    },
    "plan-eau": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "sa:PlanEau_FXX",
    },
    "masse-eau-sout": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/MasseDEau_VRAP2022",
        "typename": "sa:MasseDEauSouterraine_VRAP2022_FXX",
    },
    "masse-eau-riv": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/MasseDEau_VRAP2022",
        "typename": "sa:MasseDEauRiviere_VRAP2022_FXX",
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
            "TYPENAME": layer["typename"],
            "OUTPUTFORMAT": "application/json",
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
