import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function usePiezoMonthly(code: string) {
  return useQuery({
    queryKey: ['timeseries', 'piezo', 'monthly', code],
    queryFn: () => api.piezo.monthly(code),
    enabled: !!code,
  })
}

export function useHydroMonthly(code: string) {
  return useQuery({
    queryKey: ['timeseries', 'hydro', 'monthly', code],
    queryFn: () => api.hydro.monthly(code),
    enabled: !!code,
  })
}

export function usePiezoYearly(code: string) {
  return useQuery({
    queryKey: ['timeseries', 'piezo', 'yearly', code],
    queryFn: () => api.piezo.yearly(code),
    enabled: !!code,
  })
}

export function useHydroYearly(code: string) {
  return useQuery({
    queryKey: ['timeseries', 'hydro', 'yearly', code],
    queryFn: () => api.hydro.yearly(code),
    enabled: !!code,
  })
}

export function usePiezoDaily(code: string, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['timeseries', 'piezo', 'daily', code, startDate, endDate],
    queryFn: () => api.piezo.daily(code, { start_date: startDate, end_date: endDate }),
    enabled: !!code,
  })
}

export function useHydroDaily(code: string, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['timeseries', 'hydro', 'daily', code, startDate, endDate],
    queryFn: () => api.hydro.daily(code, { start_date: startDate, end_date: endDate }),
    enabled: !!code,
  })
}
