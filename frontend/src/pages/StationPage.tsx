import { useState, useMemo } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Info } from 'lucide-react'
import { usePiezoStationDetail, useHydroStationDetail, useBdlisaLookup } from '../hooks/useStations'
import { usePiezoMonthly, useHydroMonthly, usePiezoDaily, useHydroDaily, usePiezoYearly, useHydroYearly } from '../hooks/useTimeseries'
import { StationKPICards } from '../components/station/StationKPICards'
import { TimeseriesChart } from '../components/charts/TimeseriesChart'
import { CorrelationScatter } from '../components/charts/CorrelationScatter'
import { SeasonalityChart } from '../components/charts/SeasonalityChart'
import { YearlyHeatmap } from '../components/charts/YearlyHeatmap'
import { PercentileChart } from '../components/charts/PercentileChart'
import { api } from '../lib/api'

type Resolution = 'daily' | 'monthly' | 'yearly'

const RESOLUTION_OPTIONS: { value: Resolution; label: string }[] = [
  { value: 'daily', label: 'Journalier' },
  { value: 'monthly', label: 'Mensuel' },
  { value: 'yearly', label: 'Annuel' },
]

function formatDateFR(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' })
}

function formatDuration(months: number | null | undefined): string {
  if (!months) return '—'
  const years = Math.floor(months / 12)
  const rem = months % 12
  if (years === 0) return `${rem} mois`
  if (rem === 0) return `${years} ans`
  return `${years} ans ${rem} mois`
}

function formatPeriod(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return '—'
  const fmt = (d: string) => new Date(d).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' })
  if (start && end) return `${fmt(start)} – ${fmt(end)}`
  if (end) return `jusqu'en ${fmt(end)}`
  return `depuis ${fmt(start!)}`
}

function MetaRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (value == null || value === '' || value === '—') return null
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className={`text-xs text-gray-200 text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

/* Skeleton components */
function SkeletonKPI() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-bg-card border border-white/5 rounded-xl p-4 animate-pulse">
          <div className="h-3 bg-white/10 rounded w-1/2 mb-3" />
          <div className="h-6 bg-white/5 rounded w-3/4 mb-2" />
          <div className="h-3 bg-white/5 rounded w-1/3" />
        </div>
      ))}
    </div>
  )
}

function SkeletonChart() {
  return (
    <div className="bg-bg-card border border-white/5 rounded-xl p-5 animate-pulse">
      <div className="h-4 bg-white/10 rounded w-1/3 mb-4" />
      <div className="h-64 bg-white/5 rounded flex items-end justify-around px-4 pb-4 gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="bg-white/10 rounded-t w-full"
            style={{ height: `${20 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="bg-bg-card border border-white/5 rounded-xl p-5 animate-pulse">
          <div className="h-4 bg-white/10 rounded w-1/3 mb-4" />
          <div className="h-48 bg-white/5 rounded" />
        </div>
      ))}
    </div>
  )
}

