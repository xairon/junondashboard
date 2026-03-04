import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { WfsLayerId } from '@/lib/types'

export function useWfsLayer(layerId: WfsLayerId, enabled: boolean) {
  return useQuery({
    queryKey: ['wfs', layerId],
    queryFn: () => api.wfs.layer(layerId),
    enabled,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  })
}
