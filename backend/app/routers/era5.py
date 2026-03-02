from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import cache_key, cached, get_redis
from app.database import get_db
from app.models.era5 import ERA5GridPoint, ERA5Snapshot

router = APIRouter(prefix="/api/v1/era5", tags=["era5"])

GRID_TTL = 86400
SNAPSHOT_TTL = 86400
DATES_TTL = 86400


@router.get("/grid", response_model=list[ERA5GridPoint])
async def get_era5_grid(
    db: AsyncSession = Depends(get_db),
):
    r = get_redis()
    key = cache_key("era5_grid", {})

    async def fetch():
        query = """
            SELECT era5_latitude, era5_longitude
            FROM gold.int_era5_grid_points
            ORDER BY era5_latitude, era5_longitude
        """
        result = await db.execute(text(query))
        rows = result.mappings().all()
        return [dict(row) for row in rows]

    return await cached(r, key, GRID_TTL, fetch)


@router.get("/snapshot", response_model=list[ERA5Snapshot])
async def get_era5_snapshot(
    date: date = Query(..., alias="date", description="Date for the ERA5 snapshot"),
    db: AsyncSession = Depends(get_db),
):
    r = get_redis()
    key = cache_key("era5_snapshot", {"date": str(date)})

    async def fetch():
        query = """
            SELECT latitude, longitude,
                   temperature_2m, total_precipitation, potential_evaporation
            FROM gold.int_era5_for_stations
            WHERE era5_date = :snapshot_date
        """
        result = await db.execute(text(query), {"snapshot_date": date})
        rows = result.mappings().all()
        return [dict(row) for row in rows]

    return await cached(r, key, SNAPSHOT_TTL, fetch)


@router.get("/dates")
async def get_era5_dates(
    db: AsyncSession = Depends(get_db),
):
    r = get_redis()
    key = cache_key("era5_dates", {})

    async def fetch():
        query = """
            SELECT DISTINCT date_trunc('month', era5_date)::date AS month
            FROM gold.int_era5_for_stations
            ORDER BY month
        """
        result = await db.execute(text(query))
        return [str(row["month"]) for row in result.mappings().all()]

    return await cached(r, key, DATES_TTL, fetch)


@router.get("/monthly")
async def get_era5_monthly(
    month: str = Query(..., description="Month in YYYY-MM-DD format (first of month)"),
    db: AsyncSession = Depends(get_db),
):
    r = get_redis()
    key = cache_key("era5_monthly", {"month": month})

    async def fetch():
        query = """
            SELECT latitude, longitude,
                   AVG(temperature_2m) AS temperature_2m,
                   SUM(total_precipitation) AS total_precipitation,
                   AVG(potential_evaporation) AS potential_evaporation
            FROM gold.int_era5_for_stations
            WHERE date_trunc('month', era5_date) = :month::date
            GROUP BY latitude, longitude
        """
        result = await db.execute(text(query), {"month": month})
        return [dict(row) for row in result.mappings().all()]

    return await cached(r, key, SNAPSHOT_TTL, fetch)
