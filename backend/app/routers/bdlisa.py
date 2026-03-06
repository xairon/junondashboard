import logging

import httpx
from fastapi import APIRouter, HTTPException, Query
from starlette.responses import Response

from app.cache import get_redis, cache_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/bdlisa", tags=["bdlisa"])

BDLISA_TTL = 86400  # 24h — reference data
FICHELOG_URL = "https://reseau.eaufrance.fr/geotraitements/bdlisa/log/FicheLog"

_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=30.0)
    return _http_client


async def close_bdlisa_client():
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None


@router.get("/polygon")
async def bdlisa_polygon(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    """Return the BDLISA NV3 groundwater body polygon at a given point."""
    # Round to ~110m precision for cache dedup
    cache_lat = round(lat, 3)
    cache_lon = round(lon, 3)
    redis_key = cache_key("bdlisa:polygon", {"lat": cache_lat, "lon": cache_lon})

    r = get_redis()
    if r is not None:
        try:
            cached = await r.get(redis_key)
            if cached:
                return Response(content=cached, media_type="application/json")
        except Exception:
            pass

    try:
        client = _get_http_client()
        resp = await client.get(
            FICHELOG_URL,
            params={
                "FULL": "false",
                "CARTO": "true",
                "BDLISA": "true",
                "SRS": "EPSG:4326",
                "X": str(lon),
                "Y": str(lat),
                "jsoncallback": "cb",
            },
        )
        resp.raise_for_status()
    except Exception as e:
        logger.warning("BDLISA FicheLog request failed: %s", e)
        raise HTTPException(502, "BDLISA service unavailable")

    text = resp.text.strip()
    # Strip JSONP wrapper: cb({...});
    if text.startswith("cb("):
        text = text[3:]
        if text.endswith(");"):
            text = text[:-2]
        elif text.endswith(")"):
            text = text[:-1]

    import orjson
    try:
        data = orjson.loads(text)
    except Exception:
        raise HTTPException(502, "Invalid BDLISA response")

    polygon_str = data.get("polygoneElementaire")
    if not polygon_str:
        raise HTTPException(404, "No groundwater body at this location")

    try:
        polygon = orjson.loads(polygon_str) if isinstance(polygon_str, str) else polygon_str
    except Exception:
        raise HTTPException(502, "Invalid polygon geometry")

    result = orjson.dumps({"polygon": polygon})

    if r is not None:
        try:
            await r.set(redis_key, result, ex=BDLISA_TTL)
        except Exception:
            pass

    return Response(content=result, media_type="application/json")
