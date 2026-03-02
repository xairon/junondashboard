import { useMemo } from 'react'
import { HeatmapLayer } from '@deck.gl/aggregation-layers'

interface ERA5Point {
  latitude: number
  longitude: number
  temperature_2m: number | null
  total_precipitation: number | null
  potential_evaporation: number | null
}

interface Props {
  data?: ERA5Point[]
  variable: 'total_precipitation' | 'temperature_2m'
  visible: boolean
}

export function useERA5Layer({ data, variable, visible }: Props) {
  return useMemo(() => {
    if (!visible || !data?.length) return null

    return new HeatmapLayer({
      id: 'era5-heatmap',
      data,
      getPosition: (d: ERA5Point) => [d.longitude, d.latitude],
      getWeight: (d: ERA5Point) => {
        const val = d[variable]
        if (val == null) return 0
        if (variable === 'total_precipitation') return Math.max(0, val * 1000)
        return Math.max(0, val - 260)
      },
      radiusPixels: 60,
      intensity: variable === 'total_precipitation' ? 1.5 : 1,
      threshold: 0.05,
      colorRange: variable === 'total_precipitation'
        ? [
            [255, 255, 204],
            [161, 218, 180],
            [65, 182, 196],
            [44, 127, 184],
            [37, 52, 148],
            [8, 29, 88],
          ]
        : [
            [69, 117, 180],
            [145, 191, 219],
            [224, 243, 248],
            [254, 224, 144],
            [252, 141, 89],
            [215, 48, 39],
          ],
      opacity: 0.4,
      aggregation: 'MEAN',
    })
  }, [data, variable, visible])
}
