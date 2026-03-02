import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { CLASSIFICATION_COLORS } from '../../lib/constants'

export function KPIBar() {
  const { data: stats } = useQuery({
    queryKey: ['stats', 'national'],
    queryFn: api.stats.national,
  })

  if (!stats) return null

  const piezoItems = [
    { label: 'Piezo', value: stats.total_piezo?.toLocaleString('fr-FR'), color: '#06b6d4' },
    { label: 'Tres bas', value: stats.piezo_tres_bas?.toLocaleString('fr-FR'), color: CLASSIFICATION_COLORS.TRES_BAS },
    { label: 'Bas', value: stats.piezo_bas?.toLocaleString('fr-FR'), color: CLASSIFICATION_COLORS.BAS },
    { label: 'Normal', value: stats.piezo_normal?.toLocaleString('fr-FR'), color: CLASSIFICATION_COLORS.NORMAL },
    { label: 'Haut', value: stats.piezo_haut?.toLocaleString('fr-FR'), color: CLASSIFICATION_COLORS.HAUT },
    { label: 'Tres haut', value: stats.piezo_tres_haut?.toLocaleString('fr-FR'), color: CLASSIFICATION_COLORS.TRES_HAUT },
  ]

  // Build hydro items - show classification breakdown if available, otherwise just total
  const hasHydroClassif = stats.hydro_tres_bas != null || stats.hydro_bas != null
  const hydroItems = hasHydroClassif
    ? [
        { label: 'Hydro', value: stats.total_hydro?.toLocaleString('fr-FR'), color: '#6366f1' },
        { label: 'Tres bas', value: (stats.hydro_tres_bas ?? 0).toLocaleString('fr-FR'), color: CLASSIFICATION_COLORS.TRES_BAS },
        { label: 'Bas', value: (stats.hydro_bas ?? 0).toLocaleString('fr-FR'), color: CLASSIFICATION_COLORS.BAS },
        { label: 'Normal', value: (stats.hydro_normal ?? 0).toLocaleString('fr-FR'), color: CLASSIFICATION_COLORS.NORMAL },
        { label: 'Haut', value: (stats.hydro_haut ?? 0).toLocaleString('fr-FR'), color: CLASSIFICATION_COLORS.HAUT },
        { label: 'Tres haut', value: (stats.hydro_tres_haut ?? 0).toLocaleString('fr-FR'), color: CLASSIFICATION_COLORS.TRES_HAUT },
      ]
    : [
        { label: 'Stations hydrometriques', value: stats.total_hydro?.toLocaleString('fr-FR'), color: '#6366f1' },
      ]

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 bg-bg-card/90 backdrop-blur-md border-t border-white/5">
      {/* Piezo row */}
      <div className="flex items-center justify-center gap-4 md:gap-6 px-4 py-1.5 flex-wrap">
        {piezoItems.map((item) => (
          <div key={`piezo-${item.label}`} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-[10px] md:text-xs text-text-secondary whitespace-nowrap">{item.label}</span>
            <span className="text-xs md:text-sm font-semibold text-text-primary font-mono">{item.value}</span>
          </div>
        ))}
      </div>
      {/* Hydro row */}
      <div className="flex items-center justify-center gap-4 md:gap-6 px-4 py-1.5 border-t border-white/5 flex-wrap">
        {hydroItems.map((item) => (
          <div key={`hydro-${item.label}`} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-[10px] md:text-xs text-text-secondary whitespace-nowrap">{item.label}</span>
            <span className="text-xs md:text-sm font-semibold text-text-primary font-mono">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
