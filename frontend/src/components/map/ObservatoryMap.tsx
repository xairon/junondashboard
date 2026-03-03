import { useRef, useEffect, useCallback, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { StationGeoJSONFeature } from '../../lib/types'

const FRANCE_CENTER: [number, number] = [2.5, 46.5]
const FRANCE_ZOOM = 5.5

// BDLISA aquifer nature colors
const BDLISA_NATURE_COLORS: Record<string, string> = {
  'LIBRE':          '#22d3ee', // cyan — free aquifer
  'CAPTIF':         '#3b82f6', // blue — confined
  'MULTICOUCHE':    '#a78bfa', // violet — multilayer
  'INDIFFERENCIE':  '#94a3b8', // gray — undifferentiated
}

// SANDRE hydrological district colors (CdBH values from bassins.geojson)
const SANDRE_DISTRICT_COLORS: Record<string, string> = {
  'A':  '#64748b', // Escaut-Somme — slate
  'B1': '#f97316', // Meuse — orange
  'C':  '#a78bfa', // Rhin — violet
  'D':  '#ef4444', // Rhône-Méditerranée — red
  'E':  '#ec4899', // Corse — pink
  'F':  '#22c55e', // Adour-Garonne — green
  'G':  '#eab308', // Loire-Bretagne — yellow
  'H':  '#3b82f6', // Seine-Normandie — blue
}

interface Props {
  features?: StationGeoJSONFeature[]
  showPiezo?: boolean
  showHydro?: boolean
  onStationClick?: (code: string, type: 'piezo' | 'hydro') => void
  onDeptClick?: (code: string | null) => void
  activeCodeDepartement?: string
  showRegions?: boolean
  showDepts?: boolean
  showBdlisa?: boolean
  showSandre?: boolean
  onBdlisaClick?: (code: string | null) => void
  onBassinClick?: (code: string | null) => void
  activeCodeBdlisa?: string
  activeCodeBassin?: string
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
          type: f.properties.type,
        },
      })),
  }
}

