import { useState, useMemo } from 'react'
import { Filter, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import { CLASSIFICATION_ORDER, CLASSIFICATION_LABELS, CLASSIFICATION_COLORS } from '../../lib/constants'
import type { Filters } from '../../hooks/useFilters'

interface Props {
  filters: Filters
  setFilter: (key: string, value: string | string[] | undefined) => void
  totalCount?: number
  filteredCount?: number
}

export function GlobalFilters({ filters, setFilter, totalCount, filteredCount }: Props) {
  const [expanded, setExpanded] = useState(false)

  const hasActiveFilter = useMemo(() => {
    return (
      filters.minObservations != null ||
      filters.lastMeasurementAfter != null ||
      (filters.classification != null && filters.classification.length > 0) ||
      filters.codeDepartement != null
    )
  }, [filters])

  const resetFilters = () => {
    setFilter('min_obs', undefined)
    setFilter('last_after', undefined)
    setFilter('classif', undefined)
    setFilter('dept', undefined)
  }

  return (
    <div className="absolute top-4 right-4 z-10">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-label="Ouvrir les filtres"
        aria-expanded={expanded}
        className="flex items-center gap-2 px-3 py-2 bg-bg-card/90 backdrop-blur-md border border-white/10 rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        <Filter className="w-4 h-4" />
        <span className="hidden sm:inline">Filtres</span>
        {filteredCount != null && totalCount != null && (
          <span className="text-xs font-mono text-accent-cyan">
            {filteredCount.toLocaleString('fr-FR')}/{totalCount.toLocaleString('fr-FR')}
          </span>
        )}
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="mt-1 bg-bg-card/95 backdrop-blur-md border border-white/10 rounded-lg p-4 w-72 shadow-xl">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-text-secondary block mb-1">Observations min (jours)</label>
              <input
                type="number"
                value={filters.minObservations ?? ''}
                onChange={(e) => setFilter('min_obs', e.target.value || undefined)}
                placeholder="500"
                className="w-full px-2.5 py-1.5 bg-bg-primary border border-white/10 rounded text-sm text-text-primary focus:outline-none focus:border-accent-cyan/50"
              />
            </div>

            <div>
              <label className="text-xs text-text-secondary block mb-1">Derniere mesure apres</label>
              <input
                type="date"
                value={filters.lastMeasurementAfter ?? ''}
                onChange={(e) => setFilter('last_after', e.target.value || undefined)}
                className="w-full px-2.5 py-1.5 bg-bg-primary border border-white/10 rounded text-sm text-text-primary focus:outline-none focus:border-accent-cyan/50"
              />
            </div>

            <div>
              <label className="text-xs text-text-secondary block mb-2">Classification</label>
              <div className="flex flex-wrap gap-1.5">
                {CLASSIFICATION_ORDER.map((cls) => {
                  const active = filters.classification?.includes(cls) ?? false
                  const color = CLASSIFICATION_COLORS[cls]
                  return (
                    <button
                      key={cls}
                      onClick={() => {
                        const current = filters.classification ?? []
                        const next = active
                          ? current.filter(c => c !== cls)
                          : [...current, cls]
                        setFilter('classif', next.length > 0 ? next : undefined)
                      }}
                      aria-label={`Filtrer classification ${CLASSIFICATION_LABELS[cls]}`}
                      aria-pressed={active}
                      className="px-2 py-1 rounded text-xs font-medium transition-colors border"
                      style={{
                        backgroundColor: active ? `${color}30` : 'transparent',
                        borderColor: active ? color : 'rgba(255,255,255,0.1)',
                        color: active ? color : '#9ca3af',
                      }}
                    >
                      {CLASSIFICATION_LABELS[cls]}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="text-xs text-text-secondary block mb-1">Departement</label>
              <input
                type="text"
                value={filters.codeDepartement ?? ''}
                onChange={(e) => setFilter('dept', e.target.value || undefined)}
                placeholder="ex: 75"
                className="w-full px-2.5 py-1.5 bg-bg-primary border border-white/10 rounded text-sm text-text-primary focus:outline-none focus:border-accent-cyan/50"
              />
            </div>

            {hasActiveFilter && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1.5 w-full justify-center px-3 py-2 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reinitialiser
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
