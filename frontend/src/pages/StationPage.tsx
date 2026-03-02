import { useParams, useLocation, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { usePiezoStationDetail, useHydroStationDetail } from '../hooks/useStations'
import { usePiezoMonthly, useHydroMonthly } from '../hooks/useTimeseries'
import { StationKPICards } from '../components/station/StationKPICards'
import { TimeseriesChart } from '../components/charts/TimeseriesChart'
import { CorrelationScatter } from '../components/charts/CorrelationScatter'
import { SeasonalityChart } from '../components/charts/SeasonalityChart'
import { YearlyHeatmap } from '../components/charts/YearlyHeatmap'

export default function StationPage() {
  const { code } = useParams<{ code: string }>()
  const location = useLocation()
  const isPiezo = location.pathname.includes('/piezo/')

  const { data: piezoStation, isLoading: piezoLoading } = usePiezoStationDetail(isPiezo ? code! : '')
  const { data: hydroStation, isLoading: hydroLoading } = useHydroStationDetail(!isPiezo ? code! : '')
  const { data: piezoMonthly } = usePiezoMonthly(isPiezo ? code! : '')
  const { data: hydroMonthly } = useHydroMonthly(!isPiezo ? code! : '')

  const station = isPiezo ? piezoStation : hydroStation
  const monthly = isPiezo ? piezoMonthly : hydroMonthly
  const loading = isPiezo ? piezoLoading : hydroLoading
  const type = isPiezo ? 'piezo' as const : 'hydro' as const

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
      </div>
    )
  }

  if (!station) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary">
        Station non trouvee
      </div>
    )
  }

  const name = isPiezo
    ? (station.nom_commune || station.code_bss)
    : (station.libelle_station || station.code_station)

  const valueKey = isPiezo ? 'niveau_moyen' : 'resultat_moyen'
  const valueLabel = isPiezo ? 'Niveau nappe (m NGF)' : 'Debit (m\u00b3/s)'
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
              {isPiezo ? 'Piezometrie' : 'Hydrometrie'}
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

        {/* Main Timeseries */}
        {monthly && monthly.length > 0 && (
          <div className="bg-bg-card border border-white/5 rounded-xl p-5">
            <TimeseriesChart
              data={monthly}
              valueKey={valueKey}
              valueLabel={valueLabel}
              unit={unit}
            />
          </div>
        )}

        {/* Correlation + Seasonality */}
        {monthly && monthly.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-bg-card border border-white/5 rounded-xl p-5">
              <CorrelationScatter
                data={monthly}
                xKey="precipitation_totale"
                yKey={valueKey}
                xLabel="Precipitations (mm)"
                yLabel={valueLabel}
              />
            </div>
            <div className="bg-bg-card border border-white/5 rounded-xl p-5">
              <SeasonalityChart
                data={monthly}
                valueKey={valueKey}
                label={valueLabel}
              />
            </div>
          </div>
        )}

        {/* Yearly Heatmap */}
        {monthly && monthly.length > 0 && (
          <div className="bg-bg-card border border-white/5 rounded-xl p-5">
            <YearlyHeatmap
              data={monthly}
              valueKey={valueKey}
              label={`Heatmap annuel - ${valueLabel}`}
            />
          </div>
        )}
      </div>
    </div>
  )
}
