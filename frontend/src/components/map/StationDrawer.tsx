import { Link } from 'react-router-dom'
import { X, ExternalLink, TrendingUp, TrendingDown, Minus, Droplets, Waves } from 'lucide-react'
import { ClassificationBadge } from '../station/ClassificationBadge'
import { formatNumber, formatDate } from '../../lib/utils'
import { CLASSIFICATION_COLORS } from '../../lib/constants'
import { usePiezoStationDetail, useHydroStationDetail, useBdlisaLookup } from '../../hooks/useStations'

interface Props {
  code: string
  type: 'piezo' | 'hydro'
  onClose: () => void
}

const TREND_CONFIG: Record<string, { label: string; icon: typeof TrendingUp; color: string }> = {
  HAUSSE_FORTE:          { label: 'Hausse forte',          icon: TrendingUp,   color: '#3b82f6' },
  HAUSSE_SIGNIFICATIVE:  { label: 'Hausse significative',  icon: TrendingUp,   color: '#60a5fa' },
  STABLE:                { label: 'Stable',                icon: Minus,        color: '#10b981' },
  BAISSE_SIGNIFICATIVE:  { label: 'Baisse significative',  icon: TrendingDown, color: '#f97316' },
  BAISSE_FORTE:          { label: 'Baisse forte',          icon: TrendingDown, color: '#ef4444' },
}

function isRecent(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const ago = new Date()
  ago.setMonth(ago.getMonth() - 3)
  return d >= ago
}

function DrawerSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div className="p-4">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 space-y-2">
          <div className="h-3 w-16 bg-white/10 rounded animate-pulse" />
          <div className="h-5 w-40 bg-white/10 rounded animate-pulse" />
          <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
        </div>
        <button onClick={onClose} aria-label="Fermer" className="p-1 hover:bg-bg-hover rounded">
          <X className="w-4 h-4 text-text-secondary" />
        </button>
      </div>
      <div className="space-y-3">
        <div className="h-16 w-full bg-white/5 rounded-lg animate-pulse" />
        <div className="h-16 w-full bg-white/5 rounded-lg animate-pulse" />
        <div className="h-12 w-full bg-white/5 rounded-lg animate-pulse" />
      </div>
    </div>
  )
}

/** Compact labeled row */
function InfoRow({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <span className="text-xs text-text-secondary">{label}</span>
      <div className="text-right">
        <span className="text-xs text-text-primary font-medium">{value}</span>
        {sub && <div className="text-[10px] text-text-secondary">{sub}</div>}
      </div>
    </div>
  )
}

