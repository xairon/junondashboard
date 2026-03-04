import hashlib
import json
import logging
from typing import Any, Callable, Awaitable

import redis.asyncio as redis
from starlette.responses import Response

from app.config import settings
from app.json_response import FastJSONResponse

logger = logging.getLogger(__name__)

pool: redis.ConnectionPool | None = None
try:
    pool = redis.ConnectionPool.from_url(
        settings.redis_url, decode_responses=True,
        socket_connect_timeout=5, socket_timeout=10,
    )
except Exception:
    logger.warning("Redis not configured, caching disabled")


def get_redis() -> redis.Redis | None:
    if pool is None:
        return None
    return redis.Redis(connection_pool=pool)


def cache_key(prefix: str, params: dict) -> str:
    raw = json.dumps(params, sort_keys=True, default=str)
    h = hashlib.sha256(raw.encode()).hexdigest()[:16]
    return f"hydro:{prefix}:{h}"


async def cached(r: redis.Redis | None, key: str, ttl: int, fetch_fn: Callable[[], Awaitable[Any]]):
    if r is not None:
        try:
            cached_val = await r.get(key)
            if cached_val:
                return json.loads(cached_val)
        except Exception as e:
            logger.debug("Redis error: %s", e)

    result = await fetch_fn()

    if r is not None:
        try:
            await r.setex(key, ttl, json.dumps(result, default=str))
        except Exception as e:
            logger.debug("Redis error: %s", e)

    return result


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
