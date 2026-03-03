import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { CLASSIFICATION_COLORS, CLASSIFICATION_LABELS } from '../../lib/constants'
import type { StationGeoJSONFeature } from '../../lib/types'

const FRANCE_CENTER: [number, number] = [2.5, 46.5]
const FRANCE_ZOOM = 5.5
const DEFAULT_COLOR = '#6b7280'

interface Props {
  features?: StationGeoJSONFeature[]
  showPiezo?: boolean
  showHydro?: boolean
  onStationClick?: (code: string, type: 'piezo' | 'hydro') => void
  onDeptClick?: (code: string | null) => void
  era5Data?: any[]
  era5Variable?: 'total_precipitation' | 'temperature_2m'
  showERA5?: boolean
  activeCodeDepartement?: string
}

/* ------------------------------------------------------------------ */
/*  Legend overlay                                                     */
/* ------------------------------------------------------------------ */
function MapLegend({
  piezoCount,
  hydroCount,
  showPiezo,
  showHydro,
}: {
  piezoCount: number
  hydroCount: number
  showPiezo: boolean
  showHydro: boolean
}) {
  const legendItems: { key: string; label: string; color: string }[] = [
    { key: 'TRES_BAS', label: CLASSIFICATION_LABELS.TRES_BAS, color: CLASSIFICATION_COLORS.TRES_BAS },
    { key: 'BAS', label: CLASSIFICATION_LABELS.BAS, color: CLASSIFICATION_COLORS.BAS },
    { key: 'NORMAL', label: CLASSIFICATION_LABELS.NORMAL, color: CLASSIFICATION_COLORS.NORMAL },
    { key: 'HAUT', label: CLASSIFICATION_LABELS.HAUT, color: CLASSIFICATION_COLORS.HAUT },
    { key: 'TRES_HAUT', label: CLASSIFICATION_LABELS.TRES_HAUT, color: CLASSIFICATION_COLORS.TRES_HAUT },
    { key: 'UNKNOWN', label: CLASSIFICATION_LABELS.UNKNOWN, color: DEFAULT_COLOR },
  ]

  const parts: string[] = []
  if (showPiezo && piezoCount > 0) parts.push(`${piezoCount.toLocaleString('fr-FR')} stations piézo`)
  if (showHydro && hydroCount > 0) parts.push(`${hydroCount.toLocaleString('fr-FR')} stations hydro`)

  return (
    <div className="absolute bottom-14 right-3 z-10 bg-gray-900/90 backdrop-blur-sm rounded-lg px-3 py-2.5 border border-white/10 select-none">
      <p className="text-[10px] font-semibold text-white/70 uppercase tracking-wider mb-1.5">Classification</p>
      <div className="space-y-1">
        {legendItems.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} aria-hidden="true" />
            <span className="text-[11px] text-white/80">{item.label}</span>
          </div>
        ))}
      </div>
      {parts.length > 0 && (
        <p className="text-[10px] text-white/50 mt-2 pt-1.5 border-t border-white/10">
          {parts.join(' + ')}
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  GeoJSON helpers                                                   */
/* ------------------------------------------------------------------ */
function featuresToGeoJSON(features: StationGeoJSONFeature[]) {
  return {
    type: 'FeatureCollection' as const,
    features: features
      .filter(f => f.geometry.coordinates[0] != null && f.geometry.coordinates[1] != null)
      .map(f => ({
        type: 'Feature' as const,
        geometry: f.geometry,
        properties: {
          code: f.properties.code,
          classification: f.properties.classification ?? 'UNKNOWN',
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

/* ------------------------------------------------------------------ */
/*  Cluster color: blend based on majority classification              */
/* ------------------------------------------------------------------ */
function buildClusterColorExpression(): maplibregl.ExpressionSpecification {
  // The cluster properties are aggregated counts per classification.
  // We pick the color of the classification with the highest count.
  // MapLibre cluster properties are flat; we inject them via clusterProperties.
  return [
    'case',
    ['>=', ['get', 'cnt_tres_bas'], ['max', ['get', 'cnt_bas'], ['get', 'cnt_normal'], ['get', 'cnt_haut'], ['get', 'cnt_tres_haut']]],
    CLASSIFICATION_COLORS.TRES_BAS,
    ['>=', ['get', 'cnt_bas'], ['max', ['get', 'cnt_normal'], ['get', 'cnt_haut'], ['get', 'cnt_tres_haut']]],
    CLASSIFICATION_COLORS.BAS,
    ['>=', ['get', 'cnt_normal'], ['max', ['get', 'cnt_haut'], ['get', 'cnt_tres_haut']]],
    CLASSIFICATION_COLORS.NORMAL,
    ['>=', ['get', 'cnt_haut'], ['get', 'cnt_tres_haut']],
    CLASSIFICATION_COLORS.HAUT,
    CLASSIFICATION_COLORS.TRES_HAUT,
  ]
}

/* ------------------------------------------------------------------ */
/*  Helper: add clustered source + layers for one station type        */
/* ------------------------------------------------------------------ */
function addClusteredSource(
  map: maplibregl.Map,
  sourceId: string,
  layerPrefix: string,
  strokeWidth: number,
  strokeColor: string,
) {
  const classMatch = (cls: string): maplibregl.ExpressionSpecification =>
    ['case', ['==', ['get', 'classification'], cls], 1, 0]

  map.addSource(sourceId, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50,
    clusterProperties: {
      cnt_tres_bas: ['+', classMatch('TRES_BAS')],
      cnt_bas: ['+', classMatch('BAS')],
      cnt_normal: ['+', classMatch('NORMAL')],
      cnt_haut: ['+', classMatch('HAUT')],
      cnt_tres_haut: ['+', classMatch('TRES_HAUT')],
    },
  })

  // Cluster circles - size proportional to point_count
  map.addLayer({
    id: `${layerPrefix}-clusters`,
    type: 'circle',
    source: sourceId,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': buildClusterColorExpression(),
      'circle-radius': [
        'step', ['get', 'point_count'],
        14,   // < 10
        10, 18,  // 10-49
        50, 22,  // 50-199
        200, 28, // 200-999
        1000, 34,
      ],
      'circle-opacity': 0.75,
      'circle-stroke-width': 2,
      'circle-stroke-color': 'rgba(255,255,255,0.2)',
    },
  })

  // Cluster count label
  map.addLayer({
    id: `${layerPrefix}-cluster-count`,
    type: 'symbol',
    source: sourceId,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['Open Sans Bold'],
      'text-size': 11,
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': '#ffffff',
    },
  })

  // Unclustered individual points
  map.addLayer({
    id: `${layerPrefix}-unclustered`,
    type: 'circle',
    source: sourceId,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 8, 5, 12, 8],
      'circle-color': buildColorExpression(),
      'circle-opacity': 0.85,
      'circle-stroke-width': strokeWidth,
      'circle-stroke-color': strokeColor,
    },
  })
}

/* ------------------------------------------------------------------ */
/*  ERA5 heatmap as native MapLibre layer                             */
/* ------------------------------------------------------------------ */
function era5ToGeoJSON(data: any[], variable: string) {
  return {
    type: 'FeatureCollection' as const,
    features: data
      .filter((d) => d[variable] != null)
      .map((d) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [d.longitude, d.latitude],
        },
        properties: {
          weight: variable === 'total_precipitation'
            ? Math.max(0, (d[variable] ?? 0) * 1000)
            : Math.max(0, (d[variable] ?? 0) - 273.15),
        },
      })),
  }
}

