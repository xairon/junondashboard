import { Link } from 'react-router-dom'
import { X, ExternalLink, Calendar, Database, Mountain } from 'lucide-react'
import { ClassificationBadge } from '../station/ClassificationBadge'
import { formatNumber } from '../../lib/utils'
import { usePiezoStationDetail, useHydroStationDetail, useBdlisaLookup } from '../../hooks/useStations'

interface Props {
  code: string
  type: 'piezo' | 'hydro'
  onClose: () => void
}

function formatPeriod(start?: string | null, end?: string | null): string {
  if (!start && !end) return '—'
  const fmt = (d: string) => new Date(d).getFullYear().toString()
  if (start && end) return `${fmt(start)} – ${fmt(end)}`
  if (end) return `jusqu'en ${fmt(end)}`
  return `depuis ${fmt(start!)}`
}

function formatCount(n?: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString('fr-FR')
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
      <div className="space-y-2">
        <div className="h-6 w-20 bg-white/10 rounded animate-pulse" />
        <div className="h-3 w-full bg-white/10 rounded animate-pulse" />
        <div className="h-3 w-3/4 bg-white/10 rounded animate-pulse" />
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

    const bdlisa = isPiezo ? bdlisaLookup((station as any).codes_bdlisa) : null
    const name = isPiezo
      ? ((station as any).nom_commune || (station as any).code_bss)
      : ((station as any).libelle_station || (station as any).code_station)
    const stationCode = isPiezo ? (station as any).code_bss : (station as any).code_station
    const classification = isPiezo
      ? (station as any).classification_derniere_annee
      : (station as any).classification_resultat_dern_annee
    const value = isPiezo
      ? (station as any).niveau_derniere_annee
      : (station as any).resultat_moyen_global
    const unit = isPiezo ? 'm NGF' : 'm³/s'
    const dept = (station as any).nom_departement ?? (station as any).code_departement ?? ''

    return (
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide ${
              isPiezo ? 'bg-accent-cyan/20 text-accent-cyan' : 'bg-accent-indigo/20 text-accent-indigo'
            }`}>
              {isPiezo ? 'Piézométrie' : 'Hydrométrie'}
            </span>
            <h3 className="text-base font-semibold text-text-primary mt-2 break-words">{name}</h3>
            <p className="text-xs text-text-secondary mt-0.5">{dept} &middot; {stationCode}</p>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="p-1 hover:bg-bg-hover rounded ml-2">
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        {/* Classification + value */}
        <div className="flex items-center gap-3 mb-4">
          <ClassificationBadge classification={classification} />
          {value != null && (
            <span className="text-sm text-text-primary font-mono">
              {formatNumber(value)} {unit}
            </span>
          )}
        </div>

        {/* Trend */}
        {(station as any).tendance_classification && (
          <p className="text-xs text-text-secondary mb-4">
            Tendance : <span className="text-text-primary font-medium">{(station as any).tendance_classification}</span>
          </p>
        )}

        {/* Metadata grid */}
        <div className="pt-3 border-t border-white/10 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-text-secondary mb-4">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{formatPeriod((station as any).premiere_mesure, (station as any).derniere_mesure)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{isPiezo
              ? `${formatCount((station as any).nb_mesures_total)} mesures`
              : `${formatCount((station as any).nb_jours_total ?? (station as any).nb_mois_total)} j.`
            }</span>
          </div>
          {isPiezo && (station as any).altitude_station != null && (
            <div className="flex items-center gap-1.5 col-span-2">
              <Mountain className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Alt. {((station as any).altitude_station as number).toFixed(0)} m NGF</span>
            </div>
          )}
          {(station as any).percentile_derniere_annee != null && (
            <div className="flex items-center gap-1.5 col-span-2">
              <span className="text-text-secondary">Percentile :</span>
              <span className="text-text-primary font-medium">{Math.round((station as any).percentile_derniere_annee)}e</span>
            </div>
          )}
          {(station as any).percentile_resultat_dern_annee != null && (
            <div className="flex items-center gap-1.5 col-span-2">
              <span className="text-text-secondary">Percentile :</span>
              <span className="text-text-primary font-medium">{Math.round((station as any).percentile_resultat_dern_annee)}e</span>
            </div>
          )}
        </div>

        {/* BDLISA */}
        {bdlisa?.nature && (
          <div className="pt-3 border-t border-white/10 flex items-center gap-2 text-xs text-text-secondary mb-4">
            <span>Nappe :</span>
            <span className="text-text-primary">{bdlisa.nature}</span>
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
