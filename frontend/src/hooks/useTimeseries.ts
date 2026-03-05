import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { SPIDataPoint, SPLIDataPoint, SSFIDataPoint } from '../lib/types'

export function usePiezoMonthly(code: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['timeseries', 'piezo', 'monthly', code],
    queryFn: () => api.piezo.monthly(code),
    enabled: !!code && (options?.enabled ?? true),
    staleTime: 12 * 60 * 60 * 1000, // 12h
  })
}

export function useHydroMonthly(code: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['timeseries', 'hydro', 'monthly', code],
    queryFn: () => api.hydro.monthly(code),
    enabled: !!code && (options?.enabled ?? true),
    staleTime: 12 * 60 * 60 * 1000, // 12h
  })
}

export function usePiezoYearly(code: string) {
  return useQuery({
    queryKey: ['timeseries', 'piezo', 'yearly', code],
    queryFn: () => api.piezo.yearly(code),
    enabled: !!code,
    staleTime: 24 * 60 * 60 * 1000, // 24h
  })
}

export function useHydroYearly(code: string) {
  return useQuery({
    queryKey: ['timeseries', 'hydro', 'yearly', code],
    queryFn: () => api.hydro.yearly(code),
    enabled: !!code,
    staleTime: 24 * 60 * 60 * 1000, // 24h
  })
}

export function usePiezoDaily(code: string, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['timeseries', 'piezo', 'daily', code, startDate, endDate],
    queryFn: () => api.piezo.daily(code, { start_date: startDate, end_date: endDate }),
    enabled: !!code,
    staleTime: 6 * 60 * 60 * 1000, // 6h
  })
}

export function useHydroDaily(code: string, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['timeseries', 'hydro', 'daily', code, startDate, endDate],
    queryFn: () => api.hydro.daily(code, { start_date: startDate, end_date: endDate }),
    enabled: !!code,
    staleTime: 6 * 60 * 60 * 1000, // 6h
  })
}

export function usePiezoSPLI(code: string) {
  return useQuery<SPLIDataPoint[]>({
    queryKey: ['drought', 'piezo', 'spli', code],
    queryFn: () => api.piezo.spli(code),
    enabled: !!code,
    staleTime: 24 * 60 * 60 * 1000,
  })
}

export function useHydroSSFI(code: string) {
  return useQuery<SSFIDataPoint[]>({
    queryKey: ['drought', 'hydro', 'ssfi', code],
    queryFn: () => api.hydro.ssfi(code),
    enabled: !!code,
    staleTime: 24 * 60 * 60 * 1000,
  })
}

export function useSPI(code: string, type: 'piezo' | 'hydro') {
  return useQuery<SPIDataPoint[]>({
    queryKey: ['drought', type, 'spi', code],
    queryFn: () => type === 'piezo' ? api.piezo.spi(code) : api.hydro.spi(code),
    enabled: !!code,
    staleTime: 24 * 60 * 60 * 1000,
  })
}