/* ------------------------------------------------------------------ */
/*  Bounding box utility                                              */
/* ------------------------------------------------------------------ */
function computeBbox(geometry: any): [number, number, number, number] {
  const coords: number[][] = []
  const collect = (g: any) => {
    if (g.type === 'Point') coords.push(g.coordinates)
    else if (g.type === 'Polygon') g.coordinates[0].forEach((c: number[]) => coords.push(c))
    else if (g.type === 'MultiPolygon') g.coordinates.forEach((p: number[][][]) => p[0].forEach((c: number[]) => coords.push(c)))
  }
  collect(geometry)
  const lons = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */
export function ObservatoryMap({
  features,
  showPiezo = true,
  showHydro = true,
  onStationClick,
  onDeptClick,
  era5Data,
  era5Variable = 'total_precipitation',
  showERA5 = false,
  activeCodeDepartement = undefined,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const mapLoadedRef = useRef(false)

  const featuresRef = useRef<StationGeoJSONFeature[]>([])
  featuresRef.current = features ?? []

  const onStationClickRef = useRef(onStationClick)
  onStationClickRef.current = onStationClick

  const onDeptClickRef = useRef(onDeptClick)
  onDeptClickRef.current = onDeptClick

  const [tooltip, setTooltip] = useState<{ name: string; x: number; y: number } | null>(null)

  const activeCodeDeptRef = useRef<string | undefined>(activeCodeDepartement)

  const updateSource = useCallback((map: maplibregl.Map, sourceId: string, feats: StationGeoJSONFeature[]) => {
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
    if (source) {
      source.setData(feats.length ? featuresToGeoJSON(feats) as any : { type: 'FeatureCollection', features: [] })
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

    map.on('error', (e) => {
      console.error('MapLibre error:', e.error?.message ?? e)
    })

    map.on('load', () => {
      mapLoadedRef.current = true

      // --- Override basemap labels to French ---
      const style = map.getStyle()
      if (style?.layers) {
        style.layers.forEach((layer) => {
          if (layer.type === 'symbol') {
            const layout = (layer as maplibregl.SymbolLayerSpecification).layout
            if (layout?.['text-field']) {
              map.setLayoutProperty(layer.id, 'text-field', [
                'coalesce', ['get', 'name:fr'], ['get', 'name'],
              ])
            }
          }
        })
      }

      // --- Regions boundary layer ---
      fetch('/geo/regions.geojson')
        .then(r => r.json())
        .then(data => {
          if (map.getSource('regions')) return
          map.addSource('regions', { type: 'geojson', data, generateId: true })
          map.addLayer({
            id: 'regions-fill',
            type: 'fill',
            source: 'regions',
            maxzoom: 7,
            paint: {
              'fill-color': '#ffffff',
              'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.10, 0],
            },
          })
          map.addLayer({
            id: 'regions-line',
            type: 'line',
            source: 'regions',
            maxzoom: 7,
            paint: {
              'line-color': 'rgba(255,255,255,0.25)',
              'line-width': 1,
            },
          })

          // Hover regions
          let hoveredRegionId: number | null = null
          map.on('mousemove', 'regions-fill', (e) => {
            if (!e.features?.length) return
            const feat = e.features[0]
            if (hoveredRegionId !== null) map.setFeatureState({ source: 'regions', id: hoveredRegionId }, { hover: false })
            hoveredRegionId = feat.id as number
            map.setFeatureState({ source: 'regions', id: hoveredRegionId }, { hover: true })
            setTooltip({ name: feat.properties?.nom ?? '', x: e.point.x, y: e.point.y })
          })
          map.on('mouseleave', 'regions-fill', () => {
            if (hoveredRegionId !== null) map.setFeatureState({ source: 'regions', id: hoveredRegionId }, { hover: false })
            hoveredRegionId = null
            setTooltip(null)
          })

          // Click region → zoom to its bounding box
          map.on('click', 'regions-fill', (e) => {
            const feat = e.features?.[0]
            if (!feat) return
            const bbox = computeBbox(feat.geometry)
            map.fitBounds(bbox as maplibregl.LngLatBoundsLike, { padding: 60, duration: 500 })
          })

          map.on('mouseenter', 'regions-fill', () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', 'regions-fill', () => { map.getCanvas().style.cursor = '' })
        })

      // --- Departments boundary layer ---
      fetch('/geo/departments.geojson')
        .then(r => r.json())
        .then(data => {
          if (map.getSource('departments')) return
          map.addSource('departments', { type: 'geojson', data, generateId: true })

          map.addLayer({
            id: 'depts-fill',
            type: 'fill',
            source: 'departments',
            minzoom: 7,
            paint: {
              'fill-color': [
                'case',
                ['==', ['get', 'code'], activeCodeDeptRef.current ?? '$$NONE$$'],
                '#22d3ee',
                '#ffffff',
              ],
              'fill-opacity': [
                'case',
                ['==', ['get', 'code'], activeCodeDeptRef.current ?? '$$NONE$$'],
                0.15,
                ['boolean', ['feature-state', 'hover'], false],
                0.08,
                0,
              ],
            },
          })
          map.addLayer({
            id: 'depts-line',
            type: 'line',
            source: 'departments',
            minzoom: 7,
            paint: {
              'line-color': 'rgba(255,255,255,0.2)',
              'line-width': 0.8,
            },
          })

          // Hover departments
          let hoveredDeptId: number | null = null
          map.on('mousemove', 'depts-fill', (e) => {
            if (!e.features?.length) return
            const feat = e.features[0]
            if (hoveredDeptId !== null) map.setFeatureState({ source: 'departments', id: hoveredDeptId }, { hover: false })
            hoveredDeptId = feat.id as number
            map.setFeatureState({ source: 'departments', id: hoveredDeptId }, { hover: true })
            setTooltip({ name: `${feat.properties?.nom ?? ''} (${feat.properties?.code ?? ''})`, x: e.point.x, y: e.point.y })
          })
          map.on('mouseleave', 'depts-fill', () => {
            if (hoveredDeptId !== null) map.setFeatureState({ source: 'departments', id: hoveredDeptId }, { hover: false })
            hoveredDeptId = null
            setTooltip(null)
          })

          // Click department → filter stations or deselect
          map.on('click', 'depts-fill', (e) => {
            const code = e.features?.[0]?.properties?.code ?? null
            const current = activeCodeDeptRef.current
            onDeptClickRef.current?.(code === current ? null : code)
          })

          map.on('mouseenter', 'depts-fill', () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', 'depts-fill', () => { map.getCanvas().style.cursor = '' })
        })

      // --- ERA5 heatmap source + layer (under station layers) ---
      map.addSource('era5-heatmap', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'era5-heat',
        type: 'heatmap',
        source: 'era5-heatmap',
        paint: {
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.6, 9, 1.5],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 15, 9, 50],
          'heatmap-opacity': 0.45,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.1, '#ffffcc',
            0.3, '#a1dab4',
            0.5, '#41b6c4',
            0.7, '#2c7fb8',
            0.9, '#253494',
            1, '#081d58',
          ],
        },
        layout: {
          visibility: 'none',
        },
      })

      // --- Piezo clustered source + layers ---
      addClusteredSource(map, 'piezo-stations', 'piezo', 0, 'transparent')

      // --- Hydro clustered source + layers ---
      addClusteredSource(map, 'hydro-stations', 'hydro', 1, 'rgba(255,255,255,0.3)')

      // Populate with any data that already loaded
      const allFeatures = featuresRef.current
      const piezoFeats = allFeatures.filter(f => f.properties.type === 'piezo')
      const hydroFeats = allFeatures.filter(f => f.properties.type === 'hydro')
      if (piezoFeats.length) updateSource(map, 'piezo-stations', piezoFeats)
      if (hydroFeats.length) updateSource(map, 'hydro-stations', hydroFeats)

      // --- Click: expand cluster on click ---
      const handleClusterClick = (sourceId: string) => (e: maplibregl.MapMouseEvent) => {
        const features = e.features
        if (!features?.length) return
        const clusterId = features[0].properties?.cluster_id
        if (clusterId == null) return
        const source = map.getSource(sourceId) as maplibregl.GeoJSONSource
        source.getClusterExpansionZoom(clusterId).then((zoom) => {
          const coords = (features[0].geometry as any).coordinates
          map.easeTo({ center: coords, zoom: zoom + 0.5 })
        })
      }

      map.on('click', 'piezo-clusters', handleClusterClick('piezo-stations'))
      map.on('click', 'hydro-clusters', handleClusterClick('hydro-stations'))

      // --- Click: individual station ---
      map.on('click', 'piezo-unclustered', (e) => {
        const code = e.features?.[0]?.properties?.code
        if (code) onStationClickRef.current?.(code, 'piezo')
      })
      map.on('click', 'hydro-unclustered', (e) => {
        const code = e.features?.[0]?.properties?.code
        if (code) onStationClickRef.current?.(code, 'hydro')
      })

      // --- Cursor ---
      const pointerLayers = ['piezo-clusters', 'piezo-unclustered', 'hydro-clusters', 'hydro-unclustered']
      pointerLayers.forEach((layer) => {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
      })
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      mapLoadedRef.current = false
    }
  }, [updateSource])

  // Sync features changes to map sources
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return
    const map = mapRef.current
    const piezoFeats = (features ?? []).filter(f => f.properties.type === 'piezo')
    const hydroFeats = (features ?? []).filter(f => f.properties.type === 'hydro')
    updateSource(map, 'piezo-stations', piezoFeats)
    updateSource(map, 'hydro-stations', hydroFeats)
  }, [features, updateSource])

  // Toggle visibility
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return
    const map = mapRef.current
    const piezoLayers = ['piezo-clusters', 'piezo-cluster-count', 'piezo-unclustered']
    const hydroLayers = ['hydro-clusters', 'hydro-cluster-count', 'hydro-unclustered']
    piezoLayers.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', showPiezo ? 'visible' : 'none')
    })
    hydroLayers.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', showHydro ? 'visible' : 'none')
    })
  }, [showPiezo, showHydro])

  // ERA5 heatmap data + visibility
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return
    const map = mapRef.current

    // Update visibility
    if (map.getLayer('era5-heat')) {
      map.setLayoutProperty('era5-heat', 'visibility', showERA5 ? 'visible' : 'none')
    }

    // Update data
    if (showERA5 && era5Data?.length) {
      const source = map.getSource('era5-heatmap') as maplibregl.GeoJSONSource | undefined
      if (source) {
        source.setData(era5ToGeoJSON(era5Data, era5Variable) as any)
      }
    }
  }, [showERA5, era5Data, era5Variable])

  // Sync activeCodeDepartement to depts-fill paint properties
  useEffect(() => {
    activeCodeDeptRef.current = activeCodeDepartement
    if (!mapRef.current || !mapLoadedRef.current) return
    const map = mapRef.current
    if (!map.getLayer('depts-fill')) return
    map.setPaintProperty('depts-fill', 'fill-color', [
      'case',
      ['==', ['get', 'code'], activeCodeDepartement ?? '$$NONE$$'],
      '#22d3ee',
      '#ffffff',
    ])
    map.setPaintProperty('depts-fill', 'fill-opacity', [
      'case',
      ['==', ['get', 'code'], activeCodeDepartement ?? '$$NONE$$'],
      0.15,
      ['boolean', ['feature-state', 'hover'], false],
      0.08,
      0,
    ])
  }, [activeCodeDepartement])

  const piezoCount = useMemo(
    () => (features ?? []).filter(f => f.properties.type === 'piezo').length,
    [features]
  )
  const hydroCount = useMemo(
    () => (features ?? []).filter(f => f.properties.type === 'hydro').length,
    [features]
  )

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" role="application" aria-label="Carte interactive des stations hydrologiques de France" />
      <MapLegend
        piezoCount={piezoCount}
        hydroCount={hydroCount}
        showPiezo={showPiezo}
        showHydro={showHydro}
      />
      {tooltip && (
        <div
          className="absolute z-20 bg-gray-900/95 border border-white/10 rounded px-2 py-1 text-xs text-white pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          {tooltip.name}
        </div>
      )}
    </div>
  )
}
