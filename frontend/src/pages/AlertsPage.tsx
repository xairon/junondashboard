import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Download, AlertTriangle, MapPin, ChevronUp, ChevronDown } from 'lucide-react'
import { usePiezoStations, useHydroStations } from '../hooks/useStations'
import { ClassificationBadge } from '../components/station/ClassificationBadge'
import { CLASSIFICATION_COLORS } from '../lib/constants'
import { formatDate } from '../lib/utils'

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
  const [dataType, setDataType] = useState<'piezo' | 'hydro' | 'all'>('all')
  const [page, setPage] = useState(0)
  const [severityFilter, setSeverityFilter] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const { data: piezoStations, isLoading: piezoLoading, isError: piezoError } = usePiezoStations()
  const { data: hydroStations, isLoading: hydroLoading, isError: hydroError } = useHydroStations()

  const isLoading = piezoLoading || hydroLoading
  const isError = piezoError || hydroError

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
    let stations: any[] = []

    if (dataType !== 'hydro') {
      const piezo = (piezoStations ?? [])
        .filter((s: any) => {
          const cls = s.classification_derniere_annee
          return cls === 'TRES_BAS' || cls === 'BAS' || cls === 'HAUT' || cls === 'TRES_HAUT'
        })
        .map((s: any) => ({
          code: s.code_bss,
          name: s.nom_commune || s.code_bss,
          dept: s.nom_departement ?? s.code_departement,
          classification: s.classification_derniere_annee,
          tendance: s.tendance_classification,
          derniere_mesure: s.derniere_mesure,
          cours_eau: null,
          type: 'piezo',
          lat: s.latitude,
          lon: s.longitude,
        }))
      stations = [...stations, ...piezo]
    }

    if (dataType !== 'piezo') {
      const hydro = (hydroStations ?? [])
        .filter((s: any) => {
          const cls = s.classification_resultat_dern_annee
          return cls === 'TRES_BAS' || cls === 'BAS' || cls === 'HAUT' || cls === 'TRES_HAUT'
        })
        .map((s: any) => ({
          code: s.code_station,
          name: s.libelle_station || s.code_station,
          dept: s.nom_departement ?? s.code_departement,
          classification: s.classification_resultat_dern_annee,
          tendance: null,
          derniere_mesure: s.derniere_mesure,
          cours_eau: s.libelle_cours_eau || s.nom_cours_eau || null,
          type: 'hydro',
          lat: s.latitude,
          lon: s.longitude,
        }))
      stations = [...stations, ...hydro]
    }

    // Apply severity filter
    if (severityFilter.length > 0) {
      stations = stations.filter(s => severityFilter.includes(s.classification))
    }

    // Sort
    if (sortKey) {
      stations.sort((a, b) => {
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
      stations.sort((a, b) => (classOrder[a.classification] ?? 9) - (classOrder[b.classification] ?? 9))
    }

    return stations
  }, [piezoStations, hydroStations, dataType, severityFilter, sortKey, sortDir])

  const paged = alertStations.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(alertStations.length / PAGE_SIZE)

  const tresBas = alertStations.filter(s => s.classification === 'TRES_BAS').length
  const bas = alertStations.filter(s => s.classification === 'BAS').length

  const exportCSV = () => {
    const header = [
      escapeCSV('Code'),
      escapeCSV('Nom'),
      escapeCSV('Departement'),
      escapeCSV('Classification'),
      escapeCSV('Tendance'),
      escapeCSV('Cours d\'eau'),
      escapeCSV('Derniere mesure'),
      escapeCSV('Type'),
    ].join(',') + '\n'
    const rows = alertStations.map(s =>
      [
        escapeCSV(s.code),
        escapeCSV(s.name),
        escapeCSV(s.dept),
        escapeCSV(s.classification),
        escapeCSV(s.tendance),
        escapeCSV(s.cours_eau),
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
        <p className="text-red-400 text-sm" role="alert">Erreur lors du chargement des donnees.</p>
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
            {(['all', 'piezo', 'hydro'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setDataType(t); setPage(0) }}
                aria-label={`Filtrer par type ${t === 'all' ? 'tous' : t}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  dataType === t ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t === 'all' ? 'Tous' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
            <button onClick={exportCSV} aria-label="Exporter en CSV" className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-card border border-white/10 rounded-lg text-xs text-text-secondary hover:text-text-primary transition-colors">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>

        {/* Severity filter buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-text-secondary">Severite :</span>
          {SEVERITY_OPTIONS.map(sev => {
            const active = severityFilter.includes(sev)
            const color = CLASSIFICATION_COLORS[sev]
            const labels: Record<string, string> = { TRES_BAS: 'Tres bas', BAS: 'Bas', HAUT: 'Haut', TRES_HAUT: 'Tres haut' }
            return (
              <button
                key={sev}
                onClick={() => toggleSeverity(sev)}
                aria-label={`Filtrer severite ${labels[sev]}`}
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
              <p className="text-xs text-text-secondary">Stations tres bas</p>
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
                      >
                        Nom <SortIndicator column="name" />
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-medium text-text-secondary cursor-pointer select-none hover:text-text-primary"
                        onClick={() => handleSort('dept')}
                      >
                        Departement <SortIndicator column="dept" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary">Cours d'eau</th>
                      <th
                        className="px-4 py-3 text-left text-xs font-medium text-text-secondary cursor-pointer select-none hover:text-text-primary"
                        onClick={() => handleSort('classification')}
                      >
                        Classification <SortIndicator column="classification" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary">Tendance</th>
                      <th
                        className="px-4 py-3 text-left text-xs font-medium text-text-secondary cursor-pointer select-none hover:text-text-primary"
                        onClick={() => handleSort('derniere_mesure')}
                      >
                        Derniere mesure <SortIndicator column="derniere_mesure" />
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
                        <td className="px-4 py-2.5 text-text-secondary text-xs">{s.cours_eau ?? '-'}</td>
                        <td className="px-4 py-2.5"><ClassificationBadge classification={s.classification} /></td>
                        <td className="px-4 py-2.5 text-text-secondary text-xs">{s.tendance ?? '-'}</td>
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
                      Prec.
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
