import { useSearchParams } from 'react-router-dom'
import { useMemo, useCallback, useEffect, useRef } from 'react'

const STORAGE_KEY = 'juno_filters'

/** Persist filter params to sessionStorage */
function saveToStorage(params: URLSearchParams) {
  const str = params.toString()
  if (str) {
    sessionStorage.setItem(STORAGE_KEY, str)
  } else {
    sessionStorage.removeItem(STORAGE_KEY)
  }
}

/** Restore filter params from sessionStorage (only relevant keys) */
function restoreFromStorage(): URLSearchParams | null {
  const saved = sessionStorage.getItem(STORAGE_KEY)
  return saved ? new URLSearchParams(saved) : null
}

export interface Filters {
  activeOnly?: boolean
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
  const restored = useRef(false)

  // On mount: if URL has no filter params, restore from sessionStorage
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    if (searchParams.toString() === '') {
      const saved = restoreFromStorage()
      if (saved && saved.toString() !== '') {
        setSearchParams(saved, { replace: true })
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist to sessionStorage whenever params change
  useEffect(() => {
    saveToStorage(searchParams)
  }, [searchParams])

const filters = useMemo<Filters>(() => ({
    activeOnly: searchParams.get('active_only') === 'true' ? true : undefined,
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
