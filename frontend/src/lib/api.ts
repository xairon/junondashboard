import { API_BASE } from './constants'
import type {
  PiezoStation, HydroStation, NationalStats, DepartmentStats,
  Alert, ERA5GridPoint,
  DailyPiezoMeasurement, DailyHydroMeasurement,
  MonthlyPiezoData, MonthlyHydroData,
  YearlyPiezoData, YearlyHydroData,
  PiezoTrend, HydroTrend,
  StationPercentiles,
  StationGeoJSON, ClassificationTimeline,
  SPIDataPoint, SPLIDataPoint, SSFIDataPoint,
  PiezoBasinSiblings, HydroSiteSiblings,
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
  piezo: {
    stations: (params?: Record<string, string | string[] | undefined>) =>
      fetchJson<PiezoStation[]>('/piezo/stations', params),
    detail: (code: string) => fetchJson<PiezoStation>(`/piezo/stations/${code}`),
    percentiles: (code: string) =>
      fetchJson<StationPercentiles>(`/piezo/stations/${encodeURIComponent(code)}/percentiles`),
    daily: (code: string, params?: Record<string, string | undefined>) =>
      fetchJson<DailyPiezoMeasurement[]>(`/piezo/stations/${code}/daily`, params),
    monthly: (code: string) => fetchJson<MonthlyPiezoData[]>(`/piezo/stations/${code}/monthly`),
    yearly: (code: string) => fetchJson<YearlyPiezoData[]>(`/piezo/stations/${code}/yearly`),
    trends: (params?: Record<string, string | undefined>) => fetchJson<PiezoTrend[]>('/piezo/trends', params),
    spli: (code: string) => fetchJson<SPLIDataPoint[]>(`/piezo/stations/${code}/spli`),
    spi: (code: string) => fetchJson<SPIDataPoint[]>(`/piezo/stations/${code}/spi`),
    siblings: (code: string) => fetchJson<PiezoBasinSiblings>(`/piezo/stations/${encodeURIComponent(code)}/siblings`),
  },
  hydro: {
    stations: (params?: Record<string, string | string[] | undefined>) =>
      fetchJson<HydroStation[]>('/hydro/stations', params),
    detail: (code: string) => fetchJson<HydroStation>(`/hydro/stations/${code}`),
    percentiles: (code: string) =>
      fetchJson<StationPercentiles>(`/hydro/stations/${encodeURIComponent(code)}/percentiles`),
    daily: (code: string, params?: Record<string, string | undefined>) =>
      fetchJson<DailyHydroMeasurement[]>(`/hydro/stations/${code}/daily`, params),
    monthly: (code: string) => fetchJson<MonthlyHydroData[]>(`/hydro/stations/${code}/monthly`),
    yearly: (code: string) => fetchJson<YearlyHydroData[]>(`/hydro/stations/${code}/yearly`),
    trends: (params?: Record<string, string | undefined>) => fetchJson<HydroTrend[]>('/hydro/trends', params),
    ssfi: (code: string) => fetchJson<SSFIDataPoint[]>(`/hydro/stations/${code}/ssfi`),
    spi: (code: string) => fetchJson<SPIDataPoint[]>(`/hydro/stations/${code}/spi`),
    siblings: (code: string) => fetchJson<HydroSiteSiblings>(`/hydro/stations/${code}/siblings`),
  },
  common: {
    geojson: (stationType?: 'piezo' | 'hydro' | 'all') =>
      fetchJson<StationGeoJSON>('/common/stations/geojson', stationType ? { type: stationType } : undefined),
    alerts: (params?: Record<string, string | string[] | undefined>) =>
      fetchJson<Alert[]>('/common/alerts', params),
    statsNational: () => fetchJson<NationalStats>('/common/stats/national'),
    statsDepartments: () => fetchJson<DepartmentStats[]>('/common/stats/departments'),
    classificationTimeline: () => fetchJson<ClassificationTimeline>('/common/classifications/timeline'),
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
