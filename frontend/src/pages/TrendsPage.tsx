import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { api } from '../lib/api'
import { CLASSIFICATION_COLORS, CLASSIFICATION_LABELS, CLASSIFICATION_ORDER } from '../lib/constants'
import { CHART_TOOLTIP_STYLE } from '../lib/types'
import { usePiezoStations, useHydroStations } from '../hooks/useStations'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts'

const TREND_ORDER = ['HAUSSE_FORTE', 'HAUSSE_SIGNIFICATIVE', 'STABLE', 'BAISSE_SIGNIFICATIVE', 'BAISSE_FORTE']

export default function TrendsPage() {
  const [dataType, setDataType] = useState<'piezo' | 'hydro'>('piezo')
  const [selectedDept, setSelectedDept] = useState<string>('')
  const [sidePanelData, setSidePanelData] = useState<{ dept: string; classification: string; stations: any[] } | null>(null)

  const { data: departments, isLoading: deptsLoading, isError: deptsError } = useQuery({
    queryKey: ['stats', 'departments'],
    queryFn: api.stats.departments,
  })
  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ['stats', 'national'],
    queryFn: api.stats.national,
  })

  const { data: piezoStations, isLoading: piezoLoading } = usePiezoStations()
  const { data: hydroStations, isLoading: hydroLoading } = useHydroStations()

  const isLoading = statsLoading || deptsLoading || (dataType === 'piezo' ? piezoLoading : hydroLoading)

  // Build department list for filter dropdown
  const deptList = useMemo(() => {
    const depts = (departments ?? [])
      .filter((d: any) => d.nom_departement)
      .map((d: any) => d.nom_departement as string)
      .sort()
    return [...new Set(depts)]
  }, [departments])

  // Build stacked bar data: per department, count stations by classification
  const stackedData = useMemo(() => {
    const stations = dataType === 'piezo' ? (piezoStations ?? []) : (hydroStations ?? [])
    const classKey = dataType === 'piezo' ? 'classification_derniere_annee' : 'classification_resultat_dern_annee'
    const deptKey = 'nom_departement'

    // Group by department
    const deptMap: Record<string, Record<string, any[]>> = {}
    stations.forEach((s: any) => {
      const dept = s[deptKey] ?? 'Inconnu'
      if (selectedDept && dept !== selectedDept) return
      if (!deptMap[dept]) deptMap[dept] = {}
      const cls = s[classKey] ?? 'UNKNOWN'
      if (!deptMap[dept][cls]) deptMap[dept][cls] = []
      deptMap[dept][cls].push(s)
    })

    return Object.entries(deptMap)
      .map(([dept, classes]) => {
        const row: any = { departement: dept, _stationsByClass: classes }
        let total = 0
        ;(CLASSIFICATION_ORDER as readonly string[]).forEach(cls => {
          row[cls] = (classes[cls] ?? []).length
          total += row[cls]
        })
        row._total = total
        return row
      })
      .sort((a, b) => b._total - a._total)
      .slice(0, selectedDept ? 100 : 25)
  }, [piezoStations, hydroStations, dataType, selectedDept])

  // Memoize top 20 departments ranking
  const top20Depts = useMemo(() =>
    (departments ?? [])
      .filter((d: any) => d.pct_tres_bas != null)
      .sort((a: any, b: any) => (b.pct_tres_bas ?? 0) - (a.pct_tres_bas ?? 0))
      .slice(0, 20),
    [departments]
  )

  // Escape key handler to close side panel
  useEffect(() => {
    if (!sidePanelData) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidePanelData(null)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [sidePanelData])

  // Branch on dataType for KPI
  const total = dataType === 'piezo' ? (stats?.total_piezo ?? 1) : (stats?.total_hydro ?? 1)
  const tresBas = dataType === 'piezo' ? (stats?.piezo_tres_bas ?? 0) : (stats?.hydro_tres_bas ?? 0)
  const bas = dataType === 'piezo' ? (stats?.piezo_bas ?? 0) : (stats?.hydro_bas ?? 0)
  const normal = dataType === 'piezo' ? (stats?.piezo_normal ?? 0) : (stats?.hydro_normal ?? 0)
  const haut = dataType === 'piezo' ? (stats?.piezo_haut ?? 0) : (stats?.hydro_haut ?? 0)
  const tresHaut = dataType === 'piezo' ? (stats?.piezo_tres_haut ?? 0) : (stats?.hydro_tres_haut ?? 0)

  if (statsError || deptsError) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-red-400 text-sm" role="alert">Erreur lors du chargement des données.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-xl font-bold text-text-primary">Tendances nationales</h1>
          <div className="flex items-center gap-3">
            {/* Department filter */}
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              aria-label="Filtrer par département"
              className="px-3 py-1.5 bg-bg-card border border-white/10 rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent-cyan/50"
            >
              <option value="">Tous les départements</option>
              {deptList.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            {/* Piezo / Hydro toggle */}
            <div className="flex gap-1">
              <button
                onClick={() => setDataType('piezo')}
                aria-label="Afficher données piézométriques"
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  dataType === 'piezo' ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Piezo
              </button>
              <button
                onClick={() => setDataType('hydro')}
                aria-label="Afficher données hydrométriques"
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  dataType === 'hydro' ? 'bg-accent-indigo/20 text-accent-indigo' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Hydro
              </button>
            </div>
          </div>
        </div>

        {/* KPI summary */}
        {statsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-bg-card border border-white/5 rounded-xl p-4 text-center animate-pulse">
                <div className="w-3 h-3 rounded-full mx-auto mb-2 bg-white/10" />
                <div className="h-8 bg-white/5 rounded mb-2" />
                <div className="h-3 bg-white/5 rounded w-16 mx-auto" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Très bas', count: tresBas, color: CLASSIFICATION_COLORS.TRES_BAS },
              { label: 'Bas', count: bas, color: CLASSIFICATION_COLORS.BAS },
              { label: 'Normal', count: normal, color: CLASSIFICATION_COLORS.NORMAL },
              { label: 'Haut', count: haut, color: CLASSIFICATION_COLORS.HAUT },
              { label: 'Très haut', count: tresHaut, color: CLASSIFICATION_COLORS.TRES_HAUT },
            ].map((item) => (
              <div key={item.label} className="bg-bg-card border border-white/5 rounded-xl p-4 text-center">
                <div className="w-3 h-3 rounded-full mx-auto mb-2" style={{ backgroundColor: item.color }} />
                <p className="text-2xl font-bold text-text-primary font-mono">
                  {total > 0 ? ((item.count / total) * 100).toFixed(1) : '0.0'}%
                </p>
                <p className="text-xs text-text-secondary mt-1">{item.label}</p>
                <p className="text-xs font-mono text-text-secondary">{item.count.toLocaleString('fr-FR')}</p>
              </div>
            ))}
          </div>
        )}

        {/* Stacked bar chart - Distribution par département */}
        <div className="bg-bg-card border border-white/5 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">
            Distribution des classifications par département
            {selectedDept && <span className="text-accent-cyan ml-2">- {selectedDept}</span>}
          </h3>
          {isLoading ? (
            <div className="h-[500px] animate-pulse space-y-3 py-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3 bg-white/10 rounded w-20 flex-shrink-0" />
                  <div className="h-5 bg-white/5 rounded flex gap-0.5" style={{ width: `${90 - i * 3}%` }}>
                    <div className="h-full bg-red-500/10 rounded-l" style={{ width: '15%' }} />
                    <div className="h-full bg-orange-500/10" style={{ width: '20%' }} />
                    <div className="h-full bg-green-500/10" style={{ width: '40%' }} />
                    <div className="h-full bg-blue-500/10" style={{ width: '15%' }} />
                    <div className="h-full bg-blue-800/10 rounded-r" style={{ width: '10%' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : stackedData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-text-secondary text-sm">
              Aucune donnée disponible
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(400, stackedData.length * 28)}>
              <BarChart
                data={stackedData}
                layout="vertical"
                margin={{ left: 100, right: 20, top: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }} stroke="transparent" />
                <YAxis
                  type="category"
                  dataKey="departement"
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  stroke="transparent"
                  width={95}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(val: number, name: string) => [val, CLASSIFICATION_LABELS[name] ?? name]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value: string) => CLASSIFICATION_LABELS[value] ?? value}
                />
                {(CLASSIFICATION_ORDER as readonly string[]).map((cls) => (
                  <Bar
                    key={cls}
                    dataKey={cls}
                    stackId="a"
                    fill={CLASSIFICATION_COLORS[cls]}
                    onClick={(data: any) => {
                      if (data?.departement) {
                        const entry = stackedData.find((d: any) => d.departement === data.departement)
                        if (entry) {
                          const stations = entry._stationsByClass?.[cls] ?? []
                          setSidePanelData({ dept: data.departement, classification: cls, stations })
                        }
                      }
                    }}
                    cursor="pointer"
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Original department ranking */}
        <div className="bg-bg-card border border-white/5 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">
            Top 20 départements - % stations très bas
          </h3>
          {deptsLoading ? (
            <div className="h-[500px] animate-pulse space-y-3 py-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3 bg-white/10 rounded w-16 flex-shrink-0" />
                  <div className="h-5 bg-white/5 rounded" style={{ width: `${80 - i * 5}%` }} />
                </div>
              ))}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={500}>
              <BarChart
                data={top20Depts}
                layout="vertical"
                margin={{ left: 80, right: 20, top: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }} stroke="transparent" unit="%" />
                <YAxis
                  type="category"
                  dataKey="nom_departement"
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  stroke="transparent"
                  width={75}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(val: number) => [`${val}%`, '% Très bas']}
                />
                <Bar dataKey="pct_tres_bas" radius={[0, 4, 4, 0]}>
                  {top20Depts.map((d: any, i: number) => (
                    <Cell key={i} fill={d.pct_tres_bas > 60 ? '#ef4444' : d.pct_tres_bas > 40 ? '#f97316' : '#06b6d4'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Side panel for clicked bar section */}
      {sidePanelData && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-labelledby="panel-title"
          onClick={() => setSidePanelData(null)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-md bg-bg-card border-l border-white/10 h-full overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-white/5 flex items-center justify-between sticky top-0 bg-bg-card z-10">
              <div>
                <h3 id="panel-title" className="text-sm font-semibold text-text-primary">{sidePanelData.dept}</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  {CLASSIFICATION_LABELS[sidePanelData.classification] ?? sidePanelData.classification}
                  {' '} - {sidePanelData.stations.length} station{sidePanelData.stations.length > 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setSidePanelData(null)}
                className="p-1.5 hover:bg-bg-hover rounded-lg transition-colors"
                aria-label="Fermer le panneau"
              >
                <X className="w-4 h-4 text-text-secondary" />
              </button>
            </div>
            <div className="p-3">
              {sidePanelData.stations.map((s: any) => {
                const code = s.code_bss || s.code_station
                const name = s.nom_commune || s.libelle_station || code
                const type = s.code_bss ? 'piezo' : 'hydro'
                return (
                  <Link
                    key={code}
                    to={`/station/${type}/${code}`}
                    className="block px-3 py-2.5 hover:bg-bg-hover rounded-lg transition-colors border-b border-white/5 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        type === 'piezo' ? 'bg-accent-cyan/20 text-accent-cyan' : 'bg-accent-indigo/20 text-accent-indigo'
                      }`}>
                        {type.toUpperCase()}
                      </span>
                      <span className="text-sm text-text-primary truncate">{name}</span>
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5 ml-10">{code}</p>
                  </Link>
                )
              })}
              {sidePanelData.stations.length === 0 && (
                <p className="text-sm text-text-secondary text-center py-8">Aucune station dans cette catégorie</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
