from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import cached_response
from app.database import get_db
from app.models.pastas import PastasCoverage, PastasSGIPoint, PastasSummary, PastasTimeseriesPoint

router = APIRouter(prefix="/api/v1/pastas", tags=["pastas"])

SUMMARY_TTL = 86400      # 24h
TIMESERIES_TTL = 21600   # 6h
SGI_TTL = 43200          # 12h
COVERAGE_TTL = 86400     # 24h

# SGI classification thresholds (same 7-class as SPLI/SSFI)
_SGI_THRESHOLDS = [
    (-1.75, "EXTREMEMENT_BAS"),
    (-1.28, "TRES_BAS"),
    (-0.84, "BAS"),
    (0.84, "NORMAL"),
    (1.28, "HAUT"),
    (1.75, "TRES_HAUT"),
]


def _classify_sgi(value: float | None) -> str:
    if value is None:
        return "UNKNOWN"
    for threshold, label in _SGI_THRESHOLDS:
        if value < threshold:
            return label
    return "EXTREMEMENT_HAUT"


@router.get("/stations/{code_bss:path}/summary", response_model=PastasSummary)
async def get_pastas_summary(code_bss: str, db: AsyncSession = Depends(get_db)):
    async def fetch():
        query = """
            SELECT
                i.code_bss,
                i.evp, i.nash, i.kge, i.rmse, i.r2,
                i.tmax_days, i.cutoff_95_days, i.gain, i.mean_response_time,
                i.block_response,
                i.series_start, i.series_end, i.series_length_days,
                i.n_observations, i.fitted_at, i.pastas_version,
                s.autocorr_time, s.recession_constant, s.recovery_constant,
                s.parde_seasonality, s.avg_seasonal_fluctuation,
                s.colwell_constancy, s.duration_curve_slope, s.baselevel_index
            FROM ml.pastas_irf_features i
            LEFT JOIN ml.pastas_groundwater_signatures s
                ON i.code_bss = s.code_bss
            WHERE i.code_bss = :code
        """
        result = await db.execute(text(query), {"code": code_bss})
        row = result.mappings().first()
        if not row:
            raise HTTPException(404, f"No PASTAS model for station {code_bss}")
        data = dict(row)
        # Convert block_response from DB array to list
        if data.get("block_response") is not None:
            data["block_response"] = list(data["block_response"])
        return data

    return await cached_response("pastas_summary", {"code_bss": code_bss}, SUMMARY_TTL, fetch)


@router.get("/stations/{code_bss:path}/timeseries", response_model=list[PastasTimeseriesPoint])
async def get_pastas_timeseries(
    code_bss: str,
    resolution: str = Query("monthly", pattern="^(daily|monthly)$"),
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    params = {"code_bss": code_bss, "resolution": resolution, "start": str(start), "end": str(end)}

    async def fetch():
        bind: dict = {"code": code_bss}
        conditions = ["code_bss = :code"]

        if resolution == "daily":
            if not start or not end:
                raise HTTPException(400, "start and end required for daily resolution")
            conditions.append("date >= :start")
            conditions.append("date <= :end")
            bind["start"] = start
            bind["end"] = end

            where = " AND ".join(conditions)
            query = f"""
                SELECT date, simulated,
                       simulated + residuals AS observed,
                       residuals, recharge_contribution,
                       wb_recharge, wb_actual_evaporation, wb_surface_runoff, wb_effective_precip
                FROM ml.pastas_model_timeseries
                WHERE {where}
                ORDER BY date
            """
        else:
            # Monthly aggregation
            # observed (simulated + residuals) must be computed row-level before AVG
            # because residuals are sparse (only on observation days)
            where = " AND ".join(conditions)
            query = f"""
                SELECT
                    date_trunc('month', date)::date AS date,
                    AVG(simulated) AS simulated,
                    AVG(simulated + residuals) AS observed,
                    AVG(simulated + residuals) - AVG(simulated) AS residuals,
                    AVG(recharge_contribution) AS recharge_contribution,
                    SUM(wb_recharge) AS wb_recharge,
                    SUM(wb_actual_evaporation) AS wb_actual_evaporation,
                    SUM(wb_surface_runoff) AS wb_surface_runoff,
                    SUM(wb_effective_precip) AS wb_effective_precip
                FROM ml.pastas_model_timeseries
                WHERE {where}
                GROUP BY date_trunc('month', date)
                ORDER BY date
            """

        result = await db.execute(text(query), bind)
        return [dict(r) for r in result.mappings().all()]

    return await cached_response("pastas_ts", params, TIMESERIES_TTL, fetch)


@router.get("/stations/{code_bss:path}/sgi", response_model=list[PastasSGIPoint])
async def get_pastas_sgi(code_bss: str, db: AsyncSession = Depends(get_db)):
    async def fetch():
        query = """
            SELECT date, sgi
            FROM ml.pastas_sgi
            WHERE code_bss = :code
            ORDER BY date
        """
        result = await db.execute(text(query), {"code": code_bss})
        rows = result.mappings().all()
        if not rows:
            raise HTTPException(404, f"No SGI data for station {code_bss}")
        return [
            {"date": r["date"], "sgi": r["sgi"], "classification": _classify_sgi(r["sgi"])}
            for r in rows
        ]

    return await cached_response("pastas_sgi", {"code_bss": code_bss}, SGI_TTL, fetch)


@router.get("/coverage", response_model=list[PastasCoverage])
async def get_pastas_coverage(db: AsyncSession = Depends(get_db)):
    async def fetch():
        query = """
            SELECT code_bss, evp, nash, tmax_days
            FROM ml.pastas_irf_features
            WHERE fit_success = true
            ORDER BY code_bss
        """
        result = await db.execute(text(query))
        return [dict(r) for r in result.mappings().all()]

    return await cached_response("pastas_coverage", {}, COVERAGE_TTL, fetch)
