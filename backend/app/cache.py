import hashlib
import json
import logging

import redis.asyncio as redis
from starlette.responses import Response

from app.config import settings
from app.json_response import FastJSONResponse

logger = logging.getLogger(__name__)

pool: redis.ConnectionPool | None = None
_client: redis.Redis | None = None
try:
    pool = redis.ConnectionPool.from_url(
        settings.redis_url, decode_responses=False,
        socket_connect_timeout=5, socket_timeout=10,
    )
    _client = redis.Redis(connection_pool=pool)
except Exception:
    logger.warning("Redis not configured, caching disabled")


def get_redis() -> redis.Redis | None:
    return _client


def _normalize_value(v):
    if isinstance(v, list):
        return sorted(str(x) for x in v)
    return v


def cache_key(prefix: str, params: dict) -> str:
    normalized = {k: _normalize_value(v) for k, v in params.items()}
    raw = json.dumps(normalized, sort_keys=True, default=str)
    h = hashlib.sha256(raw.encode()).hexdigest()[:32]
    return f"hydro:{prefix}:{h}"


async def cached_response(prefix: str, params: dict, ttl: int, fetch_fn) -> Response:
    r = get_redis()
    key = cache_key(prefix, params)

    # Try to return raw cached bytes directly, bypassing double serialization
    if r is not None:
        try:
            cached_val = await r.get(key)
            if cached_val:
                return Response(content=cached_val, media_type="application/json")
        except Exception as e:
            logger.debug("Redis error: %s", e)

    # Cache miss: fetch, serialize once with orjson via FastJSONResponse, store raw JSON
    result = await fetch_fn()
    resp = FastJSONResponse(result)
    body = resp.body  # orjson-serialized bytes

    if r is not None:
        try:
            await r.setex(key, ttl, body)
        except Exception as e:
            logger.debug("Redis error: %s", e)

    return resp
