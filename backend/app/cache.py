import hashlib
import json
import logging
from typing import Any, Callable, Awaitable

import redis.asyncio as redis
from app.config import settings

logger = logging.getLogger(__name__)

pool: redis.ConnectionPool | None = None
try:
    pool = redis.ConnectionPool.from_url(
        settings.redis_url, decode_responses=True,
        socket_connect_timeout=1, socket_timeout=1,
    )
except Exception:
    logger.warning("Redis not configured, caching disabled")


def get_redis() -> redis.Redis | None:
    if pool is None:
        return None
    return redis.Redis(connection_pool=pool)


def cache_key(prefix: str, params: dict) -> str:
    raw = json.dumps(params, sort_keys=True, default=str)
    h = hashlib.md5(raw.encode()).hexdigest()[:12]
    return f"hydro:{prefix}:{h}"


async def cached(r: redis.Redis | None, key: str, ttl: int, fetch_fn: Callable[[], Awaitable[Any]]):
    if r is not None:
        try:
            cached_val = await r.get(key)
            if cached_val:
                return json.loads(cached_val)
        except Exception:
            pass

    result = await fetch_fn()

    if r is not None:
        try:
            await r.setex(key, ttl, json.dumps(result, default=str))
        except Exception:
            pass

    return result
