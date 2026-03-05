import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function usePiezoStations(filters?: Record<string, string | string[] | undefined>) {
  return useQuery({
    queryKey: ['stations', 'piezo', filters],
    queryFn: () => api.piezo.stations(filters),
  })
}

export function useHydroStations(filters?: Record<string, string | string[] | undefined>) {
  return useQuery({
    queryKey: ['stations', 'hydro', filters],
    queryFn: () => api.hydro.stations(filters),
  })
}

export function usePiezoStationDetail(code: string) {
  return useQuery({
    queryKey: ['station', 'piezo', code],
    queryFn: () => api.piezo.detail(code),
    enabled: !!code,
  })
}

export function useHydroStationDetail(code: string) {
  return useQuery({
    queryKey: ['station', 'hydro', code],
    queryFn: () => api.hydro.detail(code),
    enabled: !!code,
  })
}

export function useStationsGeoJSON() {
  return useQuery({
    queryKey: ['stations', 'geojson'],
    queryFn: () => api.common.geojson(),
    staleTime: 3_600_000, // 1h — matches backend Redis TTL
  })
}

export function usePiezoSiblings(code: string) {
  return useQuery({
    queryKey: ['siblings', 'piezo', code],
    queryFn: () => api.piezo.siblings(code),
    enabled: !!code,
    staleTime: 3_600_000,
    retry: false,
  })
}

export function useHydroSiblings(code: string) {
  return useQuery({
    queryKey: ['siblings', 'hydro', code],
    queryFn: () => api.hydro.siblings(code),
    enabled: !!code,
    staleTime: 3_600_000,
    retry: false,
  })
}

export function useBdlisaLookup() {
  const { data } = useQuery({
    queryKey: ['bdlisa-geojson'],
    queryFn: (): Promise<{ features: Array<{ properties: { code: string; nom: string; nature: string } }> }> =>
      fetch('/geo/bdlisa.geojson').then(r => r.json()),
    staleTime: Infinity,
  })

  const lookup = useCallback((codesBdlisa: string | null | undefined): { nature: string } | null => {
    if (!codesBdlisa || !data?.features?.length) return null
    const feat = data.features.find(f => {
      const fCode = f.properties?.code ?? ''
      return fCode.length >= 3 && codesBdlisa.startsWith(fCode)
    })
    if (!feat) return null
    return { nature: feat.properties?.nature ?? '' }
  }, [data])

  return lookup
}
