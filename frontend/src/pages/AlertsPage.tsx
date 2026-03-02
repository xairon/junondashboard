import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Download, AlertTriangle, MapPin } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { ClassificationBadge } from '../components/station/ClassificationBadge'
import { CLASSIFICATION_COLORS } from '../lib/constants'
import { formatDate } from '../lib/utils'
import type { Alert } from '../lib/types'

const PAGE_SIZE = 50

const escapeCSV = (v: string | null | undefined): string => {
  const s = String(v ?? '')
  const needsQuote = s.includes(',') || s.includes('"') || s.includes('\n') || /^[=+\-@]/.test(s)
  return needsQuote ? `"${s.replace(/"/g, '""')}"` : s
}

type SortKey = 'name' | 'dept' | 'classification' | 'derniere_mesure'
type SortDir = 'asc' | 'desc'

const SEVERITY_OPTIONS = ['TRES_BAS', 'BAS', 'HAUT', 'TRES_HAUT'] as const

export default function AlertsPage() {
  const [page, setPage] = useState(0)
  const [severityFilter, setSeverityFilter] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const { data: alerts, isLoading, isError } = useQuery({
    queryKey: ['alerts', severityFilter],
    queryFn: () => api.alerts.list(severityFilter.length > 0 ? { severity: severityFilter } : undefined),
  })

  const toggleSeverity = useCallback((sev: string) => {
    setSeverityFilter(prev =>
      prev.includes(sev) ? prev.filter(s => s !== sev) : [...prev, sev]
    )
    setPage(0)
  }, [])

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }, [sortKey])

  const alertStations = useMemo(() => {
    let stations = (alerts ?? []).map((a: Alert) => ({
      code: a.code,
      name: a.commune || a.code,
      dept: a.departement ?? a.code_departement,
      classification: a.classification,
      derniere_mesure: a.derniere_mesure,
      type: a.type,
      lat: a.latitude,
      lon: a.longitude,
    }))

    // Sort
    if (sortKey) {
      stations.sort((a: any, b: any) => {
        let valA: any, valB: any
        switch (sortKey) {
          case 'name': valA = (a.name ?? '').toLowerCase(); valB = (b.name ?? '').toLowerCase(); break
          case 'dept': valA = (a.dept ?? '').toLowerCase(); valB = (b.dept ?? '').toLowerCase(); break
          case 'classification': {
            const order: Record<string, number> = { TRES_BAS: 0, BAS: 1, HAUT: 2, TRES_HAUT: 3 }
            valA = order[a.classification] ?? 9; valB = order[b.classification] ?? 9; break
          }
          case 'derniere_mesure': valA = a.derniere_mesure ?? ''; valB = b.derniere_mesure ?? ''; break
          default: return 0
        }
        if (valA < valB) return sortDir === 'asc' ? -1 : 1
        if (valA > valB) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    } else {
      // Default sort by severity
      const classOrder: Record<string, number> = { TRES_BAS: 0, BAS: 1, HAUT: 2, TRES_HAUT: 3 }
      stations.sort((a: any, b: any) => (classOrder[a.classification] ?? 9) - (classOrder[b.classification] ?? 9))
    }

    return stations
  }, [alerts, sortKey, sortDir])

  const paged = alertStations.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(alertStations.length / PAGE_SIZE)

  const tresBas = alertStations.filter(s => s.classification === 'TRES_BAS').length
  const bas = alertStations.filter(s => s.classification === 'BAS').length

  const exportCSV = () => {
    const header = [
      escapeCSV('Code'),
      escapeCSV('Nom'),
      escapeCSV('Département'),
      escapeCSV('Classification'),
      escapeCSV('Dernière mesure'),
      escapeCSV('Type'),
    ].join(',') + '\n'
    const rows = alertStations.map(s =>
      [
        escapeCSV(s.code),
        escapeCSV(s.name),
        escapeCSV(s.dept),
        escapeCSV(s.classification),
        escapeCSV(s.derniere_mesure),
        escapeCSV(s.type),
      ].join(',')
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'alertes_stations.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const SortIndicator = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <span className="text-text-secondary/30 ml-1">&#x25B2;</span>
    return sortDir === 'asc'
      ? <span className="text-accent-cyan ml-1">&#x25B2;</span>
      : <span className="text-accent-cyan ml-1">&#x25BC;</span>
  }

  if (isError) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-red-400 text-sm" role="alert">Erreur lors du chargement des données.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-status-tres-bas" />
            <h1 className="text-xl font-bold text-text-primary">Alertes</h1>
            <span className="text-sm font-mono text-accent-cyan bg-accent-cyan/10 px-2 py-0.5 rounded-full">
              {alertStations.length} alerte{alertStations.length !== 1 ? 's' : ''} active{alertStations.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} aria-label="Exporter en CSV" className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-card border border-white/10 rounded-lg text-xs text-text-secondary hover:text-text-primary transition-colors">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>

        {/* Severity filter buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-text-secondary">Sévérité :</span>
          {SEVERITY_OPTIONS.map(sev => {
            const active = severityFilter.includes(sev)
            const color = CLASSIFICATION_COLORS[sev]
            const labels: Record<string, string> = { TRES_BAS: 'Très bas', BAS: 'Bas', HAUT: 'Haut', TRES_HAUT: 'Très haut' }
            return (
              <button
                key={sev}
                onClick={() => toggleSeverity(sev)}
                aria-label={`Filtrer sévérité ${labels[sev]}`}
                aria-pressed={active}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors border"
                style={{
                  backgroundColor: active ? `${color}30` : 'transparent',
                  borderColor: active ? color : 'rgba(255,255,255,0.1)',
                  color: active ? color : '#9ca3af',
                }}
              >
                {labels[sev]}
              </button>
            )
          })}
          {severityFilter.length > 0 && (
            <button
              onClick={() => { setSeverityFilter([]); setPage(0) }}
              className="text-xs text-text-secondary hover:text-text-primary underline ml-1"
            >
              Effacer
            </button>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-bg-card border border-white/5 rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${CLASSIFICATION_COLORS.TRES_BAS}20` }}>
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: CLASSIFICATION_COLORS.TRES_BAS }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary font-mono">{tresBas.toLocaleString('fr-FR')}</p>
              <p className="text-xs text-text-secondary">Stations très bas</p>
            </div>
          </div>
          <div className="bg-bg-card border border-white/5 rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${CLASSIFICATION_COLORS.BAS}20` }}>
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: CLASSIFICATION_COLORS.BAS }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary font-mono">{bas.toLocaleString('fr-FR')}</p>
              <p className="text-xs text-text-secondary">Stations bas</p>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-bg-card border border-white/5 rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="animate-pulse">
              {/* Skeleton table header */}
              <div className="flex border-b border-white/5 px-4 py-3 gap-4">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="h-3 bg-white/10 rounded" style={{ width: `${8 + i * 3}%` }} />
                ))}
              </div>
              {/* Skeleton table rows */}
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex border-b border-white/5 px-4 py-3 gap-4 items-center">
                  <div className="h-4 w-10 bg-white/5 rounded" />
                  <div className="h-3 w-24 bg-white/10 rounded" />
                  <div className="h-3 bg-white/5 rounded flex-1" />
                  <div className="h-3 w-20 bg-white/5 rounded" />
                  <div className="h-4 w-16 bg-white/10 rounded-full" />
                  <div className="h-3 w-12 bg-white/5 rounded" />
                  <div className="h-3 w-16 bg-white/5 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary">Code</th>
                      <th
                        className="px-4 py-3 text-left text-xs font-medium text-text-secondary cursor-pointer select-none hover:text-text-primary"
                        onClick={() => handleSort('name')}
                        aria-sort={sortKey === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        Nom <SortIndicator column="name" />
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-medium text-text-secondary cursor-pointer select-none hover:text-text-primary"
                        onClick={() => handleSort('dept')}
                        aria-sort={sortKey === 'dept' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        Département <SortIndicator column="dept" />
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-medium text-text-secondary cursor-pointer select-none hover:text-text-primary"
                        onClick={() => handleSort('classification')}
                        aria-sort={sortKey === 'classification' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        Classification <SortIndicator column="classification" />
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-medium text-text-secondary cursor-pointer select-none hover:text-text-primary"
                        onClick={() => handleSort('derniere_mesure')}
                        aria-sort={sortKey === 'derniere_mesure' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        Dernière mesure <SortIndicator column="derniere_mesure" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary">Carte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((s: any) => (
                      <tr key={`${s.type}-${s.code}`} className="border-b border-white/5 hover:bg-bg-hover transition-colors">
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            s.type === 'piezo' ? 'bg-accent-cyan/20 text-accent-cyan' : 'bg-accent-indigo/20 text-accent-indigo'
                          }`}>{s.type.toUpperCase()}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <Link to={`/station/${s.type}/${s.code}`} className="text-accent-cyan hover:underline font-mono text-xs">
                            {s.code}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-text-primary">{s.name}</td>
                        <td className="px-4 py-2.5 text-text-secondary">{s.dept}</td>
                        <td className="px-4 py-2.5"><ClassificationBadge classification={s.classification} /></td>
                        <td className="px-4 py-2.5 text-text-secondary text-xs">{formatDate(s.derniere_mesure)}</td>
                        <td className="px-4 py-2.5">
                          <Link
                            to={`/?lat=${s.lat}&lon=${s.lon}&zoom=12`}
                            className="p-1 hover:bg-bg-hover rounded inline-flex items-center"
                            aria-label={`Voir ${s.name} sur la carte`}
                            title="Voir sur la carte"
                          >
                            <MapPin className="w-3.5 h-3.5 text-accent-cyan" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                  <p className="text-xs text-text-secondary">
                    {alertStations.length.toLocaleString('fr-FR')} stations en alerte
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPage(Math.max(0, page - 1))}
                      disabled={page === 0}
                      className="px-2.5 py-1 rounded text-xs text-text-secondary hover:text-text-primary disabled:opacity-30"
                    >
                      Préc.
                    </button>
                    <span className="px-2.5 py-1 text-xs text-text-secondary">
                      {page + 1} / {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                      disabled={page >= totalPages - 1}
                      className="px-2.5 py-1 rounded text-xs text-text-secondary hover:text-text-primary disabled:opacity-30"
                    >
                      Suiv.
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
