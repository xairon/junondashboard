import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { CLASSIFICATION_COLORS } from '../../lib/constants'

export function KPIBar() {
  const { data: stats } = useQuery({
    queryKey: ['stats', 'national'],
    queryFn: api.stats.national,
  })

  if (!stats) return null

  const items = [
    { label: 'Stations piezo', value: stats.total_piezo?.toLocaleString('fr-FR'), color: '#06b6d4' },
    { label: 'Stations hydro', value: stats.total_hydro?.toLocaleString('fr-FR'), color: '#6366f1' },
    { label: 'Tres bas', value: stats.piezo_tres_bas?.toLocaleString('fr-FR'), color: CLASSIFICATION_COLORS.TRES_BAS },
    { label: 'Bas', value: stats.piezo_bas?.toLocaleString('fr-FR'), color: CLASSIFICATION_COLORS.BAS },
    { label: 'Normal', value: stats.piezo_normal?.toLocaleString('fr-FR'), color: CLASSIFICATION_COLORS.NORMAL },
    { label: 'Haut', value: stats.piezo_haut?.toLocaleString('fr-FR'), color: CLASSIFICATION_COLORS.HAUT },
    { label: 'Tres haut', value: stats.piezo_tres_haut?.toLocaleString('fr-FR'), color: CLASSIFICATION_COLORS.TRES_HAUT },
  ]

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 bg-bg-card/90 backdrop-blur-md border-t border-white/5">
      <div className="flex items-center justify-center gap-6 px-4 py-2.5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-text-secondary">{item.label}</span>
            <span className="text-sm font-semibold text-text-primary font-mono">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
