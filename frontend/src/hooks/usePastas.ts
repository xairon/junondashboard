import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function usePastasSummary(code: string) {
  return useQuery({
    queryKey: ['pastas', 'summary', code],
    queryFn: () => api.pastas.summary(code),
    enabled: !!code,
    staleTime: 24 * 60 * 60 * 1000, // 24h
    retry: false, // 404 = no model, don't retry
  })
}

export function usePastasTimeseries(
  code: string,
  resolution: 'monthly' | 'daily' = 'monthly',
  start?: string,
  end?: string,
) {
  return useQuery({
    queryKey: ['pastas', 'timeseries', code, resolution, start, end],
    queryFn: () => api.pastas.timeseries(code, {
      resolution,
      start,
      end,
    }),
    enabled: !!code,
    staleTime: 6 * 60 * 60 * 1000, // 6h
    retry: false,
  })
}

export function usePastasSGI(code: string) {
  return useQuery({
    queryKey: ['pastas', 'sgi', code],
    queryFn: () => api.pastas.sgi(code),
    enabled: !!code,
    staleTime: 12 * 60 * 60 * 1000, // 12h
    retry: false,
  })
}

export function usePastasCoverage() {
  return useQuery({
    queryKey: ['pastas', 'coverage'],
    queryFn: () => api.pastas.coverage(),
    staleTime: 24 * 60 * 60 * 1000, // 24h
  })
}
