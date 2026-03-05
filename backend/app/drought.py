"""Standardized drought index computation.

SPLI — Standardized Piezometric Level Index (BRGM IPS methodology, KDE-based)
SPI  — Standardized Precipitation Index (gamma distribution)
SSFI — Standardized Streamflow Index (gamma distribution)

References:
  - BRGM RP-64147-FR (2014) for SPLI/IPS — kernel density estimator
  - McKee et al. (1993) for SPI
  - Modarres (2007) for SSFI

Classification: 7 classes Météo-France (used by ADES/BSH)
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats
from spei import SI

# 7-class Météo-France thresholds (BRGM RP-64147-FR, Tableau 3)
_THRESHOLDS_7 = [
    (-float("inf"), -1.75, "EXTREMEMENT_BAS"),
    (-1.75, -1.28, "TRES_BAS"),
    (-1.28, -0.84, "BAS"),
    (-0.84, 0.84, "NORMAL"),
    (0.84, 1.28, "HAUT"),
    (1.28, 1.75, "TRES_HAUT"),
    (1.75, float("inf"), "EXTREMEMENT_HAUT"),
]

MIN_MONTHS = 60   # 5 years minimum
MIN_PER_MONTH = 10  # minimum observations per calendar month for KDE fitting


def _classify(value: float | None) -> str:
    if value is None or pd.isna(value):
        return "UNKNOWN"
    for lo, hi, label in _THRESHOLDS_7:
        if lo <= value < hi:
            return label
    return "EXTREMEMENT_HAUT"


# ---------------------------------------------------------------------------
# SPLI — BRGM IPS methodology (kernel density estimator)
# ---------------------------------------------------------------------------

def compute_spli(months: list[str], values: list[float | None]) -> list[dict]:
    """Compute SPLI (IPS) using BRGM kernel density estimator methodology.

    For each calendar month, fits a KDE to all historical values of that month,
    computes the CDF, then projects onto a standard normal distribution.

    Args:
        months: ISO date strings (YYYY-MM-DD), first of each month.
        values: Monthly mean groundwater level (m NGF). None for missing.

    Returns:
        List of {mois, value, spli, classification} dicts.
    """
    if len(months) < MIN_MONTHS:
        return []

    index = pd.to_datetime(months)
    series = pd.Series(values, index=index, dtype=float).dropna()
    if len(series) < MIN_MONTHS:
        return []

    # Group by calendar month
    grouped = series.groupby(series.index.month)

    # Fit KDE per calendar month
    kde_per_month: dict[int, stats.gaussian_kde] = {}
    for month_num, group in grouped:
        if len(group) < MIN_PER_MONTH:
            continue
        try:
            kde_per_month[month_num] = stats.gaussian_kde(group.values)
        except Exception:
            continue

    if not kde_per_month:
        return []

    out = []
    for dt, val in series.items():
        m = dt.month
        if m not in kde_per_month:
            out.append({
                "mois": dt.strftime("%Y-%m-%d"),
                "value": round(float(val), 4),
                "spli": None,
                "classification": "UNKNOWN",
            })
            continue

        kde = kde_per_month[m]
        month_values = grouped.get_group(m).values

        # Compute empirical CDF via KDE integration
        # P(X <= val) = integral of KDE from -inf to val
        cdf_val = kde.integrate_box_1d(-np.inf, float(val))

        # Clamp to avoid infinite z-scores at extremes
        cdf_val = np.clip(cdf_val, 0.001, 0.999)

        # Project onto standard normal
        z = float(stats.norm.ppf(cdf_val))
        z = round(z, 3)

        out.append({
            "mois": dt.strftime("%Y-%m-%d"),
            "value": round(float(val), 4),
            "spli": z,
            "classification": _classify(z),
        })

    return out


# ---------------------------------------------------------------------------
# Optimized "latest month only" classifiers for batch computation
# ---------------------------------------------------------------------------

def classify_latest_spli(months: list[str], values: list[float]) -> tuple[float | None, str]:
    """Compute SPLI classification for the most recent month only (fast)."""
    if len(months) < MIN_MONTHS:
        return None, "UNKNOWN"

    index = pd.to_datetime(months)
    series = pd.Series(values, index=index, dtype=float).dropna()
    if len(series) < MIN_MONTHS:
        return None, "UNKNOWN"

    grouped = series.groupby(series.index.month)
    last_month = series.index[-1].month
    last_val = float(series.iloc[-1])

    if last_month not in grouped.groups or len(grouped.get_group(last_month)) < MIN_PER_MONTH:
        return None, "UNKNOWN"

    try:
        kde = stats.gaussian_kde(grouped.get_group(last_month).values)
    except Exception:
        return None, "UNKNOWN"

    cdf_val = kde.integrate_box_1d(-np.inf, last_val)
    cdf_val = np.clip(cdf_val, 0.001, 0.999)
    z = round(float(stats.norm.ppf(cdf_val)), 3)
    return z, _classify(z)


def classify_latest_ssfi(months: list[str], values: list[float]) -> tuple[float | None, str]:
    """Compute SSFI classification for the most recent month only (fast)."""
    if len(months) < MIN_MONTHS:
        return None, "UNKNOWN"

    index = pd.to_datetime(months)
    series = pd.Series(values, index=index, dtype=float).dropna()
    valid = series[series > 0]
    if len(valid) < MIN_MONTHS:
        return None, "UNKNOWN"

    grouped = valid.groupby(valid.index.month)
    last_month = valid.index[-1].month
    last_val = float(valid.iloc[-1])

    if last_month not in grouped.groups or len(grouped.get_group(last_month)) < MIN_PER_MONTH:
        return None, "UNKNOWN"

    group = grouped.get_group(last_month)
    try:
        a, loc, scale = stats.gamma.fit(group.values, floc=0)
        cdf_val = stats.gamma.cdf(last_val, a, loc=loc, scale=scale)
    except Exception:
        return None, "UNKNOWN"

    cdf_val = np.clip(cdf_val, 0.001, 0.999)
    z = round(float(stats.norm.ppf(cdf_val)), 3)
    return z, _classify(z)


# ---------------------------------------------------------------------------
# SPI — Standardized Precipitation Index (gamma distribution via spei package)
# ---------------------------------------------------------------------------

def compute_spi(months: list[str], values: list[float | None]) -> list[dict]:
    """Compute SPI from monthly precipitation totals."""
    return _compute_parametric_index(months, values, dist=stats.gamma, prob_zero=True, key_name="spi")


# ---------------------------------------------------------------------------
# SSFI — Standardized Streamflow Index (gamma distribution via spei package)
# ---------------------------------------------------------------------------

def compute_ssfi(months: list[str], values: list[float | None]) -> list[dict]:
    """Compute SSFI from monthly streamflow/height."""
    return _compute_parametric_index(months, values, dist=stats.gamma, prob_zero=True, key_name="ssfi")


def _compute_parametric_index(
    months: list[str],
    values: list[float | None],
    dist,
    prob_zero: bool,
    key_name: str,
) -> list[dict]:
    if len(months) < MIN_MONTHS:
        return []

    index = pd.to_datetime(months)
    series = pd.Series(values, index=index, dtype=float)

    valid = series.dropna()
    if len(valid) < MIN_MONTHS:
        return []

    # For gamma dist, values must be positive
    if dist == stats.gamma:
        valid = valid[valid > 0]
        if len(valid) < MIN_MONTHS:
            return []

    try:
        si = SI(valid, dist=dist, timescale=0, fit_freq="MS", prob_zero=prob_zero)
        si.fit_distribution()
        result = si.norm_ppf()
    except Exception:
        return []

    out = []
    for dt, idx_val in result.items():
        val = float(idx_val) if pd.notna(idx_val) else None
        raw = float(valid.get(dt, float("nan")))
        raw = raw if pd.notna(raw) else None
        out.append({
            "mois": dt.strftime("%Y-%m-%d"),
            "value": raw,
            key_name: round(val, 3) if val is not None else None,
            "classification": _classify(val),
        })

    return out
