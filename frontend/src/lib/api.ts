import { API_BASE } from './constants'

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
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export const api = {
  stations: {
    piezo: (params?: Record<string, string | string[] | undefined>) =>
      fetchJson<any[]>('/stations/piezo', params),
    hydro: (params?: Record<string, string | string[] | undefined>) =>
      fetchJson<any[]>('/stations/hydro', params),
    piezoDetail: (code: string) => fetchJson<any>(`/stations/piezo/${code}`),
    hydroDetail: (code: string) => fetchJson<any>(`/stations/hydro/${code}`),
  },
  timeseries: {
    piezoDaily: (code: string, params?: Record<string, string | undefined>) =>
      fetchJson<any[]>(`/timeseries/piezo/${code}/daily`, params),
    hydroDaily: (code: string, params?: Record<string, string | undefined>) =>
      fetchJson<any[]>(`/timeseries/hydro/${code}/daily`, params),
    piezoMonthly: (code: string) => fetchJson<any[]>(`/timeseries/piezo/${code}/monthly`),
    hydroMonthly: (code: string) => fetchJson<any[]>(`/timeseries/hydro/${code}/monthly`),
    piezoYearly: (code: string) => fetchJson<any[]>(`/timeseries/piezo/${code}/yearly`),
    hydroYearly: (code: string) => fetchJson<any[]>(`/timeseries/hydro/${code}/yearly`),
  },
  trends: {
    piezo: (params?: Record<string, string | undefined>) => fetchJson<any[]>('/trends/piezo', params),
    hydro: (params?: Record<string, string | undefined>) => fetchJson<any[]>('/trends/hydro', params),
  },
  stats: {
    national: () => fetchJson<any>('/stats/national'),
    departments: () => fetchJson<any[]>('/stats/departments'),
  },
  era5: {
    grid: () => fetchJson<any[]>('/era5/grid'),
    snapshot: (date: string) => fetchJson<any[]>('/era5/snapshot', { date }),
    dates: () => fetchJson<string[]>('/era5/dates'),
    monthly: (month: string) => fetchJson<any[]>('/era5/monthly', { month }),
  },
}
