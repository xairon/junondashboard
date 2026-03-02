import { useState, useMemo } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { usePiezoStationDetail, useHydroStationDetail } from '../hooks/useStations'
import { usePiezoMonthly, useHydroMonthly, usePiezoDaily, useHydroDaily, usePiezoYearly, useHydroYearly } from '../hooks/useTimeseries'
import { StationKPICards } from '../components/station/StationKPICards'
import { TimeseriesChart } from '../components/charts/TimeseriesChart'
import { CorrelationScatter } from '../components/charts/CorrelationScatter'
import { SeasonalityChart } from '../components/charts/SeasonalityChart'
import { YearlyHeatmap } from '../components/charts/YearlyHeatmap'

type Resolution = 'daily' | 'monthly' | 'yearly'

const RESOLUTION_OPTIONS: { value: Resolution; label: string }[] = [
  { value: 'daily', label: 'Journalier' },
  { value: 'monthly', label: 'Mensuel' },
  { value: 'yearly', label: 'Annuel' },
]

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
  const code = params['*'] || ''

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

  // Yearly (only when resolution === 'yearly')
  const { data: piezoYearly, isLoading: piezoYearlyLoading } = usePiezoYearly(
    isPiezo && resolution === 'yearly' ? code : '',
  )
  const { data: hydroYearly, isLoading: hydroYearlyLoading } = useHydroYearly(
    !isPiezo && resolution === 'yearly' ? code : '',
  )

  const station = isPiezo ? piezoStation : hydroStation
  const monthly = isPiezo ? piezoMonthly : hydroMonthly
  const stationLoading = isPiezo ? piezoLoading : hydroLoading
  const type = isPiezo ? 'piezo' as const : 'hydro' as const

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
        Station non trouv\u00e9e
      </div>
    )
  }

  const name = isPiezo
    ? (station.nom_commune || station.code_bss)
    : (station.libelle_station || station.code_station)

  const valueKey = resolution === 'daily'
    ? (isPiezo ? 'niveau_nappe_eau' : 'resultat_obs_elab')
    : (isPiezo ? 'niveau_moyen' : 'resultat_moyen')
  const valueLabel = isPiezo ? 'Niveau nappe (m NGF)' : 'D\u00e9bit (m\u00b3/s)'
  const unit = isPiezo ? 'm NGF' : 'm\u00b3/s'

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 hover:bg-bg-hover rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-text-secondary" />
          </Link>
          <div>
            <p className="text-xs text-accent-cyan font-medium uppercase tracking-wide">
              {isPiezo ? 'Pi\u00e9zom\u00e9trie' : 'Hydrom\u00e9trie'}
            </p>
            <h1 className="text-xl font-bold text-text-primary">{name}</h1>
            <p className="text-sm text-text-secondary">
              {station.nom_departement ?? ''} &middot; {code}
              {!isPiezo && station.nom_cours_eau && ` \u00b7 ${station.nom_cours_eau}`}
            </p>
          </div>
        </div>

        {/* KPI Cards */}
        <StationKPICards station={station} type={type} />

        {/* Resolution selector */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-text-secondary font-medium">R\u00e9solution :</span>
          <div className="flex gap-1">
            {RESOLUTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
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
                value={dailyStart}
                onChange={(e) => setDailyStart(e.target.value)}
                className="bg-bg-card border border-white/10 rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent-cyan/50"
              />
              <span className="text-xs text-text-secondary">-</span>
              <input
                type="date"
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
            />
          </div>
        ) : (
          <div className="bg-bg-card border border-white/5 rounded-xl p-5 flex items-center justify-center h-64 text-text-secondary text-sm">
            Aucune donn\u00e9e pour cette r\u00e9solution
          </div>
        )}

        {/* Correlation + Seasonality (use monthly data always) */}
        {monthly && monthly.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-bg-card border border-white/5 rounded-xl p-5">
              <CorrelationScatter
                data={monthly}
                xKey="precipitation_totale"
                yKey={isPiezo ? 'niveau_moyen' : 'resultat_moyen'}
                xLabel="Pr\u00e9cipitations (mm)"
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
