import { useRef, useEffect, useCallback, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { StationGeoJSONFeature } from '../../lib/types'
import type { WfsLayerId } from '../../lib/types'
import { WFS_LAYER_MAP } from '../../lib/layerConfig'

const FRANCE_CENTER: [number, number] = [2.5, 46.5]
const FRANCE_ZOOM = 5.5

// HER-1 hydroecoregion colors (22 regions, grouped by geology/climate)
const HER1_COLORS: Record<number, string> = {
  1: '#ef4444',  // Pyrénées
  2: '#f97316',  // Alpes Internes
  3: '#eab308',  // Massif Central Sud
  4: '#84cc16',  // Vosges
  5: '#22c55e',  // Jura-Préalpes Nord
  6: '#14b8a6',  // Méditerranéen
  7: '#06b6d4',  // Préalpes du Sud
  8: '#3b82f6',  // Cévennes
  9: '#6366f1',  // Tables Calcaires
  10: '#8b5cf6', // Côtes Calcaires Est
  11: '#a855f7', // Causses Aquitains
  12: '#d946ef', // Armoricain
  13: '#ec4899', // Landes
  14: '#f43f5e', // Coteaux Aquitains
  15: '#fb923c', // Plaine Saône
  16: '#a78bfa', // Corse
  17: '#64748b', // Dépressions Sédimentaires
  18: '#10b981', // Alsace
  19: '#f59e0b', // Grands Causses
  20: '#78716c', // Dépôts Argilo-Sableux
  21: '#be185d', // Massif Central Nord
  22: '#059669', // Ardennes
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
  showHER?: boolean
  showSandre?: boolean
  onBassinClick?: (code: string | null) => void
  activeCodeBassin?: string
  onRegionClick?: (code: string | null, stationCodes: string[] | null) => void
  onHERClick?: (code: number | null, stationCodes: string[] | null) => void
  onSpatialFilter?: (codes: string[] | null) => void
  activeWfsLayers?: Set<WfsLayerId>
  wfsData?: Record<string, any>
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
/*  Point-in-polygon (ray casting) — supports Polygon & MultiPolygon */
/* ------------------------------------------------------------------ */
function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

function pointInPolygon(lon: number, lat: number, geometry: any): boolean {
  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates
    if (!pointInRing(lon, lat, outer)) return false
    for (const hole of holes) {
      if (pointInRing(lon, lat, hole)) return false
    }
    return true
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly: number[][][]) => {
      const [outer, ...holes] = poly
      if (!pointInRing(lon, lat, outer)) return false
      for (const hole of holes) {
        if (pointInRing(lon, lat, hole)) return false
      }
      return true
    })
  }
  return false
}

