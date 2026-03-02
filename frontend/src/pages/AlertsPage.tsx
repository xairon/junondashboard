import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Download, AlertTriangle } from 'lucide-react'
import { usePiezoStations, useHydroStations } from '../hooks/useStations'
import { ClassificationBadge } from '../components/station/ClassificationBadge'
import { CLASSIFICATION_COLORS } from '../lib/constants'
import { formatNumber, formatDate } from '../lib/utils'

const PAGE_SIZE = 50

const escapeCSV = (v: string | null | undefined): string => {
  const s = String(v ?? '')
  const needsQuote = s.includes(',') || s.includes('"') || s.includes('\n') || /^[=+\-@]/.test(s)
  return needsQuote ? `"${s.replace(/"/g, '""')}"` : s
}

export default function AlertsPage() {
  const [dataType, setDataType] = useState<'piezo' | 'hydro' | 'all'>('all')
  const [page, setPage] = useState(0)

  const { data: piezoStations, isLoading: piezoLoading, isError: piezoError } = usePiezoStations()
  const { data: hydroStations, isLoading: hydroLoading, isError: hydroError } = useHydroStations()

  const isLoading = piezoLoading || hydroLoading
  const isError = piezoError || hydroError

  const alertStations = useMemo(() => {
    let stations: any[] = []

    if (dataType !== 'hydro') {
      const piezo = (piezoStations ?? [])
        .filter((s: any) => s.classification_derniere_annee === 'TRES_BAS' || s.classification_derniere_annee === 'BAS')
        .map((s: any) => ({
          code: s.code_bss,
          name: s.nom_commune || s.code_bss,
          dept: s.nom_departement ?? s.code_departement,
          classification: s.classification_derniere_annee,
          tendance: s.tendance_classification,
          derniere_mesure: s.derniere_mesure,
          type: 'piezo',
        }))
      stations = [...stations, ...piezo]
    }

    if (dataType !== 'piezo') {
      const hydro = (hydroStations ?? [])
        .filter((s: any) => s.classification_resultat_dern_annee === 'TRES_BAS' || s.classification_resultat_dern_annee === 'BAS')
        .map((s: any) => ({
          code: s.code_station,
          name: s.libelle_station || s.code_station,
          dept: s.nom_departement ?? s.code_departement,
          classification: s.classification_resultat_dern_annee,
          tendance: null,
          derniere_mesure: s.derniere_mesure,
          type: 'hydro',
        }))
      stations = [...stations, ...hydro]
    }

    const classOrder: Record<string, number> = { TRES_BAS: 0, BAS: 1 }
    stations.sort((a, b) => (classOrder[a.classification] ?? 9) - (classOrder[b.classification] ?? 9))
    return stations
  }, [piezoStations, hydroStations, dataType])

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

  if (isError) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-red-400 text-sm">Erreur lors du chargement des donnees.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-status-tres-bas" />
            <h1 className="text-xl font-bold text-text-primary">Alertes</h1>
          </div>
          <div className="flex items-center gap-2">
            {(['all', 'piezo', 'hydro'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setDataType(t); setPage(0) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  dataType === t ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t === 'all' ? 'Tous' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
            <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-card border border-white/10 rounded-lg text-xs text-text-secondary hover:text-text-primary transition-colors">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
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
            <div className="flex items-center justify-center h-64 text-text-secondary text-sm">
              Chargement...
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    {['Type', 'Code', 'Nom', 'Departement', 'Classification', 'Tendance', 'Derniere mesure'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-text-secondary">{h}</th>
                    ))}
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
                      <td className="px-4 py-2.5 text-text-secondary text-xs">{s.tendance ?? '-'}</td>
                      <td className="px-4 py-2.5 text-text-secondary text-xs">{formatDate(s.derniere_mesure)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

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
