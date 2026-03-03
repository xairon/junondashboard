import { Link } from 'react-router-dom'
import { X, ExternalLink, Calendar, Database, Mountain } from 'lucide-react'
import { ClassificationBadge } from '../station/ClassificationBadge'
import { formatNumber } from '../../lib/utils'
import { usePiezoStationDetail, useHydroStationDetail } from '../../hooks/useStations'

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

function PopupSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div role="dialog" className="absolute bottom-20 left-4 z-10 bg-bg-card border border-white/10 rounded-xl shadow-2xl p-4 w-[calc(100%-2rem)] sm:w-80 backdrop-blur-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 space-y-2">
          <div className="h-3 w-16 bg-white/10 rounded animate-pulse" />
          <div className="h-4 w-40 bg-white/10 rounded animate-pulse" />
          <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
        </div>
        <button onClick={onClose} aria-label="Fermer" className="p-1 hover:bg-bg-hover rounded">
          <X className="w-4 h-4 text-text-secondary" />
        </button>
      </div>
      <div className="space-y-2">
        <div className="h-5 w-20 bg-white/10 rounded animate-pulse" />
        <div className="h-3 w-full bg-white/10 rounded animate-pulse" />
        <div className="h-3 w-3/4 bg-white/10 rounded animate-pulse" />
      </div>
    </div>
  )
}

export function StationPopup({ code, type, onClose }: Props) {
  const isPiezo = type === 'piezo'
  const piezoQuery = usePiezoStationDetail(isPiezo ? code : '')
  const hydroQuery = useHydroStationDetail(!isPiezo ? code : '')
  const { data: station, isLoading } = isPiezo ? piezoQuery : hydroQuery

  if (isLoading || !station) return <PopupSkeleton onClose={onClose} />

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
    <div role="dialog" aria-label={`Station ${stationCode}`} className="absolute bottom-20 left-4 z-10 bg-bg-card border border-white/10 rounded-xl shadow-2xl p-4 w-[calc(100%-2rem)] sm:w-80 backdrop-blur-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-accent-cyan font-medium uppercase tracking-wide mb-1">
            {isPiezo ? 'Piézométrie' : 'Hydrométrie'}
          </p>
          <h3 className="text-sm font-semibold text-text-primary truncate">{name}</h3>
          <p className="text-xs text-text-secondary">{dept} &middot; {stationCode}</p>
        </div>
        <button onClick={onClose} aria-label="Fermer" className="p-1 hover:bg-bg-hover rounded">
          <X className="w-4 h-4 text-text-secondary" />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <ClassificationBadge classification={classification} />
        {value != null && (
          <span className="text-sm text-text-primary font-mono">
            {formatNumber(value)} {unit}
          </span>
        )}
      </div>

      {(station as any).tendance_classification && (
        <p className="text-xs text-text-secondary mb-3">
          Tendance: <span className="text-text-primary">{(station as any).tendance_classification}</span>
        </p>
      )}

      <div className="mt-2 pt-2 border-t border-white/10 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-400 mb-3">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3 flex-shrink-0" />
          <span>{formatPeriod((station as any).premiere_mesure, (station as any).derniere_mesure)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Database className="w-3 h-3 flex-shrink-0" />
          <span>{isPiezo
            ? `${formatCount((station as any).nb_mesures_total)} mesures`
            : `${formatCount((station as any).nb_jours_total ?? (station as any).nb_mois_total)} j.`
          }</span>
        </div>
        {isPiezo && (station as any).altitude_station != null && (
          <div className="flex items-center gap-1 col-span-2">
            <Mountain className="w-3 h-3 flex-shrink-0" />
            <span>Alt. {((station as any).altitude_station as number).toFixed(0)} m NGF</span>
          </div>
        )}
        {(station as any).percentile_derniere_annee != null && (
          <div className="flex items-center gap-1 col-span-2">
            <span className="text-gray-500">Percentile :</span>
            <span className="text-gray-200 font-medium">{Math.round((station as any).percentile_derniere_annee)}e</span>
          </div>
        )}
        {(station as any).percentile_resultat_dern_annee != null && (
          <div className="flex items-center gap-1 col-span-2">
            <span className="text-gray-500">Percentile :</span>
            <span className="text-gray-200 font-medium">{Math.round((station as any).percentile_resultat_dern_annee)}e</span>
          </div>
        )}
      </div>

      <Link
        to={`/station/${type}/${stationCode}`}
        className="flex items-center gap-1.5 text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors"
      >
        Voir les détails <ExternalLink className="w-3 h-3" />
      </Link>
    </div>
  )
}
