import { API_BASE } from './constants'
import type {
  PiezoStation, HydroStation, NationalStats, DepartmentStats,
  Alert, ERA5GridPoint,
  DailyPiezoMeasurement, DailyHydroMeasurement,
  MonthlyPiezoData, MonthlyHydroData,
  YearlyPiezoData, YearlyHydroData,
  StationPercentiles,
  StationGeoJSON
} from './types'

async function fetchJson<T>(path: string, params?: Record<string, string | string[] | undefined>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined) return
      if (Array.isArray(v)) {
        v.forEach(val => url.searchParams.append(k, val))
      } else {
        url.searchParams.set(k, v)
      }
    })
  }
  const res = await fetch(url.toString())
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {}
    throw new Error(`API ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return res.json()
}

export const api = {
  stations: {
    piezo: (params?: Record<string, string | string[] | undefined>) =>
      fetchJson<PiezoStation[]>('/stations/piezo', params),
    hydro: (params?: Record<string, string | string[] | undefined>) =>
      fetchJson<HydroStation[]>('/stations/hydro', params),
    piezoDetail: (code: string) => fetchJson<PiezoStation>(`/stations/piezo/${code}`),
    hydroDetail: (code: string) => fetchJson<HydroStation>(`/stations/hydro/${code}`),
    piezoPercentiles: (code: string) =>
      fetchJson<StationPercentiles>(`/stations/piezo/${encodeURIComponent(code)}/percentiles`),
    hydroPercentiles: (code: string) =>
      fetchJson<StationPercentiles>(`/stations/hydro/${encodeURIComponent(code)}/percentiles`),
    geojson: (stationType?: 'piezo' | 'hydro' | 'all') =>
      fetchJson<StationGeoJSON>('/stations/geojson', stationType ? { type: stationType } : undefined),
  },
  timeseries: {
    piezoDaily: (code: string, params?: Record<string, string | undefined>) =>
      fetchJson<DailyPiezoMeasurement[]>(`/timeseries/piezo/${code}/daily`, params),
    hydroDaily: (code: string, params?: Record<string, string | undefined>) =>
      fetchJson<DailyHydroMeasurement[]>(`/timeseries/hydro/${code}/daily`, params),
    piezoMonthly: (code: string) => fetchJson<MonthlyPiezoData[]>(`/timeseries/piezo/${code}/monthly`),
    hydroMonthly: (code: string) => fetchJson<MonthlyHydroData[]>(`/timeseries/hydro/${code}/monthly`),
    piezoYearly: (code: string) => fetchJson<YearlyPiezoData[]>(`/timeseries/piezo/${code}/yearly`),
    hydroYearly: (code: string) => fetchJson<YearlyHydroData[]>(`/timeseries/hydro/${code}/yearly`),
  },
  trends: {
    piezo: (params?: Record<string, string | undefined>) => fetchJson<PiezoStation[]>('/trends/piezo', params),
    hydro: (params?: Record<string, string | undefined>) => fetchJson<HydroStation[]>('/trends/hydro', params),
  },
  stats: {
    national: () => fetchJson<NationalStats>('/stats/national'),
    departments: () => fetchJson<DepartmentStats[]>('/stats/departments'),
  },
  alerts: {
    list: (params?: Record<string, string | string[] | undefined>) =>
      fetchJson<Alert[]>('/alerts', params),
  },
  era5: {
    grid: () => fetchJson<ERA5GridPoint[]>('/era5/grid'),
    snapshot: (date: string) => fetchJson<ERA5GridPoint[]>('/era5/snapshot', { date }),
    dates: () => fetchJson<string[]>('/era5/dates'),
    monthly: (month: string) => fetchJson<ERA5GridPoint[]>('/era5/monthly', { month }),
  },
  wfs: {
    layer: (layerId: string, bbox?: string) =>
      fetchJson<any>(`/wfs/${layerId}`, bbox ? { bbox } : undefined),
  },
}
