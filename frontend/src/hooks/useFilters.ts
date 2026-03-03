import { useSearchParams } from 'react-router-dom'
import { useMemo, useCallback } from 'react'

export interface Filters {
  minObservations?: number
  lastMeasurementAfter?: string
  classification?: string[]
  codeDepartement?: string
  codeBdlisa?: string    // BDLISA N2 code (e.g. "101AC")
  codeBassin?: string    // SANDRE district code (e.g. "06")
  codeRegion?: string
  codeHer?: number       // HER-1 code
  stationCodes?: string[] // For spatial filtering (regions, HER)
}

export function useFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

const filters = useMemo<Filters>(() => ({
    minObservations: searchParams.get('min_obs') ? Number(searchParams.get('min_obs')) : undefined,
    lastMeasurementAfter: searchParams.get('last_after') ?? undefined,
    classification: searchParams.getAll('classif').length > 0 ? searchParams.getAll('classif') : undefined,
    codeDepartement: searchParams.get('dept') ?? undefined,
    codeBdlisa: searchParams.get('bdlisa') ?? undefined,
    codeBassin: searchParams.get('bassin') ?? undefined,
    codeRegion: searchParams.get('region') ?? undefined,
    codeHer: searchParams.get('her') ? Number(searchParams.get('her')) : undefined,
    stationCodes: searchParams.getAll('stations').length > 0 ? searchParams.getAll('stations') : undefined,
  }), [searchParams])

  const setFilter = useCallback((key: string, value: string | string[] | undefined) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (value === undefined) {
        next.delete(key)
      } else if (Array.isArray(value)) {
        next.delete(key)
        value.forEach(v => next.append(key, v))
      } else {
        next.set(key, value)
      }
      return next
    })
  }, [setSearchParams])

  const apiParams = useMemo(() => {
    const p: Record<string, string | string[] | undefined> = {}
    if (filters.minObservations) p.min_observations = String(filters.minObservations)
    if (filters.lastMeasurementAfter) p.last_measurement_after = filters.lastMeasurementAfter
    if (filters.classification) p.classification = filters.classification
    if (filters.codeDepartement) p.code_departement = filters.codeDepartement
    return p
  }, [filters])

  return { filters, setFilter, apiParams }
}
