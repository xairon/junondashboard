import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function usePiezoMonthly(code: string) {
  return useQuery({
    queryKey: ['timeseries', 'piezo', 'monthly', code],
    queryFn: () => api.timeseries.piezoMonthly(code),
    enabled: !!code,
  })
}

export function useHydroMonthly(code: string) {
  return useQuery({
    queryKey: ['timeseries', 'hydro', 'monthly', code],
    queryFn: () => api.timeseries.hydroMonthly(code),
    enabled: !!code,
  })
}

export function usePiezoYearly(code: string) {
  return useQuery({
    queryKey: ['timeseries', 'piezo', 'yearly', code],
    queryFn: () => api.timeseries.piezoYearly(code),
    enabled: !!code,
  })
}

export function useHydroYearly(code: string) {
  return useQuery({
    queryKey: ['timeseries', 'hydro', 'yearly', code],
    queryFn: () => api.timeseries.hydroYearly(code),
    enabled: !!code,
  })
}

export function usePiezoDaily(code: string, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['timeseries', 'piezo', 'daily', code, startDate, endDate],
    queryFn: () => api.timeseries.piezoDaily(code, { start_date: startDate, end_date: endDate }),
    enabled: !!code,
  })
}

export function useHydroDaily(code: string, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['timeseries', 'hydro', 'daily', code, startDate, endDate],
    queryFn: () => api.timeseries.hydroDaily(code, { start_date: startDate, end_date: endDate }),
    enabled: !!code,
  })
}
