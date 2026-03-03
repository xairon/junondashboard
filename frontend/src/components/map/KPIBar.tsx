import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

export function KPIBar() {
  const { data: stats } = useQuery({
    queryKey: ['stats', 'national'],
    queryFn: api.stats.national,
  })

  if (!stats) return (
    <div className="absolute bottom-0 left-0 right-0 z-10 bg-bg-card/90 backdrop-blur-md border-t border-white/5">
      <div className="flex gap-6 animate-pulse px-4 py-2 justify-center">
        {[...Array(2)].map((_, i) => <div key={i} className="h-4 bg-gray-700 rounded w-24" />)}
      </div>
    </div>
  )

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 bg-bg-card/90 backdrop-blur-md border-t border-white/5">
      <div className="flex items-center justify-center gap-6 px-4 py-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full shrink-0 bg-accent-cyan" aria-hidden="true" />
          <span className="text-xs text-text-secondary">Piézo</span>
          <span className="text-sm font-semibold text-text-primary font-mono">{stats.total_piezo?.toLocaleString('fr-FR')}</span>
        </div>
        <span className="text-white/20">•</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full shrink-0 bg-accent-indigo" aria-hidden="true" />
          <span className="text-xs text-text-secondary">Hydro</span>
          <span className="text-sm font-semibold text-text-primary font-mono">{stats.total_hydro?.toLocaleString('fr-FR')}</span>
        </div>
      </div>
    </div>
  )
}