function stationsInGeometry(features: StationGeoJSONFeature[], geometry: any): string[] {
  return features
    .filter(f => {
      const [lon, lat] = f.geometry.coordinates
      return lon != null && lat != null && pointInPolygon(lon, lat, geometry)
    })
    .map(f => f.properties.code)
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
  showHER = false,
  showSandre = false,
  onBassinClick,
  activeCodeBassin,
  onRegionClick,
  onHERClick,
  onSpatialFilter,
  activeWfsLayers = new Set() as Set<WfsLayerId>,
  wfsData,
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

  const onBassinClickRef = useRef(onBassinClick)
  onBassinClickRef.current = onBassinClick

const activeCodeBassinRef = useRef(activeCodeBassin)
  activeCodeBassinRef.current = activeCodeBassin

  const onRegionClickRef = useRef(onRegionClick)
  onRegionClickRef.current = onRegionClick

  const onHERClickRef = useRef(onHERClick)
  onHERClickRef.current = onHERClick

  const onSpatialFilterRef = useRef(onSpatialFilter)
  onSpatialFilterRef.current = onSpatialFilter

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

// Click region → zoom + filter stations via point-in-polygon
          map.on('click', 'regions-fill', (e) => {
            const feat = e.features?.[0]
            if (!feat) return
            const bbox = computeBbox(feat.geometry)
            map.fitBounds(bbox as maplibregl.LngLatBoundsLike, { padding: 60, duration: 500 })
            const codes = stationsInGeometry(featuresRef.current, feat.geometry)
            onSpatialFilterRef.current?.(codes.length > 0 ? codes : null)
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

// Click department → zoom + filter stations or deselect
          map.on('click', 'depts-fill', (e) => {
            const feat = e.features?.[0]
            if (!feat) return

            // Zoom to department
            const bbox = computeBbox(feat.geometry)
            map.fitBounds(bbox as maplibregl.LngLatBoundsLike, { padding: 60, duration: 500 })

            const code = feat.properties?.code ?? null
            const current = activeCodeDeptRef.current
            onDeptClickRef.current?.(code === current ? null : code)
          })

          map.on('mouseenter', 'depts-fill', () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', 'depts-fill', () => { map.getCanvas().style.cursor = '' })
        })

      // --- Hydroécorégions (HER-2 from SANDRE) ---
      fetch('/geo/her.geojson')
        .then(r => r.json())
        .then(data => {
          if (map.getSource('her')) return
          map.addSource('her', { type: 'geojson', data, generateId: true })

          const herColorExpr: maplibregl.ExpressionSpecification = [
            'match',
            ['get', 'code_her1'],
            ...Object.entries(HER1_COLORS).flatMap(([k, v]) => [Number(k), v] as [number, string]),
            '#94a3b8',
          ] as any

          map.addLayer({
            id: 'her-fill',
            type: 'fill',
            source: 'her',
            layout: { visibility: 'none' },
            paint: {
              'fill-color': herColorExpr,
              'fill-opacity': [
                'case',
                ['boolean', ['feature-state', 'hover'], false], 0.30,
                0.15,
              ],
            },
          }, 'piezo-clusters')
          map.addLayer({
            id: 'her-line',
            type: 'line',
            source: 'her',
            layout: { visibility: 'none' },
            paint: {
              'line-color': 'rgba(255,255,255,0.3)',
              'line-width': 0.8,
            },
          }, 'piezo-clusters')

          let hoveredHERId: number | null = null
          map.on('mousemove', 'her-fill', (e) => {
            if (!e.features?.length) return
            const feat = e.features[0]
            if (hoveredHERId !== null) map.setFeatureState({ source: 'her', id: hoveredHERId }, { hover: false })
            hoveredHERId = feat.id as number
            map.setFeatureState({ source: 'her', id: hoveredHERId }, { hover: true })
            const nom = feat.properties?.nom ?? ''
            const her1 = feat.properties?.nom_her1 ?? ''
            setTooltip({ name: `${nom}${her1 ? ` · ${her1}` : ''}`, x: e.point.x, y: e.point.y })
          })
          map.on('mouseleave', 'her-fill', () => {
            if (hoveredHERId !== null) map.setFeatureState({ source: 'her', id: hoveredHERId }, { hover: false })
            hoveredHERId = null
            setTooltip(null)
          })
// Click HER → zoom + filter stations via point-in-polygon
          map.on('click', 'her-fill', (e) => {
            const feat = e.features?.[0]
            if (!feat) return
            const bbox = computeBbox(feat.geometry)
            map.fitBounds(bbox as maplibregl.LngLatBoundsLike, { padding: 60, duration: 500 })
            const codes = stationsInGeometry(featuresRef.current, feat.geometry)
            onSpatialFilterRef.current?.(codes.length > 0 ? codes : null)
          })

          map.on('mouseenter', 'her-fill', () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', 'her-fill', () => { map.getCanvas().style.cursor = '' })
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
            const feat = e.features?.[0]
            if (!feat) return
            const code = feat.properties?.CdBH ?? null
            const current = activeCodeBassinRef.current
            // Zoom to bassin
            const bbox = computeBbox(feat.geometry)
            map.fitBounds(bbox as maplibregl.LngLatBoundsLike, { padding: 60, duration: 500 })
            // Toggle: deselect if same bassin clicked
            if (code === current) {
              onBassinClickRef.current?.(null)
              onSpatialFilterRef.current?.(null)
            } else {
              onBassinClickRef.current?.(code)
              const codes = stationsInGeometry(featuresRef.current, feat.geometry)
              onSpatialFilterRef.current?.(codes.length > 0 ? codes : null)
            }
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
        const stationLayers = ['piezo-clusters', 'piezo-unclustered', 'hydro-clusters', 'hydro-unclustered']
          .filter(id => !!map.getLayer(id))
        const stationHits = map.queryRenderedFeatures(e.point, { layers: stationLayers })
        if (stationHits.length > 0) return // clic sur une station, on ne clear pas

        // Vérifier si on a cliqué sur un layer spatial VISIBLE
        const visibleSpatialLayers = [
          'depts-fill', 'regions-fill', 'her-fill', 'bassins-fill',
          ...Object.entries(WFS_LAYER_MAP)
            .filter(([, cfg]) => cfg.geometryType === 'polygon')
            .map(([id]) => `wfs-${id}-fill`),
        ]
          .filter(id => {
            if (!map.getLayer(id)) return false
            return map.getLayoutProperty(id, 'visibility') === 'visible'
          })
        const spatialHits = map.queryRenderedFeatures(e.point, { layers: visibleSpatialLayers })
        if (spatialHits.length > 0) return // clic sur un layer spatial, géré par son propre handler

        // Clic vraiment vide — clear tous les filtres spatiaux
        onDeptClickRef.current?.(null)
        onBassinClickRef.current?.(null)
        onSpatialFilterRef.current?.(null)
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

  // Toggle HER visibility (Calques panel)
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return
    const map = mapRef.current
    const vis = showHER ? 'visible' : 'none'
    if (map.getLayer('her-fill')) map.setLayoutProperty('her-fill', 'visibility', vis)
    if (map.getLayer('her-line')) map.setLayoutProperty('her-line', 'visibility', vis)
  }, [showHER])

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

  // Sync WFS layers to map
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return
    const map = mapRef.current

    for (const [layerId, config] of Object.entries(WFS_LAYER_MAP)) {
      const fillId = `wfs-${layerId}-fill`
      const lineId = `wfs-${layerId}-line`
      const isActive = activeWfsLayers.has(layerId as WfsLayerId)
      const data = wfsData?.[layerId]

      if (isActive && data && !map.getSource(`wfs-${layerId}`)) {
        map.addSource(`wfs-${layerId}`, { type: 'geojson', data, generateId: true })

        if (config.geometryType === 'polygon') {
          map.addLayer({
            id: fillId,
            type: 'fill',
            source: `wfs-${layerId}`,
            paint: {
              'fill-color': config.color,
              'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.30, 0.12],
            },
          }, 'piezo-clusters')
          map.addLayer({
            id: lineId,
            type: 'line',
            source: `wfs-${layerId}`,
            paint: {
              'line-color': config.color,
              'line-width': 1,
              'line-opacity': 0.5,
            },
          }, 'piezo-clusters')
        } else {
          map.addLayer({
            id: lineId,
            type: 'line',
            source: `wfs-${layerId}`,
            paint: {
              'line-color': config.color,
              'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 12, 3],
              'line-opacity': 0.7,
            },
          }, 'piezo-clusters')
        }

        // Hover interaction
        const hoverLayerId = config.geometryType === 'polygon' ? fillId : lineId
        let hoveredId: number | null = null

        map.on('mousemove', hoverLayerId, (e) => {
          if (!e.features?.length) return
          const feat = e.features[0]
          if (hoveredId !== null) map.setFeatureState({ source: `wfs-${layerId}`, id: hoveredId }, { hover: false })
          hoveredId = feat.id as number
          map.setFeatureState({ source: `wfs-${layerId}`, id: hoveredId }, { hover: true })
          const parts = config.tooltipFields
            .map(f => feat.properties?.[f])
            .filter(Boolean)
          setTooltip({ name: parts.join(' \u2014 ') || layerId, x: e.point.x, y: e.point.y })
        })
        map.on('mouseleave', hoverLayerId, () => {
          if (hoveredId !== null) map.setFeatureState({ source: `wfs-${layerId}`, id: hoveredId }, { hover: false })
          hoveredId = null
          setTooltip(null)
        })
        map.on('mouseenter', hoverLayerId, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', hoverLayerId, () => { map.getCanvas().style.cursor = '' })

        // Click -> zoom + spatial filter (polygons only)
        if (config.geometryType === 'polygon') {
          map.on('click', fillId, (e) => {
            const feat = e.features?.[0]
            if (!feat) return
            const bbox = computeBbox(feat.geometry)
            map.fitBounds(bbox as maplibregl.LngLatBoundsLike, { padding: 60, duration: 500 })
            const codes = stationsInGeometry(featuresRef.current, feat.geometry)
            onSpatialFilterRef.current?.(codes.length > 0 ? codes : null)
          })
        }
      }

      // Update data if source exists
      if (data && map.getSource(`wfs-${layerId}`)) {
        const src = map.getSource(`wfs-${layerId}`) as maplibregl.GeoJSONSource
        src.setData(data)
      }

      // Toggle visibility
      if (map.getLayer(fillId)) {
        map.setLayoutProperty(fillId, 'visibility', isActive ? 'visible' : 'none')
      }
      if (map.getLayer(lineId)) {
        map.setLayoutProperty(lineId, 'visibility', isActive ? 'visible' : 'none')
      }
    }
  }, [activeWfsLayers, wfsData])

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
