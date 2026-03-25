import { useState, useMemo } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Info, Droplets, Waves } from 'lucide-react'
import { usePiezoStationDetail, useHydroStationDetail, usePiezoSiblings, useHydroSiblings } from '../hooks/useStations'
import { usePiezoMonthly, useHydroMonthly, usePiezoDaily, useHydroDaily, usePiezoYearly, useHydroYearly, usePiezoSPLI, useHydroSSFI, useSPI } from '../hooks/useTimeseries'
import { StationKPICards } from '../components/station/StationKPICards'
import { TimeseriesChart } from '../components/charts/TimeseriesChart'
import { DroughtIndexChart } from '../components/charts/DroughtIndexChart'
import { api } from '../lib/api'
import { CLASSIFICATION_COLORS } from '../lib/constants'
import { formatDate } from '../lib/utils'

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

  const [resolution, setResolution] = useState<Resolution>('daily')

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

  // Monthly (only when resolution is monthly)
  const { data: piezoMonthly, isLoading: piezoMonthlyLoading } = usePiezoMonthly(isPiezo ? code : '', { enabled: resolution === 'monthly' })
  const { data: hydroMonthly, isLoading: hydroMonthlyLoading } = useHydroMonthly(!isPiezo ? code : '', { enabled: resolution === 'monthly' })

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

  const station: any = isPiezo ? piezoStation : hydroStation
  const monthly = isPiezo ? piezoMonthly : hydroMonthly
  const stationLoading = isPiezo ? piezoLoading : hydroLoading
  const type = isPiezo ? 'piezo' as const : 'hydro' as const

  // Siblings
  const { data: piezoSiblings } = usePiezoSiblings(isPiezo ? code : '')
  const { data: hydroSiblings } = useHydroSiblings(!isPiezo ? code : '')

  // Drought indices (SPLI / SSFI / SPI)
  const { data: spliData } = usePiezoSPLI(isPiezo ? code : '')
  const { data: ssfiData } = useHydroSSFI(!isPiezo ? code : '')
  const { data: spiData } = useSPI(code, type)
  const droughtData = isPiezo ? spliData : ssfiData

  // Percentile thresholds (P10/P25/P75/P90) for reference bands on chart
  const { data: percentiles } = useQuery({
    queryKey: ['percentiles', type, code],
    queryFn: () => isPiezo
      ? api.piezo.percentiles(code)
      : api.hydro.percentiles(code),
    enabled: !!code,
    staleTime: 24 * 60 * 60 * 1000, // 24h
  })

  // Select active data based on resolution
  // For yearly: null out precipitation when coverage is too low (< 300 days)
  // to avoid misleading totals from sparse measurements
  const activeData = useMemo(() => {
    if (resolution === 'daily') return isPiezo ? piezoDaily : hydroDaily
    if (resolution === 'yearly') {
      const raw = isPiezo ? piezoYearly : hydroYearly
      return raw?.map((d: any) => ({
        ...d,
        precipitation_totale_annuelle: (d.nb_jours_mesures_annuel ?? 0) >= 300
          ? d.precipitation_totale_annuelle
          : null,
      }))
    }
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
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-text-secondary">Station non trouvée</p>
        <Link to="/" className="text-accent-cyan hover:underline text-sm">
          Retour à l'observatoire
        </Link>
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
    : resolution === 'yearly'
      ? (isPiezo ? 'niveau_moyen_annuel' : 'resultat_moyen_annuel')
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
                  {station.bss_id && (
                    <MetaRow
                      label="Identifiant BSS"
                      value={station.bss_id}
                      mono
                    />
                  )}
                  <MetaRow
                    label="Coordonnées"
                    value={station.latitude != null && station.longitude != null
                      ? `${station.latitude.toFixed(4)}° N, ${station.longitude.toFixed(4)}° E`
                      : null}
                  />
                  <MetaRow
                    label="Code BDLISA"
                    value={station.codes_bdlisa
                      ? (
                        <a
                          href={`https://bdlisa.eaufrance.fr/hydrogeounit/${station.codes_bdlisa.split(',')[0]}`}
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
                {/* Liens externes piézo */}
                <div className="col-span-full flex flex-wrap gap-3 pt-2 border-t border-white/5">
                  <a href={`https://ades.eaufrance.fr/Fiche/PtEau?code=${station.code_bss}`}
                     target="_blank" rel="noopener noreferrer"
                     className="text-[11px] text-blue-400 hover:underline">
                    ADES ↗
                  </a>
                  {station.bss_id && (
                    <a href={`https://infoterre.brgm.fr/ficheinfoterre/ficheBss.action?id=${station.code_bss}`}
                       target="_blank" rel="noopener noreferrer"
                       className="text-[11px] text-blue-400 hover:underline">
                      InfoTerre ↗
                    </a>
                  )}
                  <a href={`https://hubeau.eaufrance.fr/page/api-piezometrie`}
                     target="_blank" rel="noopener noreferrer"
                     className="text-[11px] text-blue-400 hover:underline">
                    Hub'Eau ↗
                  </a>
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
                    label="Coordonnées"
                    value={station.latitude_station != null && station.longitude_station != null
                      ? `${station.latitude_station.toFixed(4)}° N, ${station.longitude_station.toFixed(4)}° E`
                      : null}
                  />
                  <MetaRow
                    label="Code cours d'eau"
                    value={station.code_cours_eau
                      ? (
                        <a
                          href={`https://services.sandre.eaufrance.fr/Courdo/Fiche/client/fiche_courdo.php?CdSandre=${station.code_cours_eau}`}
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
                {/* Liens externes hydro */}
                <div className="col-span-full flex flex-wrap gap-3 pt-2 border-t border-white/5">
                  <a href={`https://www.vigicrues.gouv.fr/niv3-station.php?CdStationHydro=${station.code_station}`}
                     target="_blank" rel="noopener noreferrer"
                     className="text-[11px] text-blue-400 hover:underline">
                    VigiCrues ↗
                  </a>
                  <a href={`https://hubeau.eaufrance.fr/page/api-hydrometrie`}
                     target="_blank" rel="noopener noreferrer"
                     className="text-[11px] text-blue-400 hover:underline">
                    Hub'Eau ↗
                  </a>
                  <a href={`https://www.hydro.eaufrance.fr/stationhydro/${station.code_station}/fiche`}
                     target="_blank" rel="noopener noreferrer"
                     className="text-[11px] text-blue-400 hover:underline">
                    Banque Hydro ↗
                  </a>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Sibling stations */}
        {isPiezo && piezoSiblings && piezoSiblings.siblings.length > 0 && (
          <section className="bg-gray-900/50 rounded-xl border border-white/5 p-4">
            <h2 className="text-sm font-semibold text-gray-300 mb-1 flex items-center gap-2">
              <Droplets className="w-4 h-4" />
              Nappe souterraine
              <span className="text-xs font-mono text-accent-cyan bg-accent-cyan/10 px-1.5 py-0.5 rounded-full">
                {piezoSiblings.nb_stations}
              </span>
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              Autres piézomètres du même bassin BDLISA ({piezoSiblings.code_bdlisa}), triés par proximité
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Station</th>
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Dép.</th>
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Situation</th>
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Dernière mesure</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Distance</th>
                  </tr>
                </thead>
                <tbody>
                  {piezoSiblings.siblings.map(sib => (
                    <tr key={sib.code_bss} className="border-b border-white/5 hover:bg-bg-hover transition-colors">
                      <td className="py-1.5 px-2">
                        <Link to={`/station/piezo/${sib.code_bss}`} className="text-accent-cyan hover:underline">
                          {sib.nom_commune || sib.code_bss}
                        </Link>
                      </td>
                      <td className="py-1.5 px-2 text-gray-400">{sib.code_departement}</td>
                      <td className="py-1.5 px-2">
                        {sib.classification && (
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: CLASSIFICATION_COLORS[sib.classification] ?? '#6b7280' }}
                            />
                            <span className="text-gray-300">{sib.classification.replace(/_/g, ' ').toLowerCase()}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-gray-400">{formatDate(sib.derniere_mesure)}</td>
                      <td className="py-1.5 px-2 text-right text-gray-400 font-mono">
                        {sib.distance_km != null ? `${sib.distance_km} km` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {!isPiezo && hydroSiblings && hydroSiblings.siblings.length > 0 && (
          <section className="bg-gray-900/50 rounded-xl border border-white/5 p-4">
            <h2 className="text-sm font-semibold text-gray-300 mb-1 flex items-center gap-2">
              <Waves className="w-4 h-4" />
              Site hydrométrique · {hydroSiblings.nb_stations} stations
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              {hydroSiblings.libelle_site || hydroSiblings.code_site}
              {hydroSiblings.nom_cours_eau ? ` · ${hydroSiblings.nom_cours_eau}` : ''}
            </p>
            <div className="space-y-1">
              {hydroSiblings.siblings.map(sib => (
                <Link
                  key={sib.code_station}
                  to={`/station/hydro/${sib.code_station}`}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-bg-hover transition-colors"
                >
                  <div>
                    <span className="text-xs text-gray-200">{sib.libelle_station || sib.code_station}</span>
                    <span className="text-[10px] text-gray-500 ml-2">{sib.code_station}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {sib.grandeur_hydro_principale && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        sib.grandeur_hydro_principale.startsWith('Q')
                          ? 'bg-accent-cyan/20 text-accent-cyan'
                          : 'bg-accent-indigo/20 text-accent-indigo'
                      }`}>
                        {sib.grandeur_hydro_principale.startsWith('Q') ? 'Débit' : 'Hauteur'}
                      </span>
                    )}
                    {sib.classification && (
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: CLASSIFICATION_COLORS[sib.classification] ?? '#6b7280' }}
                        title={sib.classification}
                      />
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* KPI Cards */}
        <StationKPICards station={station} type={type} />

        {/* Resolution selector */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-text-secondary font-medium">Résolution :</span>
          <div role="group" aria-label="Résolution temporelle" className="flex gap-1">
            {RESOLUTION_OPTIONS
              .filter((opt) => {
                if (opt.value === 'monthly') {
                  const loading = isPiezo ? piezoMonthlyLoading : hydroMonthlyLoading
                  if (loading) return true // show while loading
                  return (monthly?.length ?? 0) > 0
                }
                return true // daily and yearly always shown
              })
              .map((opt) => (
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
              precipKey={resolution === 'yearly' ? 'precipitation_totale_annuelle' : 'precipitation_totale'}
              percentiles={resolution === 'yearly' ? undefined : percentiles}
              resolution={resolution}
            />
          </div>
        ) : (
          <div className="bg-bg-card border border-white/5 rounded-xl p-5 flex items-center justify-center h-64 text-text-secondary text-sm">
            Aucune donnée pour cette résolution
          </div>
        )}

        {/* Drought Indices (SPLI/SSFI + SPI) */}
        {(droughtData && droughtData.length > 0) || (spiData && spiData.length > 0) ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {droughtData && droughtData.length > 0 && (
              <div className="bg-bg-card border border-white/5 rounded-xl p-5">
                <DroughtIndexChart
                  data={droughtData}
                  indexKey={isPiezo ? 'spli' : 'ssfi'}
                  label={isPiezo ? 'Indice piézométrique standardisé (SPLI/IPS)' : 'Indice de débit (SSFI)'}
                />
              </div>
            )}
            {spiData && spiData.length > 0 && (
              <div className="bg-bg-card border border-white/5 rounded-xl p-5">
                <DroughtIndexChart
                  data={spiData}
                  indexKey="spi"
                  label="Indice de précipitation (SPI)"
                />
              </div>
            )}
          </div>
        ) : null}

      </div>
    </div>
  )
}
