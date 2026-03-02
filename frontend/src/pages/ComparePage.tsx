import { useState, useMemo } from 'react'
import { X, Search } from 'lucide-react'
import { useQueries } from '@tanstack/react-query'
import { usePiezoStations, useHydroStations } from '../hooks/useStations'
import { api } from '../lib/api'
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
  const [selected, setSelected] = useState<SelectedStation[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [normalized, setNormalized] = useState(false)

  const { data: piezoStations } = usePiezoStations()
  const { data: hydroStations } = useHydroStations()

  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return []
    const q = searchQuery.toLowerCase()
    const piezo = (piezoStations ?? [])
      .filter((s: any) => (s.nom_commune || s.code_bss || '').toLowerCase().includes(q))
      .slice(0, 3)
      .map((s: any) => ({ code: s.code_bss, name: s.nom_commune || s.code_bss, type: 'piezo' as const }))
    const hydro = (hydroStations ?? [])
      .filter((s: any) => (s.libelle_station || s.code_station || '').toLowerCase().includes(q))
      .slice(0, 3)
      .map((s: any) => ({ code: s.code_station, name: s.libelle_station || s.code_station, type: 'hydro' as const }))
    return [...piezo, ...hydro].filter(s => !selected.some(sel => sel.code === s.code))
  }, [searchQuery, piezoStations, hydroStations, selected])

  // Fetch monthly data for each selected station
  const queries = useQueries({
    queries: selected.map((s) => ({
      queryKey: ['compare', s.type, 'monthly', s.code],
      queryFn: () => s.type === 'piezo' ? api.timeseries.piezoMonthly(s.code) : api.timeseries.hydroMonthly(s.code),
      enabled: !!s.code,
    })),
  })

  // Merge data for chart
  const chartData = useMemo(() => {
    if (!queries.length || queries.some(q => !q.data)) return []

    const allDates = new Set<string>()
    queries.forEach((q) => {
      q.data?.forEach((d: any) => allDates.add(d.mois))
    })

    const sorted = Array.from(allDates).sort()

    // Compute z-scores if normalized
    const stats = queries.map((q, i) => {
      const values = (q.data ?? [])
        .map((d: any) => selected[i].type === 'piezo' ? d.niveau_moyen : d.resultat_moyen)
        .filter((v: any) => v != null) as number[]
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1
      return { mean, std }
    })

    return sorted.map((date) => {
      const row: any = { mois: date }
      queries.forEach((q, i) => {
        const point = q.data?.find((d: any) => d.mois === date)
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
              key={s.code}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border"
              style={{ borderColor: COLORS[i], color: COLORS[i], backgroundColor: `${COLORS[i]}15` }}
            >
              <span className="uppercase text-[10px] opacity-70">{s.type}</span>
              {s.name}
              <button onClick={() => setSelected(selected.filter((_, j) => j !== i))}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {selected.length < 5 && (
            <div className="relative">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-card border border-white/10 rounded-full">
                <Search className="w-3.5 h-3.5 text-text-secondary" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ajouter..."
                  className="bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none w-32"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="absolute top-full mt-1 left-0 bg-bg-card border border-white/10 rounded-lg overflow-hidden shadow-xl z-10 w-64">
                  {searchResults.map((s) => (
                    <button
                      key={s.code}
                      onClick={() => { setSelected([...selected, s]); setSearchQuery('') }}
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${!normalized ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-text-secondary'}`}
            >
              Valeurs brutes
            </button>
            <button
              onClick={() => setNormalized(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${normalized ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-text-secondary'}`}
            >
              Normalise (z-score)
            </button>
          </div>
        )}

        {/* Chart */}
        {chartData.length > 0 && (
          <div className="bg-bg-card border border-white/5 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-text-primary mb-3">
              {normalized ? 'Valeurs normalisees (z-score)' : 'Series superposees'}
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
                  contentStyle={{
                    backgroundColor: '#111827',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {selected.map((s, i) => (
                  <Line
                    key={s.code}
                    type="monotone"
                    dataKey={s.code}
                    stroke={COLORS[i]}
                    strokeWidth={1.5}
                    dot={false}
                    name={s.name}
                    connectNulls
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {selected.length === 0 && (
          <div className="flex items-center justify-center h-64 text-text-secondary text-sm">
            Selectionnez des stations pour les comparer
          </div>
        )}
      </div>
    </div>
  )
}
