from datetime import date

from pydantic import BaseModel


class PastasSummary(BaseModel):
    code_bss: str
    # Quality metrics
    evp: float | None = None
    nash: float | None = None
    kge: float | None = None
    rmse: float | None = None
    r2: float | None = None
    # IRF parameters
    tmax_days: float | None = None
    cutoff_95_days: float | None = None
    gain: float | None = None
    mean_response_time: float | None = None
    # Block response (impulse response function curve)
    block_response: list[float] | None = None
    # Key signatures
    autocorr_time: float | None = None
    recession_constant: float | None = None
    recovery_constant: float | None = None
    parde_seasonality: float | None = None
    avg_seasonal_fluctuation: float | None = None
    colwell_constancy: float | None = None
    duration_curve_slope: float | None = None
    baselevel_index: float | None = None
    # Metadata
    series_start: date | None = None
    series_end: date | None = None
    series_length_days: int | None = None
    n_observations: int | None = None
    fitted_at: date | None = None
    pastas_version: str | None = None


class PastasTimeseriesPoint(BaseModel):
    date: date
    simulated: float | None = None
    observed: float | None = None
    residuals: float | None = None
    recharge_contribution: float | None = None
    wb_recharge: float | None = None
    wb_actual_evaporation: float | None = None
    wb_surface_runoff: float | None = None
    wb_effective_precip: float | None = None


class PastasSGIPoint(BaseModel):
    date: date
    sgi: float | None = None
    classification: str = "UNKNOWN"


class PastasCoverage(BaseModel):
    code_bss: str
    evp: float | None = None
    nash: float | None = None
    tmax_days: float | None = None