function buildColorExpression(): maplibregl.ExpressionSpecification {
  return ['match', ['get', 'type'], 'piezo', '#22d3ee', 'hydro', '#6366f1', '#6b7280']
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
  pointColor: string,
  clusterColor: string,
) {
  map.addSource(sourceId, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50,
  })

  // Cluster circles - size proportional to point_count
  map.addLayer({
    id: `${layerPrefix}-clusters`,
    type: 'circle',
    source: sourceId,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': clusterColor,
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
      'circle-color': pointColor,
      'circle-opacity': 0.85,
      'circle-stroke-width': strokeWidth,
      'circle-stroke-color': strokeColor,
    },
  })
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
  activeCodeDepartement = undefined,
  showRegions = false,
  showDepts = false,
  showBdlisa = false,
  showSandre = false,
  onBdlisaClick,
  onBassinClick,
  activeCodeBdlisa,
  activeCodeBassin,
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

  // Keep refs for Task 12 callbacks (not yet wired to map events, but available)
  const onBdlisaClickRef = useRef(onBdlisaClick)
  onBdlisaClickRef.current = onBdlisaClick

  const onBassinClickRef = useRef(onBassinClick)
  onBassinClickRef.current = onBassinClick

  const activeCodeBdlisaRef = useRef(activeCodeBdlisa)
  activeCodeBdlisaRef.current = activeCodeBdlisa

  const activeCodeBassinRef = useRef(activeCodeBassin)
  activeCodeBassinRef.current = activeCodeBassin

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

      // --- Regions boundary layer (hidden by default, controlled by Calques panel) ---
      fetch('/geo/regions.geojson')
        .then(r => r.json())
        .then(data => {
          if (map.getSource('regions')) return
          map.addSource('regions', { type: 'geojson', data, generateId: true })
          map.addLayer({
            id: 'regions-fill',
            type: 'fill',
            source: 'regions',
            paint: {
              'fill-color': '#ffffff',
              'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.10, 0],
            },
            layout: { visibility: 'none' },
          }, 'piezo-clusters')
          map.addLayer({
            id: 'regions-line',
            type: 'line',
            source: 'regions',
            paint: {
              'line-color': 'rgba(255,255,255,0.25)',
              'line-width': 1,
            },
            layout: { visibility: 'none' },
          }, 'piezo-clusters')

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

      // --- Departments boundary layer (hidden by default, controlled by Calques panel) ---
      fetch('/geo/departments.geojson')
        .then(r => r.json())
        .then(data => {
          if (map.getSource('departments')) return
          map.addSource('departments', { type: 'geojson', data, generateId: true })

          map.addLayer({
            id: 'depts-fill',
            type: 'fill',
            source: 'departments',
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
            layout: { visibility: 'none' },
          }, 'piezo-clusters')
          map.addLayer({
            id: 'depts-line',
            type: 'line',
            source: 'departments',
            paint: {
              'line-color': 'rgba(255,255,255,0.2)',
              'line-width': 0.8,
            },
            layout: { visibility: 'none' },
          }, 'piezo-clusters')

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

      // --- BDLISA nappes ---
      fetch('/geo/bdlisa.geojson')
        .then(r => r.json())
        .then(data => {
          if (map.getSource('bdlisa')) return
          map.addSource('bdlisa', { type: 'geojson', data, generateId: true })

          const bdlisaColorExpr: maplibregl.ExpressionSpecification = [
            'match',
            ['get', 'nature'],
            ...Object.entries(BDLISA_NATURE_COLORS).flatMap(([k, v]) => [k, v] as [string, string]),
            '#94a3b8',
          ] as any

          map.addLayer({
            id: 'bdlisa-fill',
            type: 'fill',
            source: 'bdlisa',
            layout: { visibility: 'none' },
            paint: {
              'fill-color': bdlisaColorExpr,
              'fill-opacity': [
                'case',
                ['==', ['get', 'code'], activeCodeBdlisaRef.current ?? '$$NONE$$'], 0.40,
                ['boolean', ['feature-state', 'hover'], false], 0.25,
                0.12,
              ],
            },
          }, 'piezo-clusters')
          map.addLayer({
            id: 'bdlisa-line',
            type: 'line',
            source: 'bdlisa',
            layout: { visibility: 'none' },
            paint: {
              'line-color': 'rgba(255,255,255,0.25)',
              'line-width': 0.5,
            },
          }, 'piezo-clusters')

          let hoveredBdlisaId: number | null = null
          map.on('mousemove', 'bdlisa-fill', (e) => {
            if (!e.features?.length) return
            const feat = e.features[0]
            if (hoveredBdlisaId !== null) map.setFeatureState({ source: 'bdlisa', id: hoveredBdlisaId }, { hover: false })
            hoveredBdlisaId = feat.id as number
            map.setFeatureState({ source: 'bdlisa', id: hoveredBdlisaId }, { hover: true })
            const nom = feat.properties?.nom ?? feat.properties?.code ?? ''
            const nature = feat.properties?.nature ?? ''
            setTooltip({ name: `${nom}${nature ? ` · ${nature}` : ''}`, x: e.point.x, y: e.point.y })
          })
          map.on('mouseleave', 'bdlisa-fill', () => {
            if (hoveredBdlisaId !== null) map.setFeatureState({ source: 'bdlisa', id: hoveredBdlisaId }, { hover: false })
            hoveredBdlisaId = null
            setTooltip(null)
          })
          map.on('click', 'bdlisa-fill', (e) => {
            const code = e.features?.[0]?.properties?.code ?? null
            const current = activeCodeBdlisaRef.current
            onBdlisaClickRef.current?.(code === current ? null : code)
          })
          map.on('mouseenter', 'bdlisa-fill', () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', 'bdlisa-fill', () => { map.getCanvas().style.cursor = '' })
        })

      // --- SANDRE hydrological districts ---
      fetch('/geo/bassins.geojson')
        .then(r => r.json())
        .then(data => {
          if (map.getSource('bassins')) return
          map.addSource('bassins', { type: 'geojson', data, generateId: true })

          const sandreColorExpr: maplibregl.ExpressionSpecification = [
            'match',
            ['get', 'CdBH'],
            ...Object.entries(SANDRE_DISTRICT_COLORS).flatMap(([k, v]) => [k, v] as [string, string]),
            '#94a3b8',
          ] as any

          map.addLayer({
            id: 'bassins-fill',
            type: 'fill',
            source: 'bassins',
            layout: { visibility: 'none' },
            paint: {
              'fill-color': sandreColorExpr,
              'fill-opacity': [
                'case',
                ['==', ['get', 'CdBH'], activeCodeBassinRef.current ?? '$$NONE$$'], 0.35,
                ['boolean', ['feature-state', 'hover'], false], 0.20,
                0.10,
              ],
            },
          }, 'piezo-clusters')
          map.addLayer({
            id: 'bassins-line',
            type: 'line',
            source: 'bassins',
            layout: { visibility: 'none' },
            paint: {
              'line-color': sandreColorExpr,
              'line-width': 1.5,
              'line-opacity': 0.5,
            },
          }, 'piezo-clusters')

          let hoveredBassinId: number | null = null
          map.on('mousemove', 'bassins-fill', (e) => {
            if (!e.features?.length) return
            const feat = e.features[0]
            if (hoveredBassinId !== null) map.setFeatureState({ source: 'bassins', id: hoveredBassinId }, { hover: false })
            hoveredBassinId = feat.id as number
            map.setFeatureState({ source: 'bassins', id: hoveredBassinId }, { hover: true })
            setTooltip({ name: feat.properties?.LbBH ?? feat.properties?.CdBH ?? '', x: e.point.x, y: e.point.y })
          })
          map.on('mouseleave', 'bassins-fill', () => {
            if (hoveredBassinId !== null) map.setFeatureState({ source: 'bassins', id: hoveredBassinId }, { hover: false })
            hoveredBassinId = null
            setTooltip(null)
          })
          map.on('click', 'bassins-fill', (e) => {
            const code = e.features?.[0]?.properties?.CdBH ?? null
            const current = activeCodeBassinRef.current
            onBassinClickRef.current?.(code === current ? null : code)
          })
          map.on('mouseenter', 'bassins-fill', () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', 'bassins-fill', () => { map.getCanvas().style.cursor = '' })
        })

      // --- Piezo clustered source + layers ---
      addClusteredSource(map, 'piezo-stations', 'piezo', 0, 'transparent', buildColorExpression() as any, '#22d3ee')

      // --- Hydro clustered source + layers ---
      addClusteredSource(map, 'hydro-stations', 'hydro', 1, 'rgba(255,255,255,0.3)', buildColorExpression() as any, '#6366f1')

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

      // --- Click on empty background → clear all spatial filters ---
      // Layer-specific handlers (depts-fill, bassins-fill, etc.) fire for their own clicks.
      // This general handler clears spatial filters when clicking on empty map background
      // (no features from any of our interactive layers at the clicked point).
      map.on('click', (e) => {
        const spatialLayers = ['depts-fill', 'regions-fill', 'bdlisa-fill', 'bassins-fill']
        const stationLayers = ['piezo-clusters', 'piezo-unclustered', 'hydro-clusters', 'hydro-unclustered']
        const allInteractive = [...spatialLayers, ...stationLayers].filter(id => !!map.getLayer(id))
        const hits = map.queryRenderedFeatures(e.point, { layers: allInteractive })
        if (hits.length === 0) {
          // True empty click — clear all spatial filters
          onDeptClickRef.current?.(null)
          onBdlisaClickRef.current?.(null)
          onBassinClickRef.current?.(null)
        }
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

  // Toggle piezo/hydro visibility
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

  // Toggle regions visibility (Calques panel)
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return
    const map = mapRef.current
    const vis = showRegions ? 'visible' : 'none'
    if (map.getLayer('regions-fill')) map.setLayoutProperty('regions-fill', 'visibility', vis)
    if (map.getLayer('regions-line')) map.setLayoutProperty('regions-line', 'visibility', vis)
  }, [showRegions])

  // Toggle departments visibility (Calques panel)
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return
    const map = mapRef.current
    const vis = showDepts ? 'visible' : 'none'
    if (map.getLayer('depts-fill')) map.setLayoutProperty('depts-fill', 'visibility', vis)
    if (map.getLayer('depts-line')) map.setLayoutProperty('depts-line', 'visibility', vis)
  }, [showDepts])

  // Toggle BDLISA nappes visibility
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return
    const map = mapRef.current
    const vis = showBdlisa ? 'visible' : 'none'
    if (map.getLayer('bdlisa-fill')) map.setLayoutProperty('bdlisa-fill', 'visibility', vis)
    if (map.getLayer('bdlisa-line')) map.setLayoutProperty('bdlisa-line', 'visibility', vis)
  }, [showBdlisa])

  // Toggle SANDRE bassins visibility
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return
    const map = mapRef.current
    const vis = showSandre ? 'visible' : 'none'
    if (map.getLayer('bassins-fill')) map.setLayoutProperty('bassins-fill', 'visibility', vis)
    if (map.getLayer('bassins-line')) map.setLayoutProperty('bassins-line', 'visibility', vis)
  }, [showSandre])

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

  // Sync activeCodeBdlisa highlight
  useEffect(() => {
    activeCodeBdlisaRef.current = activeCodeBdlisa
    if (!mapRef.current || !mapLoadedRef.current) return
    const map = mapRef.current
    if (!map.getLayer('bdlisa-fill')) return
    map.setPaintProperty('bdlisa-fill', 'fill-opacity', [
      'case',
      ['==', ['get', 'code'], activeCodeBdlisa ?? '$$NONE$$'], 0.40,
      ['boolean', ['feature-state', 'hover'], false], 0.25,
      0.12,
    ])
  }, [activeCodeBdlisa])

  // Sync activeCodeBassin highlight
  useEffect(() => {
    activeCodeBassinRef.current = activeCodeBassin
    if (!mapRef.current || !mapLoadedRef.current) return
    const map = mapRef.current
    if (!map.getLayer('bassins-fill')) return
    map.setPaintProperty('bassins-fill', 'fill-opacity', [
      'case',
      ['==', ['get', 'CdBH'], activeCodeBassin ?? '$$NONE$$'], 0.35,
      ['boolean', ['feature-state', 'hover'], false], 0.20,
      0.10,
    ])
  }, [activeCodeBassin])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" role="application" aria-label="Carte interactive des stations hydrologiques de France" />
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
