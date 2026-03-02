import { useRef, useEffect } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { ScatterplotLayer } from '@deck.gl/layers'
import { CLASSIFICATION_COLORS } from '../../lib/constants'
import { useERA5Layer } from './ERA5Overlay'

const FRANCE_CENTER: [number, number] = [2.5, 46.5]
const FRANCE_ZOOM = 5.5

function hexToRgb(hex: string): [number, number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b, 200]
}

const DEFAULT_COLOR: [number, number, number, number] = [107, 114, 128, 150]

interface Props {
  piezoStations?: any[]
  hydroStations?: any[]
  showPiezo?: boolean
  showHydro?: boolean
  onStationClick?: (station: any, type: 'piezo' | 'hydro') => void
  era5Data?: any[]
  era5Variable?: 'total_precipitation' | 'temperature_2m'
  showERA5?: boolean
}

export function ObservatoryMap({
  piezoStations,
  hydroStations,
  showPiezo = true,
  showHydro = true,
  onStationClick,
  era5Data,
  era5Variable = 'total_precipitation',
  showERA5 = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)

  const era5Layer = useERA5Layer({
    data: era5Data,
    variable: era5Variable,
    visible: showERA5,
  })

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: FRANCE_CENTER,
      zoom: FRANCE_ZOOM,
      maxBounds: [[-10, 40], [15, 52]],
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    const overlay = new MapboxOverlay({ layers: [] })
    map.addControl(overlay as any)

    mapRef.current = map
    overlayRef.current = overlay

    return () => { map.remove() }
  }, [])

  useEffect(() => {
    if (!overlayRef.current) return

    const layers: any[] = []

    if (era5Layer) {
      layers.push(era5Layer)
    }

    if (showPiezo && piezoStations?.length) {
      layers.push(
        new ScatterplotLayer({
          id: 'piezo-stations',
          data: piezoStations,
          getPosition: (d: any) => [d.longitude, d.latitude],
          getFillColor: (d: any) => {
            const cls = d.classification_derniere_annee
            return cls && CLASSIFICATION_COLORS[cls] ? hexToRgb(CLASSIFICATION_COLORS[cls]) : DEFAULT_COLOR
          },
          getRadius: 4,
          radiusMinPixels: 3,
          radiusMaxPixels: 12,
          pickable: true,
          onClick: (info: any) => {
            if (info.object && onStationClick) onStationClick(info.object, 'piezo')
          },
          updateTriggers: {
            getFillColor: [piezoStations],
          },
        })
      )
    }

    if (showHydro && hydroStations?.length) {
      layers.push(
        new ScatterplotLayer({
          id: 'hydro-stations',
          data: hydroStations,
          getPosition: (d: any) => [d.longitude, d.latitude],
          getFillColor: (d: any) => {
            const cls = d.classification_resultat_dern_annee
            return cls && CLASSIFICATION_COLORS[cls] ? hexToRgb(CLASSIFICATION_COLORS[cls]) : DEFAULT_COLOR
          },
          getRadius: 5,
          radiusMinPixels: 3,
          radiusMaxPixels: 14,
          stroked: true,
          getLineColor: [255, 255, 255, 80],
          lineWidthMinPixels: 1,
          pickable: true,
          onClick: (info: any) => {
            if (info.object && onStationClick) onStationClick(info.object, 'hydro')
          },
          updateTriggers: {
            getFillColor: [hydroStations],
          },
        })
      )
    }

    overlayRef.current.setProps({ layers })
  }, [piezoStations, hydroStations, showPiezo, showHydro, onStationClick, era5Layer])

  return <div ref={containerRef} className="w-full h-full" />
}
