import { useRef, useEffect, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { CLASSIFICATION_COLORS } from '../../lib/constants'

const FRANCE_CENTER: [number, number] = [2.5, 46.5]
const FRANCE_ZOOM = 5.5
const DEFAULT_COLOR = '#6b7280'

interface Props {
  piezoStations?: any[]
  hydroStations?: any[]
  showPiezo?: boolean
  showHydro?: boolean
  onStationClick?: (station: any, type: 'piezo' | 'hydro') => void
}

function stationsToGeoJSON(stations: any[], classificationKey: string) {
  return {
    type: 'FeatureCollection' as const,
    features: stations
      .filter((s) => s.longitude != null && s.latitude != null)
      .map((s, i) => ({
        type: 'Feature' as const,
        id: i,
        geometry: {
          type: 'Point' as const,
          coordinates: [s.longitude, s.latitude],
        },
        properties: {
          _index: i,
          classification: s[classificationKey] ?? 'UNKNOWN',
        },
      })),
  }
}

function buildColorExpression(): maplibregl.ExpressionSpecification {
  return [
    'match',
    ['get', 'classification'],
    'TRES_BAS', CLASSIFICATION_COLORS.TRES_BAS,
    'BAS', CLASSIFICATION_COLORS.BAS,
    'NORMAL', CLASSIFICATION_COLORS.NORMAL,
    'HAUT', CLASSIFICATION_COLORS.HAUT,
    'TRES_HAUT', CLASSIFICATION_COLORS.TRES_HAUT,
    DEFAULT_COLOR,
  ]
}

export function ObservatoryMap({
  piezoStations,
  hydroStations,
  showPiezo = true,
  showHydro = true,
  onStationClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const mapLoadedRef = useRef(false)
  const piezoDataRef = useRef<any[]>()
  const hydroDataRef = useRef<any[]>()
  const onStationClickRef = useRef(onStationClick)
  onStationClickRef.current = onStationClick

  piezoDataRef.current = piezoStations
  hydroDataRef.current = hydroStations

  const updateSource = useCallback((map: maplibregl.Map, sourceId: string, stations: any[] | undefined, classificationKey: string) => {
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
    if (source) {
      source.setData(stations?.length ? stationsToGeoJSON(stations, classificationKey) as any : { type: 'FeatureCollection', features: [] })
    }
  }, [])

  // Init map
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

    map.on('load', () => {
      mapLoadedRef.current = true

      // Piezo source + layer
      map.addSource('piezo-stations', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'piezo-circles',
        type: 'circle',
        source: 'piezo-stations',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2, 8, 5, 12, 8],
          'circle-color': buildColorExpression(),
          'circle-opacity': 0.8,
        },
      })

      // Hydro source + layer
      map.addSource('hydro-stations', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'hydro-circles',
        type: 'circle',
        source: 'hydro-stations',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 8, 6, 12, 10],
          'circle-color': buildColorExpression(),
          'circle-opacity': 0.8,
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.3)',
        },
      })

      // Populate with any data that already loaded
      if (piezoDataRef.current?.length) {
        updateSource(map, 'piezo-stations', piezoDataRef.current, 'classification_derniere_annee')
      }
      if (hydroDataRef.current?.length) {
        updateSource(map, 'hydro-stations', hydroDataRef.current, 'classification_resultat_dern_annee')
      }

      // Click handlers
      map.on('click', 'piezo-circles', (e) => {
        if (!e.features?.length || !piezoDataRef.current) return
        const idx = e.features[0].properties?._index
        const station = piezoDataRef.current[idx]
        if (station && onStationClickRef.current) onStationClickRef.current(station, 'piezo')
      })
      map.on('click', 'hydro-circles', (e) => {
        if (!e.features?.length || !hydroDataRef.current) return
        const idx = e.features[0].properties?._index
        const station = hydroDataRef.current[idx]
        if (station && onStationClickRef.current) onStationClickRef.current(station, 'hydro')
      })

      // Cursor
      map.on('mouseenter', 'piezo-circles', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'piezo-circles', () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', 'hydro-circles', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'hydro-circles', () => { map.getCanvas().style.cursor = '' })
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      mapLoadedRef.current = false
    }
  }, [updateSource])

  // Update piezo data
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return
    updateSource(mapRef.current, 'piezo-stations', piezoStations, 'classification_derniere_annee')
  }, [piezoStations, updateSource])

  // Update hydro data
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return
    updateSource(mapRef.current, 'hydro-stations', hydroStations, 'classification_resultat_dern_annee')
  }, [hydroStations, updateSource])

  // Toggle visibility
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return
    const map = mapRef.current
    if (map.getLayer('piezo-circles')) {
      map.setLayoutProperty('piezo-circles', 'visibility', showPiezo ? 'visible' : 'none')
    }
    if (map.getLayer('hydro-circles')) {
      map.setLayoutProperty('hydro-circles', 'visibility', showHydro ? 'visible' : 'none')
    }
  }, [showPiezo, showHydro])

  return <div ref={containerRef} className="w-full h-full" />
}