export default function StationPage() {
  const params = useParams()
  const location = useLocation()
  const isPiezo = location.pathname.includes('/piezo/')
  // Wildcard captures everything after /station/ including the type prefix.
  // Strip the leading "piezo/" or "hydro/" to get the actual station code (e.g. "05604X0162/SF1").
  const code = (params['*'] || '').replace(/^(piezo|hydro)\//, '')

  const [resolution, setResolution] = useState<Resolution>('monthly')

  // Default daily range: last 2 years
  const defaultEnd = useMemo(() => {
    const d = new Date()
    return d.toISOString().slice(0, 10)
  }, [])
  const defaultStart = useMemo(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 2)
    return d.toISOString().slice(0, 10)
  }, [])
  const [dailyStart, setDailyStart] = useState(defaultStart)
  const [dailyEnd, setDailyEnd] = useState(defaultEnd)

  const { data: piezoStation, isLoading: piezoLoading } = usePiezoStationDetail(isPiezo ? code : '')
  const { data: hydroStation, isLoading: hydroLoading } = useHydroStationDetail(!isPiezo ? code : '')

  // Monthly (always loaded for correlation/seasonality/heatmap)
  const { data: piezoMonthly, isLoading: piezoMonthlyLoading } = usePiezoMonthly(isPiezo ? code : '')
  const { data: hydroMonthly, isLoading: hydroMonthlyLoading } = useHydroMonthly(!isPiezo ? code : '')

  // Daily (only when resolution === 'daily')
  const { data: piezoDaily, isLoading: piezoDailyLoading } = usePiezoDaily(
    isPiezo && resolution === 'daily' ? code : '',
    dailyStart,
    dailyEnd,
  )
  const { data: hydroDaily, isLoading: hydroDailyLoading } = useHydroDaily(
    !isPiezo && resolution === 'daily' ? code : '',
    dailyStart,
    dailyEnd,
  )

  // Yearly (always fetched — needed for PercentileChart and resolution === 'yearly' view)
  const { data: piezoYearly, isLoading: piezoYearlyLoading } = usePiezoYearly(
    isPiezo ? code : '',
  )
  const { data: hydroYearly, isLoading: hydroYearlyLoading } = useHydroYearly(
    !isPiezo ? code : '',
  )

  const station: any = isPiezo ? piezoStation : hydroStation
  const bdlisaLookup = useBdlisaLookup()
  const monthly = isPiezo ? piezoMonthly : hydroMonthly
  const stationLoading = isPiezo ? piezoLoading : hydroLoading
  const type = isPiezo ? 'piezo' as const : 'hydro' as const

  // Percentile thresholds (P10/P25/P75/P90) for reference bands on chart
  const { data: percentiles } = useQuery({
    queryKey: ['percentiles', type, code],
    queryFn: () => isPiezo
      ? api.stations.piezoPercentiles(code)
      : api.stations.hydroPercentiles(code),
    enabled: !!code,
    staleTime: 24 * 60 * 60 * 1000, // 24h
  })

  // Select active data based on resolution
  const activeData = useMemo(() => {
    if (resolution === 'daily') return isPiezo ? piezoDaily : hydroDaily
    if (resolution === 'yearly') return isPiezo ? piezoYearly : hydroYearly
    return monthly
  }, [resolution, isPiezo, piezoDaily, hydroDaily, piezoYearly, hydroYearly, monthly])

  const activeLoading =
    resolution === 'daily'
      ? (isPiezo ? piezoDailyLoading : hydroDailyLoading)
      : resolution === 'yearly'
        ? (isPiezo ? piezoYearlyLoading : hydroYearlyLoading)
        : (isPiezo ? piezoMonthlyLoading : hydroMonthlyLoading)

  if (stationLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
          {/* Skeleton header */}
          <div className="flex items-center gap-4 animate-pulse">
            <div className="w-9 h-9 bg-white/10 rounded-lg" />
            <div>
              <div className="h-3 bg-white/10 rounded w-20 mb-2" />
              <div className="h-5 bg-white/10 rounded w-48 mb-1" />
              <div className="h-3 bg-white/5 rounded w-32" />
            </div>
          </div>
          <SkeletonKPI />
          <SkeletonChart />
          <SkeletonRow />
        </div>
      </div>
    )
  }

  if (!station) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary" role="alert">
        Station non trouvée
      </div>
    )
  }

  const name = isPiezo
    ? (station.nom_commune || station.code_bss)
    : (station.libelle_station || station.code_station)

  const hydroLabel = !isPiezo && station?.grandeur_hydro_principale === 'H' ? 'Hauteur moyenne' : 'Débit moyen'
  const hydroUnit = !isPiezo && station?.grandeur_hydro_principale === 'H' ? 'm' : 'm³/s'

  const valueKey = resolution === 'daily'
    ? (isPiezo ? 'niveau_nappe_eau' : 'resultat_obs_elab')
    : (isPiezo ? 'niveau_moyen' : 'resultat_moyen')
  const valueLabel = isPiezo ? 'Niveau nappe (m NGF)' : `${hydroLabel} (${hydroUnit})`
  const unit = isPiezo ? 'm NGF' : hydroUnit

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 hover:bg-bg-hover rounded-lg transition-colors" aria-label="Retour à l'observatoire">
            <ArrowLeft className="w-5 h-5 text-text-secondary" />
          </Link>
          <div>
            <p className="text-xs text-accent-cyan font-medium uppercase tracking-wide">
              {isPiezo ? 'Piézométrie' : 'Hydrométrie'}
            </p>
            <h1 className="text-xl font-bold text-text-primary">{name}</h1>
            <p className="text-sm text-text-secondary">
              {station.nom_departement ?? ''} &middot; {code}
              {!isPiezo && station.nom_cours_eau && ` · ${station.nom_cours_eau}`}
            </p>
          </div>
        </div>

        {/* Fiche technique */}
        <section className="bg-gray-900/50 rounded-xl border border-white/5 p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <Info className="w-4 h-4" />
            Fiche technique
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            {isPiezo ? (
              <>
                {/* Left column: temporal info */}
                <div>
                  <MetaRow
                    label="Période de données"
                    value={formatPeriod(station.premiere_mesure, station.derniere_mesure)}
                  />
                  <MetaRow
                    label="Durée"
                    value={formatDuration(station.nb_mois_total)}
                  />
                  <MetaRow
                    label="Nombre de mesures"
                    value={station.nb_mesures_total != null
                      ? station.nb_mesures_total.toLocaleString('fr-FR')
                      : null}
                  />
                  <MetaRow
                    label="Dernière mesure"
                    value={formatDateFR(station.derniere_mesure)}
                  />
                  <MetaRow
                    label="Altitude station"
                    value={station.altitude_station != null
                      ? `${station.altitude_station.toFixed(0)} m NGF`
                      : null}
                  />
                  <MetaRow
                    label="Percentile année courante"
                    value={station.percentile_derniere_annee != null
                      ? `${Math.round(station.percentile_derniere_annee)}e centile`
                      : null}
                  />
                  <MetaRow
                    label="Profondeur moy. nappe"
                    value={station.profondeur_moyenne_globale != null
                      ? `${station.profondeur_moyenne_globale.toFixed(2)} m`
                      : null}
                  />
                </div>
                {/* Right column: technical info */}
                <div>
                  <MetaRow
                    label="Code BSS"
                    value={station.code_bss ?? null}
                    mono
                  />
                  <MetaRow
                    label="Code BDLISA"
                    value={station.codes_bdlisa
                      ? (
                        <a
                          href="https://bdlisa.eaufrance.fr/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline"
                        >
                          {station.codes_bdlisa}
                        </a>
                      )
                      : null}
                  />
                  <MetaRow
                    label="Type nappe"
                    value={isPiezo && station ? bdlisaLookup((station as any).codes_bdlisa)?.nature ?? null : null}
                  />
                  <MetaRow
                    label="Niveau min historique"
                    value={station.niveau_min_absolu != null
                      ? `${station.niveau_min_absolu.toFixed(2)} m NGF`
                      : null}
                  />
                  <MetaRow
                    label="Niveau max historique"
                    value={station.niveau_max_absolu != null
                      ? `${station.niveau_max_absolu.toFixed(2)} m NGF`
                      : null}
                  />
                  <MetaRow
                    label="Amplitude totale"
                    value={station.amplitude_totale != null
                      ? `${station.amplitude_totale.toFixed(2)} m`
                      : null}
                  />
                </div>
              </>
            ) : (
              <>
                {/* Left column: temporal info */}
                <div>
                  <MetaRow
                    label="Période de données"
                    value={formatPeriod(station.premiere_mesure, station.derniere_mesure)}
                  />
                  <MetaRow
                    label="Durée"
                    value={formatDuration(station.nb_mois_total)}
                  />
                  <MetaRow
                    label="Mise en service"
                    value={formatDateFR(station.date_ouverture_station)}
                  />
                  <MetaRow
                    label="Dernière mesure"
                    value={formatDateFR(station.derniere_mesure)}
                  />
                  <MetaRow
                    label="Percentile année courante"
                    value={station.percentile_resultat_dern_annee != null
                      ? `${Math.round(station.percentile_resultat_dern_annee)}e centile`
                      : null}
                  />
                  <MetaRow
                    label="Année dernier bilan"
                    value={station.annee_dernier_bilan != null
                      ? String(station.annee_dernier_bilan)
                      : null}
                  />
                </div>
                {/* Right column: technical info */}
                <div>
                  <MetaRow
                    label="Code station"
                    value={station.code_station ?? null}
                    mono
                  />
                  <MetaRow
                    label="Code cours d'eau"
                    value={station.code_cours_eau
                      ? (
                        <a
                          href={`https://www.sandre.eaufrance.fr/urn.php?urn=urn:sandre:data:cours_eau:FRA:cdcoursdeau:${station.code_cours_eau}:2023:::referentiel`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline font-mono"
                        >
                          {station.code_cours_eau}
                        </a>
                      )
                      : null}
                  />
                  <MetaRow
                    label="Site hydrométrique"
                    value={station.libelle_site && station.libelle_site !== name
                      ? station.libelle_site
                      : null}
                  />
                  <MetaRow
                    label="Min historique"
                    value={station.resultat_min_global != null
                      ? `${station.resultat_min_global.toFixed(2)} ${hydroUnit}`
                      : null}
                  />
                  <MetaRow
                    label="Max historique"
                    value={station.resultat_max_global != null
                      ? `${station.resultat_max_global.toFixed(2)} ${hydroUnit}`
                      : null}
                  />
                </div>
              </>
            )}
          </div>
        </section>

        {/* KPI Cards */}
        <StationKPICards station={station} type={type} />

        {/* Resolution selector */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-text-secondary font-medium">Résolution :</span>
          <div role="group" aria-label="Résolution temporelle" className="flex gap-1">
            {RESOLUTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                aria-pressed={resolution === opt.value}
                onClick={() => setResolution(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  resolution === opt.value
                    ? 'bg-accent-cyan/20 text-accent-cyan'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Date range picker for daily */}
          {resolution === 'daily' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                aria-label="Date de début"
                value={dailyStart}
                onChange={(e) => setDailyStart(e.target.value)}
                className="bg-bg-card border border-white/10 rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent-cyan/50"
              />
              <span className="text-xs text-text-secondary">-</span>
              <input
                type="date"
                aria-label="Date de fin"
                value={dailyEnd}
                onChange={(e) => setDailyEnd(e.target.value)}
                className="bg-bg-card border border-white/10 rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent-cyan/50"
              />
            </div>
          )}
        </div>

        {/* Main Timeseries */}
        {activeLoading ? (
          <SkeletonChart />
        ) : activeData && activeData.length > 0 ? (
          <div className="bg-bg-card border border-white/5 rounded-xl p-5">
            <TimeseriesChart
              data={activeData}
              valueKey={valueKey}
              valueLabel={valueLabel}
              unit={unit}
              percentiles={percentiles}
            />
          </div>
        ) : (
          <div className="bg-bg-card border border-white/5 rounded-xl p-5 flex items-center justify-center h-64 text-text-secondary text-sm">
            Aucune donnée pour cette résolution
          </div>
        )}

        {/* Rang centile historique annuel */}
        {(() => {
          const yearlyData = isPiezo ? piezoYearly : hydroYearly
          if (!yearlyData?.length) return null
          return (
            <div className="bg-gray-900/50 rounded-xl border border-white/5 p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Rang centile historique annuel</h3>
              <PercentileChart data={yearlyData} type={type} />
            </div>
          )
        })()}

        {/* Correlation + Seasonality (use monthly data always) */}
        {monthly && monthly.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-bg-card border border-white/5 rounded-xl p-5">
              <CorrelationScatter
                data={monthly}
                xKey="precipitation_totale"
                yKey={isPiezo ? 'niveau_moyen' : 'resultat_moyen'}
                xLabel="Précipitations (mm)"
                yLabel={valueLabel}
              />
            </div>
            <div className="bg-bg-card border border-white/5 rounded-xl p-5">
              <SeasonalityChart
                data={monthly}
                valueKey={isPiezo ? 'niveau_moyen' : 'resultat_moyen'}
                label={valueLabel}
              />
            </div>
          </div>
        )}

        {/* Yearly Heatmap (use monthly data always) */}
        {monthly && monthly.length > 0 && (
          <div className="bg-bg-card border border-white/5 rounded-xl p-5">
            <YearlyHeatmap
              data={monthly}
              valueKey={isPiezo ? 'niveau_moyen' : 'resultat_moyen'}
              label={`Heatmap annuel - ${valueLabel}`}
            />
          </div>
        )}
      </div>
    </div>
  )
}
