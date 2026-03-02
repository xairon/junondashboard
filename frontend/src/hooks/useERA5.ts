import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useERA5Grid() {
  return useQuery({
    queryKey: ['era5', 'grid'],
    queryFn: () => api.era5.grid(),
    staleTime: 24 * 60 * 60 * 1000,
  })
}

export function useERA5Snapshot(date: string | undefined) {
  return useQuery({
    queryKey: ['era5', 'snapshot', date],
    queryFn: () => api.era5.snapshot(date!),
    enabled: !!date,
    staleTime: 24 * 60 * 60 * 1000,
  })
}

export function useERA5Dates() {
  return useQuery({
    queryKey: ['era5', 'dates'],
    queryFn: () => api.era5.dates(),
    staleTime: 24 * 60 * 60 * 1000,
  })
}

export function useERA5Monthly(month: string | undefined) {
  return useQuery({
    queryKey: ['era5', 'monthly', month],
    queryFn: () => api.era5.monthly(month!),
    enabled: !!month,
    staleTime: 24 * 60 * 60 * 1000,
  })
}
