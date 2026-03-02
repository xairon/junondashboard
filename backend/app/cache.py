import hashlib
import json
from typing import Any, Callable, Awaitable

import redis.asyncio as redis
from app.config import settings

pool = redis.ConnectionPool.from_url(settings.redis_url, decode_responses=True)


def get_redis() -> redis.Redis:
    return redis.Redis(connection_pool=pool)


def cache_key(prefix: str, params: dict) -> str:
    raw = json.dumps(params, sort_keys=True, default=str)
    h = hashlib.md5(raw.encode()).hexdigest()[:12]
    return f"hydro:{prefix}:{h}"


async def cached(r: redis.Redis, key: str, ttl: int, fetch_fn: Callable[[], Awaitable[Any]]):
    cached_val = await r.get(key)
    if cached_val:
        return json.loads(cached_val)
    result = await fetch_fn()
    await r.setex(key, ttl, json.dumps(result, default=str))
    return result
