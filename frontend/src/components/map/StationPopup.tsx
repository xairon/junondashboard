import { Link } from 'react-router-dom'
import { X, ExternalLink, Calendar, Database, Mountain } from 'lucide-react'
import { ClassificationBadge } from '../station/ClassificationBadge'
import { formatNumber } from '../../lib/utils'

interface Props {
  station: any
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

export function StationPopup({ station, type, onClose }: Props) {
  const isPiezo = type === 'piezo'

  const name = isPiezo
    ? (station.nom_commune || station.code_bss)
    : (station.libelle_station || station.code_station)

  const code = isPiezo ? station.code_bss : station.code_station
  const classification = isPiezo
    ? station.classification_derniere_annee
    : station.classification_resultat_dern_annee

  const value = isPiezo
    ? station.niveau_derniere_annee
    : station.resultat_moyen_global

  const unit = isPiezo ? 'm NGF' : 'm³/s'
  const dept = station.nom_departement ?? station.code_departement ?? ''

  return (
    <div role="dialog" aria-label={`Station ${station.code_bss || station.code_station}`} className="absolute bottom-20 left-4 z-10 bg-bg-card border border-white/10 rounded-xl shadow-2xl p-4 w-[calc(100%-2rem)] sm:w-80 backdrop-blur-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-accent-cyan font-medium uppercase tracking-wide mb-1">
            {isPiezo ? 'Piézométrie' : 'Hydrométrie'}
          </p>
          <h3 className="text-sm font-semibold text-text-primary truncate">{name}</h3>
          <p className="text-xs text-text-secondary">{dept} &middot; {code}</p>
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

      {station.tendance_classification && (
        <p className="text-xs text-text-secondary mb-3">
          Tendance: <span className="text-text-primary">{station.tendance_classification}</span>
        </p>
      )}

      <div className="mt-2 pt-2 border-t border-white/10 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-400 mb-3">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3 flex-shrink-0" />
          <span>{formatPeriod(station.premiere_mesure, station.derniere_mesure)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Database className="w-3 h-3 flex-shrink-0" />
          <span>{isPiezo
            ? `${formatCount(station.nb_mesures_total)} mesures`
            : `${formatCount(station.nb_jours_total ?? station.nb_mois_total)} j.`
          }</span>
        </div>
        {isPiezo && station.altitude_station != null && (
          <div className="flex items-center gap-1 col-span-2">
            <Mountain className="w-3 h-3 flex-shrink-0" />
            <span>Alt. {station.altitude_station.toFixed(0)} m NGF</span>
          </div>
        )}
        {station.percentile_derniere_annee != null && (
          <div className="flex items-center gap-1 col-span-2">
            <span className="text-gray-500">Percentile :</span>
            <span className="text-gray-200 font-medium">{Math.round(station.percentile_derniere_annee)}e</span>
          </div>
        )}
        {station.percentile_resultat_dern_annee != null && (
          <div className="flex items-center gap-1 col-span-2">
            <span className="text-gray-500">Percentile :</span>
            <span className="text-gray-200 font-medium">{Math.round(station.percentile_resultat_dern_annee)}e</span>
          </div>
        )}
      </div>

      <Link
        to={`/station/${type}/${code}`}
        className="flex items-center gap-1.5 text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors"
      >
        Voir les détails <ExternalLink className="w-3 h-3" />
      </Link>
    </div>
  )
}
