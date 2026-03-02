import logging
import traceback
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import get_redis, pool as redis_pool
from app.config import settings
from app.database import engine, get_db
from app.json_response import FastJSONResponse
from app.routers import stations, timeseries, trends, stats, era5, alerts


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=settings.log_level)
    r = get_redis()
    if r is not None:
        try:
            await r.ping()
            logging.getLogger(__name__).info("Redis connection OK")
        except Exception as e:
            logging.getLogger(__name__).warning("Redis ping failed: %s", e)
    yield
    if redis_pool is not None:
        await redis_pool.aclose()
    await engine.dispose()


app = FastAPI(
    title="Hydro Dashboard API",
    version="0.1.0",
    lifespan=lifespan,
    default_response_class=FastJSONResponse,
    docs_url=None if not settings.debug else "/docs",
    redoc_url=None if not settings.debug else "/redoc",
    openapi_url=None if not settings.debug else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET"],
    allow_headers=["Content-Type", "Accept"],
)

app.include_router(stations.router)
app.include_router(timeseries.router)
app.include_router(trends.router)
app.include_router(stats.router)
app.include_router(era5.router)
app.include_router(alerts.router)


@app.get("/api/v1/health")
async def health(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        raise HTTPException(status_code=503, detail="Database unavailable")
    r = get_redis()
    redis_status = "disabled"
    if r is not None:
        try:
            await r.ping()
            redis_status = "ok"
        except Exception:
            redis_status = "unavailable"
    return {"status": "ok", "db": "ok", "redis": redis_status}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.getLogger(__name__).error("Unhandled error: %s", traceback.format_exc())
    return FastJSONResponse({"detail": "Internal server error"}, status_code=500)
