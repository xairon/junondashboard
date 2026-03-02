import { Link } from 'react-router-dom'
import { X, ExternalLink } from 'lucide-react'
import { ClassificationBadge } from '../station/ClassificationBadge'
import { formatNumber } from '../../lib/utils'

interface Props {
  station: any
  type: 'piezo' | 'hydro'
  onClose: () => void
}

export function StationPopup({ station, type, onClose }: Props) {
  const name = type === 'piezo'
    ? (station.nom_commune || station.code_bss)
    : (station.libelle_station || station.code_station)

  const code = type === 'piezo' ? station.code_bss : station.code_station
  const classification = type === 'piezo'
    ? station.classification_derniere_annee
    : station.classification_resultat_dern_annee

  const value = type === 'piezo'
    ? station.niveau_derniere_annee
    : station.resultat_moyen_global

  const unit = type === 'piezo' ? 'm NGF' : 'm³/s'
  const dept = station.nom_departement ?? station.code_departement ?? ''

  return (
    <div role="dialog" aria-label={`Station ${station.code_bss || station.code_station}`} className="absolute bottom-20 left-4 z-10 bg-bg-card border border-white/10 rounded-xl shadow-2xl p-4 w-[calc(100%-2rem)] sm:w-80 backdrop-blur-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-accent-cyan font-medium uppercase tracking-wide mb-1">
            {type === 'piezo' ? 'Piézométrie' : 'Hydrométrie'}
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

      <Link
        to={`/station/${type}/${code}`}
        className="flex items-center gap-1.5 text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors"
      >
        Voir les détails <ExternalLink className="w-3 h-3" />
      </Link>
    </div>
  )
}
