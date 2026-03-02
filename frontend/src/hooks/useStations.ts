import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function usePiezoStations(filters?: Record<string, string | string[] | undefined>) {
  return useQuery({
    queryKey: ['stations', 'piezo', filters],
    queryFn: () => api.stations.piezo(filters),
  })
}

export function useHydroStations(filters?: Record<string, string | string[] | undefined>) {
  return useQuery({
    queryKey: ['stations', 'hydro', filters],
    queryFn: () => api.stations.hydro(filters),
  })
}

export function usePiezoStationDetail(code: string) {
  return useQuery({
    queryKey: ['station', 'piezo', code],
    queryFn: () => api.stations.piezoDetail(code),
    enabled: !!code,
  })
}

export function useHydroStationDetail(code: string) {
  return useQuery({
    queryKey: ['station', 'hydro', code],
    queryFn: () => api.stations.hydroDetail(code),
    enabled: !!code,
  })
}