export function StationDrawer({ code, type, onClose }: Props) {
  const isPiezo = type === 'piezo'
  const piezoQuery = usePiezoStationDetail(isPiezo ? code : '')
  const hydroQuery = useHydroStationDetail(!isPiezo ? code : '')
  const { data: station, isLoading } = isPiezo ? piezoQuery : hydroQuery
  const bdlisaLookup = useBdlisaLookup()

  const content = (() => {
    if (isLoading || !station) return <DrawerSkeleton onClose={onClose} />

    const s = station as any
    const bdlisa = isPiezo ? bdlisaLookup(s.codes_bdlisa) : null
    const name = isPiezo
      ? (s.nom_commune || s.code_bss)
      : (s.libelle_station || s.code_station)
    const stationCode = isPiezo ? s.code_bss : s.code_station
    const dept = s.nom_departement ?? s.code_departement ?? ''

    // Classification & current value
    const classification = isPiezo ? s.classification_derniere_annee : s.classification_resultat_dern_annee
    const classColor = CLASSIFICATION_COLORS[classification] ?? '#6b7280'
    const currentValue = isPiezo ? s.niveau_derniere_annee : s.resultat_moyen_dern_annee
    const historicMean = isPiezo ? s.niveau_moyen_global : s.resultat_moyen_global
    const isHauteur = s.grandeur_hydro_principale === 'H'
    const unit = isPiezo ? 'm NGF' : (isHauteur ? 'm' : 'm³/s')

    // Trend
    const trendKey = s.tendance_classification
    const trendConf = trendKey ? TREND_CONFIG[trendKey] : null
    const slope = isPiezo ? s.slope_niveau : null

    // Min / Max
    const histMin = isPiezo ? s.niveau_min_absolu : s.resultat_min_global
    const histMax = isPiezo ? s.niveau_max_absolu : s.resultat_max_global

    // Activity
    const lastMeasure = s.derniere_mesure
    const recent = isRecent(lastMeasure)

    // Data volume
    const dataCount = isPiezo ? s.nb_mesures_total : s.nb_jours_total
    const dataPeriodYears = s.nb_mois_total ? Math.round(s.nb_mois_total / 12) : null

    return (
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide ${
                isPiezo ? 'bg-accent-cyan/20 text-accent-cyan' : 'bg-accent-indigo/20 text-accent-indigo'
              }`}>
                {isPiezo ? 'Piézomètre' : 'Hydrométrie'}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                recent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
              }`}>
                {recent ? 'Active' : 'Inactive'}
              </span>
            </div>
            <h3 className="text-base font-semibold text-text-primary mt-1.5 break-words leading-tight">{name}</h3>
            <p className="text-xs text-text-secondary mt-0.5">{dept} · {stationCode}</p>
            {!isPiezo && s.nom_cours_eau && (
              <p className="text-xs text-accent-indigo/80 mt-0.5 flex items-center gap-1">
                <Waves className="w-3 h-3" />
                {s.nom_cours_eau}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Fermer" className="p-1 hover:bg-bg-hover rounded ml-2 flex-shrink-0">
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        {/* ── Situation actuelle (active stations only) ── */}
        {recent ? (
          <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
            <div className="text-[10px] uppercase tracking-wider text-text-secondary mb-2">Situation actuelle</div>
            <div className="flex items-center justify-between">
              <ClassificationBadge classification={classification} />
              {currentValue != null && (
                <span className="text-lg font-semibold font-mono" style={{ color: classColor }}>
                  {formatNumber(currentValue)} <span className="text-xs text-text-secondary font-normal">{unit}</span>
                </span>
              )}
            </div>
            {historicMean != null && currentValue != null && (
              <div className="mt-2 text-[11px] text-text-secondary">
                Moy. historique : <span className="text-text-primary font-mono">{formatNumber(historicMean)}</span> {unit}
                <span className="ml-1.5">
                  ({currentValue > historicMean ? '+' : ''}{formatNumber(currentValue - historicMean, 2)} {unit})
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
            <div className="text-xs text-amber-400">
              Station inactive — dernière mesure le {formatDate(lastMeasure)}
            </div>
          </div>
        )}

        {/* ── Tendance (active stations only) ── */}
        {recent && trendConf && (
          <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
            <div className="text-[10px] uppercase tracking-wider text-text-secondary mb-2">Tendance</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <trendConf.icon className="w-4 h-4" style={{ color: trendConf.color }} />
                <span className="text-sm font-medium" style={{ color: trendConf.color }}>{trendConf.label}</span>
              </div>
              {slope != null && (
                <span className="text-xs font-mono text-text-primary">
                  {slope > 0 ? '+' : ''}{formatNumber(slope, 3)} m/an
                </span>
              )}
            </div>
            {s.nb_mois_tendance != null && (
              <div className="mt-1.5 text-[10px] text-text-secondary">
                Sur {s.nb_mois_tendance} mois
                {s.r2_niveau != null && <span> · R² = {formatNumber(s.r2_niveau, 2)}</span>}
                {s.qualite_tendance && <span> · {s.qualite_tendance}</span>}
              </div>
            )}
          </div>
        )}

        {/* ── Historique ── */}
        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
          <div className="text-[10px] uppercase tracking-wider text-text-secondary mb-2">Historique</div>
          <div className="divide-y divide-white/5">
            {histMin != null && histMax != null && (
              <InfoRow
                label="Amplitude"
                value={<><span className="font-mono">{formatNumber(histMin)}</span> — <span className="font-mono">{formatNumber(histMax)}</span> {unit}</>}
              />
            )}
            {isPiezo && s.profondeur_moyenne_globale != null && (
              <InfoRow label="Profondeur moy." value={<>{formatNumber(s.profondeur_moyenne_globale)} m</>} />
            )}
            {isPiezo && s.amplitude_totale != null && (
              <InfoRow label="Amplitude totale" value={<>{formatNumber(s.amplitude_totale)} m</>} />
            )}
            {!isPiezo && s.resultat_stddev_global != null && (
              <InfoRow label="Écart-type" value={<>{formatNumber(s.resultat_stddev_global, 2)} {unit}</>} />
            )}
            <InfoRow
              label="Dernière mesure"
              value={formatDate(lastMeasure)}
            />
            <InfoRow
              label="Données"
              value={<>{dataCount?.toLocaleString('fr-FR') ?? '—'} {isPiezo ? 'mesures' : 'jours'}</>}
              sub={dataPeriodYears ? `${dataPeriodYears} ans de recul` : undefined}
            />
          </div>
        </div>

        {/* ── Climat (piezo) ── */}
        {isPiezo && (s.temperature_moyenne_globale != null || s.precipitation_moyenne_mensuelle != null) && (
          <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
            <div className="text-[10px] uppercase tracking-wider text-text-secondary mb-2">Climat (ERA5)</div>
            <div className="divide-y divide-white/5">
              {s.temperature_moyenne_globale != null && (
                <InfoRow label="Température moy." value={<>{formatNumber(s.temperature_moyenne_globale)} °C</>} />
              )}
              {s.precipitation_moyenne_mensuelle != null && (
                <InfoRow label="Précipitations moy." value={<>{formatNumber(s.precipitation_moyenne_mensuelle)} mm/mois</>} />
              )}
            </div>
          </div>
        )}

        {/* ── Contexte hydrogéologique ── */}
        {(bdlisa?.nature || (isPiezo && s.codes_bdlisa) || (!isPiezo && s.code_cours_eau)) && (
          <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
            <div className="text-[10px] uppercase tracking-wider text-text-secondary mb-2">
              {isPiezo ? 'Hydrogéologie' : 'Réseau hydrographique'}
            </div>
            <div className="divide-y divide-white/5">
              {isPiezo && bdlisa?.nature && (
                <InfoRow label="Aquifère" value={bdlisa.nature} />
              )}
              {isPiezo && s.codes_bdlisa && (
                <InfoRow
                  label="Code BDLISA"
                  value={
                    <a href={`https://bdlisa.eaufrance.fr/hydrogeounit/${s.codes_bdlisa.split(',')[0]}`}
                       target="_blank" rel="noopener noreferrer"
                       className="text-accent-cyan hover:underline flex items-center gap-1">
                      {s.codes_bdlisa.split(',')[0]} <ExternalLink className="w-3 h-3" />
                    </a>
                  }
                />
              )}
              {isPiezo && s.altitude_station != null && (
                <InfoRow label="Altitude station" value={<>{s.altitude_station.toFixed(0)} m NGF</>} />
              )}
              {!isPiezo && s.nom_cours_eau && (
                <InfoRow label="Cours d'eau" value={s.nom_cours_eau} />
              )}
              {!isPiezo && s.code_cours_eau && (
                <InfoRow
                  label="Code Sandre"
                  value={
                    <a href={`https://services.sandre.eaufrance.fr/Courdo/Fiche/client/fiche_courdo.php?CdSandre=${s.code_cours_eau}`}
                       target="_blank" rel="noopener noreferrer"
                       className="text-accent-indigo hover:underline flex items-center gap-1">
                      {s.code_cours_eau} <ExternalLink className="w-3 h-3" />
                    </a>
                  }
                />
              )}
              {!isPiezo && s.grandeur_hydro_principale && (
                <InfoRow
                  label="Grandeur mesurée"
                  value={s.grandeur_hydro_principale === 'Q' ? 'Débit (Q)' : 'Hauteur (H)'}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Alerte (active stations only) ── */}
        {recent && s.niveau_alerte && (
          <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/20">
            <div className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-red-400" />
              <span className="text-xs font-medium text-red-400">Alerte : {s.niveau_alerte}</span>
            </div>
          </div>
        )}

        {/* Link to detail page */}
        <Link
          to={`/station/${type}/${stationCode}`}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/20 transition-colors"
        >
          Voir les détails <ExternalLink className="w-4 h-4" />
        </Link>
      </div>
    )
  })()

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-30"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-label={`Station ${code}`}
        className="absolute top-0 left-0 h-full z-30 w-full sm:w-80 bg-bg-card border-r border-white/10 shadow-2xl transition-transform duration-200 ease-out overflow-y-auto translate-x-0"
      >
        {content}
      </div>
    </>
  )
}
