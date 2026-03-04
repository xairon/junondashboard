import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X, Search, Loader2 } from 'lucide-react'
import { useQueries } from '@tanstack/react-query'
import { usePiezoStations, useHydroStations } from '../hooks/useStations'
import { api } from '../lib/api'
import { CHART_TOOLTIP_STYLE } from '../lib/types'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

const COLORS = ['#06b6d4', '#6366f1', '#f97316', '#10b981', '#ef4444']

interface SelectedStation {
  code: string
  name: string
  type: 'piezo' | 'hydro'
}

export default function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [normalized, setNormalized] = useState(true)
  const searchRef = useRef<HTMLDivElement>(null)

  const { data: piezoStations } = usePiezoStations()
  const { data: hydroStations } = useHydroStations()

  // Click-outside handler for search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Derive selected stations from URL params
  const selected = useMemo<SelectedStation[]>(() => {
    const stationsParam = searchParams.get('stations')
    const typesParam = searchParams.get('type')
    if (!stationsParam) return []
    const codes = stationsParam.split(',').filter(Boolean)
    const types = typesParam ? typesParam.split(',').filter(Boolean) : []
    return codes.map((code, i) => {
      const type = (types[i] as 'piezo' | 'hydro') || 'piezo'
      // Try to find name from loaded stations
      let name = code
      if (type === 'piezo' && piezoStations) {
        const found = piezoStations.find((s: any) => s.code_bss === code)
        if (found) name = found.nom_commune || code
      } else if (type === 'hydro' && hydroStations) {
        const found = hydroStations.find((s: any) => s.code_station === code)
        if (found) name = found.libelle_station || code
      }
      return { code, name, type }
    })
  }, [searchParams, piezoStations, hydroStations])

  // Auto-enable normalization for mixed types
  useEffect(() => {
    const hasPiezo = selected.some(s => s.type === 'piezo')
    const hasHydro = selected.some(s => s.type === 'hydro')
    if (hasPiezo && hasHydro && !normalized) {
      setNormalized(true)
    }
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update URL when selection changes
  const updateUrl = useCallback((newSelected: SelectedStation[]) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (newSelected.length === 0) {
        next.delete('stations')
        next.delete('type')
      } else {
        next.set('stations', newSelected.map(s => s.code).join(','))
        next.set('type', newSelected.map(s => s.type).join(','))
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

  const addStation = useCallback((s: SelectedStation) => {
    const newSelected = [...selected, s]
    updateUrl(newSelected)
    setSearchQuery('')
  }, [selected, updateUrl])

  const removeStation = useCallback((index: number) => {
    const newSelected = selected.filter((_, j) => j !== index)
    updateUrl(newSelected)
  }, [selected, updateUrl])

  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return []
    const q = searchQuery.toLowerCase()
    const piezo = (piezoStations ?? [])
      .filter((s: any) => (s.nom_commune || s.code_bss || '').toLowerCase().includes(q) || (s.code_bss || '').toLowerCase().includes(q))
      .slice(0, 3)
      .map((s: any) => ({ code: s.code_bss, name: s.nom_commune || s.code_bss, type: 'piezo' as const }))
    const hydro = (hydroStations ?? [])
      .filter((s: any) => (s.libelle_station || s.code_station || '').toLowerCase().includes(q) || (s.code_station || '').toLowerCase().includes(q))
      .slice(0, 3)
      .map((s: any) => ({ code: s.code_station, name: s.libelle_station || s.code_station, type: 'hydro' as const }))
    return [...piezo, ...hydro].filter(s => !selected.some(sel => sel.code === s.code && sel.type === s.type))
  }, [searchQuery, piezoStations, hydroStations, selected])

  // Fetch monthly data for each selected station
  const queries = useQueries({
    queries: selected.map((s) => ({
      queryKey: ['compare', s.type, 'monthly', s.code],
      queryFn: () => s.type === 'piezo' ? api.piezo.monthly(s.code) : api.hydro.monthly(s.code),
      enabled: !!s.code,
    })),
  })

  // Merge data for chart - optimized with Map lookup
  const chartData = useMemo(() => {
    const ready = queries.filter(q => !!q.data)
    if (!ready.length) return []

    // Build O(1) lookup maps
    const dataMaps = queries.map(q => {
      const map = new Map<string, any>()
      q.data?.forEach((d: any) => map.set(d.mois, d))
      return map
    })

    const allDates = new Set<string>()
    ready.forEach((q) => {
      q.data?.forEach((d: any) => allDates.add(d.mois))
    })

    const sorted = Array.from(allDates).sort()

    // Compute z-scores if normalized (only from ready queries)
    const stats = queries.map((q, i) => {
      const values = (q.data ?? [])
        .map((d: any) => selected[i].type === 'piezo' ? d.niveau_moyen : d.resultat_moyen)
        .filter((v: any) => v != null) as number[]
      if (!values.length) return { mean: 0, std: 1 }
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1
      return { mean, std }
    })

    return sorted.map((date) => {
      const row: any = { mois: date }
      queries.forEach((q, i) => {
        if (!q.data) return
        const point = dataMaps[i].get(date)
        const key = selected[i].type === 'piezo' ? 'niveau_moyen' : 'resultat_moyen'
        let value = point?.[key] ?? null
        if (value != null && normalized) {
          value = (value - stats[i].mean) / stats[i].std
        }
        row[selected[i].code] = value
      })
      return row
    })
  }, [queries, selected, normalized])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <h1 className="text-xl font-bold text-text-primary">Comparer des stations</h1>

        {/* Station selector */}
        <div className="flex flex-wrap items-center gap-2">
          {selected.map((s, i) => (
            <span
              key={`${s.type}-${s.code}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border"
              style={{ borderColor: COLORS[i], color: COLORS[i], backgroundColor: `${COLORS[i]}15` }}
            >
              <span className="uppercase text-[10px] opacity-70">{s.type}</span>
              {s.name}
              {/* Per-station loading indicator */}
              {queries[i]?.isLoading && (
                <Loader2 className="w-3 h-3 animate-spin" />
              )}
              {queries[i]?.isError && (
                <span className="text-red-400 text-[10px]" title="Erreur de chargement" role="alert">!</span>
              )}
              <button onClick={() => removeStation(i)} aria-label={`Retirer ${s.name}`}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {selected.length < 5 && (
            <div className="relative" ref={searchRef}>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-card border border-white/10 rounded-full">
                <Search className="w-3.5 h-3.5 text-text-secondary" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ajouter..."
                  className="bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none w-32"
                  aria-label="Rechercher une station à comparer"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="absolute top-full mt-1 left-0 bg-bg-card border border-white/10 rounded-lg overflow-hidden shadow-xl z-10 w-64">
                  {searchResults.map((s) => (
                    <button
                      key={`${s.type}-${s.code}`}
                      onClick={() => addStation(s)}
                      className="w-full text-left px-3 py-2 hover:bg-bg-hover text-sm text-text-primary flex items-center gap-2 border-b border-white/5 last:border-0"
                    >
                      <span className={`text-[10px] px-1 py-0.5 rounded ${s.type === 'piezo' ? 'bg-accent-cyan/20 text-accent-cyan' : 'bg-accent-indigo/20 text-accent-indigo'}`}>
                        {s.type.toUpperCase()}
                      </span>
                      <span className="truncate">{s.name}</span>
                      <span className="text-xs text-text-secondary ml-auto">{s.code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Toggle */}
        {selected.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => setNormalized(false)}
              aria-label="Afficher valeurs brutes"
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${!normalized ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-text-secondary'}`}
            >
              Valeurs brutes
            </button>
            <button
              onClick={() => setNormalized(true)}
              aria-label="Afficher valeurs normalisées"
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${normalized ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-text-secondary'}`}
            >
              Normalisé (z-score)
            </button>
          </div>
        )}

        {/* Per-station loading summary */}
        {selected.length > 0 && queries.some(q => q.isLoading) && (
          <div className="flex items-center gap-3 flex-wrap">
            {selected.map((s, i) => (
              queries[i]?.isLoading && (
                <div key={s.code} className="flex items-center gap-1.5 text-text-secondary text-xs">
                  <Loader2 className="w-3 h-3 animate-spin" style={{ color: COLORS[i] }} />
                  <span>Chargement {s.name}...</span>
                </div>
              )
            ))}
          </div>
        )}

        {/* Chart */}
        {chartData.length > 0 && (
          <div className="bg-bg-card border border-white/5 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-text-primary mb-3">
              {normalized ? 'Valeurs normalisées (z-score)' : 'Séries superposées'}
            </h3>
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="mois"
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  stroke="transparent"
                  tickFormatter={(v: string) => {
                    const d = new Date(v)
                    return `${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`
                  }}
                />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} stroke="transparent" />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {selected.map((s, i) => (
                  <Line
                    key={`${s.type}-${s.code}`}
                    type="monotone"
                    dataKey={s.code}
                    stroke={COLORS[i]}
                    strokeWidth={1.5}
                    dot={false}
                    name={s.name}
                    connectNulls={false}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {selected.length === 0 && (
          <div className="flex items-center justify-center h-64 text-text-secondary text-sm">
            Sélectionnez des stations pour les comparer
          </div>
        )}
      </div>
    </div>
  )
}
