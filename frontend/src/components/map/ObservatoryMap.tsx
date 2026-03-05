import { useRef, useEffect, useCallback, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { StationGeoJSONFeature } from '../../lib/types'
import type { WfsLayerId } from '../../lib/types'
import { WFS_LAYER_MAP } from '../../lib/layerConfig'

const FRANCE_CENTER: [number, number] = [2.5, 46.5]
const FRANCE_ZOOM = 5.5

// 20 maximally distinct colors for HER-2 zones (cycled via modulo on zone code)
const HER2_PALETTE = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
  '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
  '#469990', '#dcbeff', '#9A6324', '#800000', '#aaffc3',
  '#808000', '#ffd8b1', '#000075', '#a9a9a9', '#e6beff',
]

// Region colors — 13 distinct hues for metropolitan France
const REGION_COLORS: Record<string, string> = {
  '11': '#ef4444', // Île-de-France — red
  '24': '#f59e0b', // Centre-Val de Loire — amber
  '27': '#84cc16', // Bourgogne-Franche-Comté — lime
  '28': '#06b6d4', // Normandie — cyan
  '32': '#6366f1', // Hauts-de-France — indigo
  '44': '#a78bfa', // Grand Est — violet
  '52': '#22c55e', // Pays de la Loire — green
  '53': '#3b82f6', // Bretagne — blue
  '75': '#f97316', // Nouvelle-Aquitaine — orange
  '76': '#ec4899', // Occitanie — pink
  '84': '#14b8a6', // Auvergne-Rhône-Alpes — teal
  '93': '#e879f9', // Provence-Alpes-Côte d'Azur — fuchsia
  '94': '#78716c', // Corse — stone
}

// Department colors — cycle through a 12-color palette using modulo on dept code
const DEPT_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#a78bfa', '#ec4899', '#e879f9',
]

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
  onEmptyClick?: () => void
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
  onBboxChange?: (bbox: [number, number, number, number] | null) => void
  activeWfsLayers?: Set<WfsLayerId>
  wfsData?: Record<string, any>
  highlightedBasinCode?: string | null
  selectedStationCode?: string | null
  flyToBbox?: [number, number, number, number] | null
  onFlyToComplete?: () => void
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
          classification: f.properties.classification ?? '',
          codes_bdlisa: f.properties.codes_bdlisa ?? '',
        },
      })),
  }
}

function buildClassificationColorExpression(): maplibregl.ExpressionSpecification {
  return [
    'match', ['get', 'classification'],
    'EXTREMEMENT_BAS', '#991b1b',
    'TRES_BAS', '#ef4444',
    'BAS', '#f97316',
    'NORMAL', '#10b981',
    'HAUT', '#3b82f6',
    'TRES_HAUT', '#1d4ed8',
    'EXTREMEMENT_HAUT', '#312e81',
    '#6b7280', // fallback: gray for unknown/no classification
  ]
}

/* ------------------------------------------------------------------ */
/*  SDF icon generation for station markers                           */
/* ------------------------------------------------------------------ */

/** Create an SDF-compatible ImageData from a drawing function */
function createSdfIcon(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 40): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  draw(ctx, size)
  return ctx.getImageData(0, 0, size, size)
}

/** Piezo: diamond shape — standard cartographic symbol for wells/boreholes */
function drawPiezoDiamond(ctx: CanvasRenderingContext2D, size: number) {
  const cx = size / 2, cy = size / 2
  const rx = size * 0.38, ry = size * 0.44
  ctx.beginPath()
  ctx.moveTo(cx, cy - ry)   // top
  ctx.lineTo(cx + rx, cy)   // right
  ctx.lineTo(cx, cy + ry)   // bottom
  ctx.lineTo(cx - rx, cy)   // left
  ctx.closePath()
  ctx.fillStyle = '#fff'
  ctx.fill()
}

/** Hydro: water drop shape — represents surface water flow */
function drawHydroDrop(ctx: CanvasRenderingContext2D, size: number) {
  const cx = size / 2
  const r = size * 0.32
  const bottomY = size * 0.62
  const tipY = size * 0.12

  ctx.beginPath()
  // Bottom circle
  ctx.arc(cx, bottomY, r, 0.15 * Math.PI, 0.85 * Math.PI)
  // Sides up to the tip
  ctx.lineTo(cx, tipY)
  ctx.closePath()
  ctx.fillStyle = '#fff'
  ctx.fill()
}

/* ------------------------------------------------------------------ */
/*  Helper: add clustered source + layers for one station type        */
/* ------------------------------------------------------------------ */
function addClusteredSource(
  map: maplibregl.Map,
  sourceId: string,
  layerPrefix: string,
  iconImage: string,
  pointColor: any,
  clusterColor: string,
  clusterOffset: [number, number] = [0, 0],
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
      'circle-translate': clusterOffset,
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
      'text-offset': [clusterOffset[0] / 16, clusterOffset[1] / 16],
    },
    paint: {
      'text-color': '#ffffff',
    },
  })

  // Unclustered individual points — SDF symbol layer (shape varies by type)
  map.addLayer({
    id: `${layerPrefix}-unclustered`,
    type: 'symbol',
    source: sourceId,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': iconImage,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.35, 8, 0.5, 12, 0.75],
      'icon-allow-overlap': true,
    },
    paint: {
      'icon-color': pointColor,
      'icon-opacity': 0.9,
      'icon-halo-color': '#000000',
      'icon-halo-width': 0.8,
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
  onEmptyClick,
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
  onBboxChange,
  activeWfsLayers = new Set() as Set<WfsLayerId>,
  wfsData,
  highlightedBasinCode = null,
  selectedStationCode = null,
  flyToBbox = null,
  onFlyToComplete,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const mapLoadedRef = useRef(false)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [layersReady, setLayersReady] = useState(0) // incremented each time a ref layer finishes loading

  const featuresRef = useRef<StationGeoJSONFeature[]>([])
  featuresRef.current = features ?? []

  const onStationClickRef = useRef(onStationClick)
  onStationClickRef.current = onStationClick

  const onEmptyClickRef = useRef(onEmptyClick)
  onEmptyClickRef.current = onEmptyClick

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

  const onBboxChangeRef = useRef(onBboxChange)
  onBboxChangeRef.current = onBboxChange

  const [tooltip, setTooltip] = useState<{ name: string; x: number; y: number } | null>(null)
  const bdlisaCacheRef = useRef<any>(null)

  // Refs for show* props — used inside async fetch callbacks to get current value
  const showRegionsRef = useRef(showRegions)
  showRegionsRef.current = showRegions
  const showDeptsRef = useRef(showDepts)
  showDeptsRef.current = showDepts
  const showHERRef = useRef(showHER)
  showHERRef.current = showHER
  const showSandreRef = useRef(showSandre)
  showSandreRef.current = showSandre

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
      style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
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
      setMapLoaded(true)

      // --- Terrain hillshading ---
      map.addSource('terrain-dem', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 15,
      })

      map.addLayer({
        id: 'hillshading',
        type: 'hillshade',
        source: 'terrain-dem',
        paint: {
          'hillshade-shadow-color': '#473B24',
          'hillshade-highlight-color': '#ffffff',
          'hillshade-exaggeration': 0.3,
          'hillshade-illumination-direction': 315,
        },
      }, map.getStyle().layers.find(l => l.type === 'symbol')?.id)

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

      // --- Register SDF marker icons ---
      map.addImage('piezo-marker', createSdfIcon(drawPiezoDiamond, 40), { sdf: true })
      map.addImage('hydro-marker', createSdfIcon(drawHydroDrop, 40), { sdf: true })

      // --- Piezo clustered source + layers (offset left to avoid hydro overlap) ---
      addClusteredSource(map, 'piezo-stations', 'piezo', 'piezo-marker', buildClassificationColorExpression() as any, '#22d3ee', [-20, -6])

      // --- Hydro clustered source + layers (offset right to avoid piezo overlap) ---
      addClusteredSource(map, 'hydro-stations', 'hydro', 'hydro-marker', buildClassificationColorExpression() as any, '#6366f1', [20, 6])

      // Populate with any data that already loaded
      const allFeatures = featuresRef.current
      const piezoFeats = allFeatures.filter(f => f.properties.type === 'piezo')
      const hydroFeats = allFeatures.filter(f => f.properties.type === 'hydro')
      if (piezoFeats.length) updateSource(map, 'piezo-stations', piezoFeats)
      if (hydroFeats.length) updateSource(map, 'hydro-stations', hydroFeats)

      // --- Preload all static reference layers in one batch ---
      Promise.all([
        fetch('/geo/regions.geojson').then(r => r.json()),
        fetch('/geo/departments.geojson').then(r => r.json()),
        fetch('/geo/her.geojson').then(r => r.json()),
        fetch('/geo/bassins.geojson').then(r => r.json()),
      ]).then(([regionsData, deptsData, herData, bassinsData]) => {
        if (!mapRef.current) return

        // --- Helper ---
        const addLayer = (sourceId: string, data: any, fillId: string, lineId: string, vis: string, fillPaint: any, linePaint: any) => {
          map.addSource(sourceId, { type: 'geojson', data, generateId: true })
          map.addLayer({ id: fillId, type: 'fill', source: sourceId, paint: fillPaint, layout: { visibility: vis as any } }, 'piezo-clusters')
          map.addLayer({ id: lineId, type: 'line', source: sourceId, paint: linePaint, layout: { visibility: vis as any } }, 'piezo-clusters')
        }

        // --- Regions ---
        const regionColorExpr: any = ['match', ['get', 'code'], ...Object.entries(REGION_COLORS).flatMap(([k, v]) => [k, v]), '#94a3b8']
        addLayer('regions', regionsData, 'regions-fill', 'regions-line',
          showRegionsRef.current ? 'visible' : 'none',
          { 'fill-color': regionColorExpr, 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.35, 0.15] },
          { 'line-color': regionColorExpr, 'line-width': 2, 'line-opacity': 0.7 },
        )
        {
          let hovId: number | null = null
          map.on('mousemove', 'regions-fill', (e) => {
            if (!e.features?.length) return
            if (hovId !== null) map.setFeatureState({ source: 'regions', id: hovId }, { hover: false })
            hovId = e.features[0].id as number
            map.setFeatureState({ source: 'regions', id: hovId }, { hover: true })
            setTooltip({ name: e.features[0].properties?.nom ?? '', x: e.point.x, y: e.point.y })
          })
          map.on('mouseleave', 'regions-fill', () => { if (hovId !== null) map.setFeatureState({ source: 'regions', id: hovId }, { hover: false }); hovId = null; setTooltip(null) })
          map.on('click', 'regions-fill', (e) => {
            const feat = e.features?.[0]; if (!feat) return
            const bbox = computeBbox(feat.geometry)
            map.fitBounds(bbox as maplibregl.LngLatBoundsLike, { padding: 60, duration: 500 })
            const codes = stationsInGeometry(featuresRef.current, feat.geometry)
            onSpatialFilterRef.current?.(codes.length > 0 ? codes : null); onBboxChangeRef.current?.(bbox)
          })
          map.on('mouseenter', 'regions-fill', () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', 'regions-fill', () => { map.getCanvas().style.cursor = '' })
        }

        // --- Departments ---
        // Safe color: use match on first char to avoid to-number failing on "2A"/"2B"
        const deptColorExpr: any = [
          'match', ['slice', ['get', 'code'], 0, 1],
          '0', DEPT_PALETTE[0], '1', DEPT_PALETTE[1], '2', DEPT_PALETTE[2], '3', DEPT_PALETTE[3],
          '4', DEPT_PALETTE[4], '5', DEPT_PALETTE[5], '6', DEPT_PALETTE[6], '7', DEPT_PALETTE[7],
          '8', DEPT_PALETTE[8], '9', DEPT_PALETTE[9],
          DEPT_PALETTE[0],
        ]
        addLayer('departments', deptsData, 'depts-fill', 'depts-line',
          showDeptsRef.current ? 'visible' : 'none',
          {
            'fill-color': ['case', ['==', ['get', 'code'], activeCodeDeptRef.current ?? '$$NONE$$'], '#22d3ee', deptColorExpr] as any,
            'fill-opacity': ['case', ['==', ['get', 'code'], activeCodeDeptRef.current ?? '$$NONE$$'], 0.30, ['boolean', ['feature-state', 'hover'], false], 0.25, 0.12],
          },
          { 'line-color': deptColorExpr as any, 'line-width': 1.5, 'line-opacity': 0.6 },
        )
        {
          let hovId: number | null = null
          map.on('mousemove', 'depts-fill', (e) => {
            if (!e.features?.length) return
            if (hovId !== null) map.setFeatureState({ source: 'departments', id: hovId }, { hover: false })
            hovId = e.features[0].id as number
            map.setFeatureState({ source: 'departments', id: hovId }, { hover: true })
            setTooltip({ name: `${e.features[0].properties?.nom ?? ''} (${e.features[0].properties?.code ?? ''})`, x: e.point.x, y: e.point.y })
          })
          map.on('mouseleave', 'depts-fill', () => { if (hovId !== null) map.setFeatureState({ source: 'departments', id: hovId }, { hover: false }); hovId = null; setTooltip(null) })
          map.on('click', 'depts-fill', (e) => {
            const feat = e.features?.[0]; if (!feat) return
            const bbox = computeBbox(feat.geometry)
            map.fitBounds(bbox as maplibregl.LngLatBoundsLike, { padding: 60, duration: 500 })
            const code = feat.properties?.code ?? null
            const current = activeCodeDeptRef.current
            const deselecting = code === current
            onDeptClickRef.current?.(deselecting ? null : code); onBboxChangeRef.current?.(deselecting ? null : bbox)
          })
          map.on('mouseenter', 'depts-fill', () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', 'depts-fill', () => { map.getCanvas().style.cursor = '' })
        }

        // --- HER ---
        const herColorExpr: any = ['match', ['%', ['get', 'code'], HER2_PALETTE.length], ...HER2_PALETTE.flatMap((c, i) => [i, c]), '#94a3b8']
        addLayer('her', herData, 'her-fill', 'her-line',
          showHERRef.current ? 'visible' : 'none',
          { 'fill-color': herColorExpr, 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.30, 0.15] },
          { 'line-color': 'rgba(255,255,255,0.3)', 'line-width': 0.8 },
        )
        {
          let hovId: number | null = null
          map.on('mousemove', 'her-fill', (e) => {
            if (!e.features?.length) return
            if (hovId !== null) map.setFeatureState({ source: 'her', id: hovId }, { hover: false })
            hovId = e.features[0].id as number
            map.setFeatureState({ source: 'her', id: hovId }, { hover: true })
            const nom = e.features[0].properties?.nom ?? ''; const her1 = e.features[0].properties?.nom_her1 ?? ''
            setTooltip({ name: `${nom}${her1 ? ` · ${her1}` : ''}`, x: e.point.x, y: e.point.y })
          })
          map.on('mouseleave', 'her-fill', () => { if (hovId !== null) map.setFeatureState({ source: 'her', id: hovId }, { hover: false }); hovId = null; setTooltip(null) })
          map.on('click', 'her-fill', (e) => {
            const feat = e.features?.[0]; if (!feat) return
            const bbox = computeBbox(feat.geometry)
            map.fitBounds(bbox as maplibregl.LngLatBoundsLike, { padding: 60, duration: 500 })
            const codes = stationsInGeometry(featuresRef.current, feat.geometry)
            onSpatialFilterRef.current?.(codes.length > 0 ? codes : null); onBboxChangeRef.current?.(bbox)
          })
          map.on('mouseenter', 'her-fill', () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', 'her-fill', () => { map.getCanvas().style.cursor = '' })
        }

        // --- Bassins ---
        const sandreColorExpr: any = ['match', ['get', 'CdBH'], ...Object.entries(SANDRE_DISTRICT_COLORS).flatMap(([k, v]) => [k, v]), '#94a3b8']
        addLayer('bassins', bassinsData, 'bassins-fill', 'bassins-line',
          showSandreRef.current ? 'visible' : 'none',
          {
            'fill-color': sandreColorExpr,
            'fill-opacity': ['case', ['==', ['get', 'CdBH'], activeCodeBassinRef.current ?? '$$NONE$$'], 0.35, ['boolean', ['feature-state', 'hover'], false], 0.20, 0.10],
          },
          { 'line-color': sandreColorExpr, 'line-width': 1.5, 'line-opacity': 0.5 },
        )
        {
          let hovId: number | null = null
          map.on('mousemove', 'bassins-fill', (e) => {
            if (!e.features?.length) return
            if (hovId !== null) map.setFeatureState({ source: 'bassins', id: hovId }, { hover: false })
            hovId = e.features[0].id as number
            map.setFeatureState({ source: 'bassins', id: hovId }, { hover: true })
            setTooltip({ name: e.features[0].properties?.LbBH ?? e.features[0].properties?.CdBH ?? '', x: e.point.x, y: e.point.y })
          })
          map.on('mouseleave', 'bassins-fill', () => { if (hovId !== null) map.setFeatureState({ source: 'bassins', id: hovId }, { hover: false }); hovId = null; setTooltip(null) })
          map.on('click', 'bassins-fill', (e) => {
            const feat = e.features?.[0]; if (!feat) return
            const code = feat.properties?.CdBH ?? null; const current = activeCodeBassinRef.current
            const bbox = computeBbox(feat.geometry)
            map.fitBounds(bbox as maplibregl.LngLatBoundsLike, { padding: 60, duration: 500 })
            if (code === current) { onBassinClickRef.current?.(null); onSpatialFilterRef.current?.(null); onBboxChangeRef.current?.(null) }
            else { onBassinClickRef.current?.(code); const codes = stationsInGeometry(featuresRef.current, feat.geometry); onSpatialFilterRef.current?.(codes.length > 0 ? codes : null); onBboxChangeRef.current?.(bbox) }
          })
          map.on('mouseenter', 'bassins-fill', () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', 'bassins-fill', () => { map.getCanvas().style.cursor = '' })
        }

        // All reference layers ready — trigger visibility sync
        setLayersReady(4)
      }).catch(err => console.error('Failed to load reference layers:', err))

      // --- Click: expand cluster on click ---
      const handleClusterClick = (sourceId: string) => (e: maplibregl.MapMouseEvent & { features?: any[] }) => {
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

        // Clic vraiment vide — clear tous les filtres spatiaux + station
        onEmptyClickRef.current?.()
        onDeptClickRef.current?.(null)
        onBassinClickRef.current?.(null)
        onSpatialFilterRef.current?.(null)
        onBboxChangeRef.current?.(null)
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

    ;['piezo-clusters', 'piezo-cluster-count', 'piezo-unclustered'].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', showPiezo ? 'visible' : 'none')
    })
    ;['hydro-clusters', 'hydro-cluster-count', 'hydro-unclustered'].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', showHydro ? 'visible' : 'none')
    })
  }, [showPiezo, showHydro, mapLoaded])

  // Toggle reference layer visibility — layers are preloaded on map init
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return
    const map = mapRef.current
    const toggle = (fillId: string, lineId: string, visible: boolean) => {
      const vis = visible ? 'visible' : 'none'
      if (map.getLayer(fillId)) map.setLayoutProperty(fillId, 'visibility', vis)
      if (map.getLayer(lineId)) map.setLayoutProperty(lineId, 'visibility', vis)
    }
    toggle('regions-fill', 'regions-line', showRegions)
    toggle('depts-fill', 'depts-line', showDepts)
    toggle('her-fill', 'her-line', showHER)
    toggle('bassins-fill', 'bassins-line', showSandre)
  }, [showRegions, showDepts, showHER, showSandre, mapLoaded, layersReady])

  // Sync activeCodeDepartement to depts-fill paint properties
  useEffect(() => {
    activeCodeDeptRef.current = activeCodeDepartement
    if (!mapRef.current || !mapLoadedRef.current) return
    const map = mapRef.current
    if (!map.getLayer('depts-fill')) return
    const deptColor: any = [
      'match', ['slice', ['get', 'code'], 0, 1],
      '0', DEPT_PALETTE[0], '1', DEPT_PALETTE[1], '2', DEPT_PALETTE[2], '3', DEPT_PALETTE[3],
      '4', DEPT_PALETTE[4], '5', DEPT_PALETTE[5], '6', DEPT_PALETTE[6], '7', DEPT_PALETTE[7],
      '8', DEPT_PALETTE[8], '9', DEPT_PALETTE[9],
      DEPT_PALETTE[0],
    ]
    map.setPaintProperty('depts-fill', 'fill-color', [
      'case',
      ['==', ['get', 'code'], activeCodeDepartement ?? '$$NONE$$'],
      '#22d3ee',
      deptColor,
    ])
    map.setPaintProperty('depts-fill', 'fill-opacity', [
      'case',
      ['==', ['get', 'code'], activeCodeDepartement ?? '$$NONE$$'],
      0.30,
      ['boolean', ['feature-state', 'hover'], false],
      0.25,
      0.10,
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

  // Basin highlight: dim non-basin stations + show BDLISA polygon
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return
    const map = mapRef.current

    if (highlightedBasinCode) {
      // Dim piezo stations not in the basin
      if (map.getLayer('piezo-unclustered')) {
        map.setPaintProperty('piezo-unclustered', 'icon-opacity', [
          'case',
          ['>=', ['index-of', highlightedBasinCode, ['get', 'codes_bdlisa']], 0],
          0.95,
          0.12,
        ])
      }
      // Dim piezo clusters
      if (map.getLayer('piezo-clusters')) {
        map.setPaintProperty('piezo-clusters', 'circle-opacity', 0.15)
      }
      if (map.getLayer('piezo-cluster-count')) {
        map.setPaintProperty('piezo-cluster-count', 'text-opacity', 0.15)
      }
      // Dim all hydro
      if (map.getLayer('hydro-unclustered')) {
        map.setPaintProperty('hydro-unclustered', 'icon-opacity', 0.1)
      }
      if (map.getLayer('hydro-clusters')) {
        map.setPaintProperty('hydro-clusters', 'circle-opacity', 0.1)
      }
      if (map.getLayer('hydro-cluster-count')) {
        map.setPaintProperty('hydro-cluster-count', 'text-opacity', 0.1)
      }

      // Show BDLISA polygon for this basin
      const showBdlisa = (data: any) => {
        if (!mapRef.current) return
        const matching = data.features.filter((f: any) =>
          f.properties?.code && highlightedBasinCode.startsWith(f.properties.code)
        )
        const fc = { type: 'FeatureCollection', features: matching }
        if (!map.getSource('bdlisa-highlight')) {
          map.addSource('bdlisa-highlight', { type: 'geojson', data: fc as any })
          map.addLayer({
            id: 'bdlisa-highlight-fill',
            type: 'fill',
            source: 'bdlisa-highlight',
            paint: { 'fill-color': '#22d3ee', 'fill-opacity': 0.08 },
          }, 'piezo-clusters')
          map.addLayer({
            id: 'bdlisa-highlight-line',
            type: 'line',
            source: 'bdlisa-highlight',
            paint: { 'line-color': '#22d3ee', 'line-width': 2, 'line-opacity': 0.6, 'line-dasharray': [3, 2] },
          }, 'piezo-clusters')
        } else {
          const src = map.getSource('bdlisa-highlight') as maplibregl.GeoJSONSource
          src.setData(fc as any)
          if (map.getLayer('bdlisa-highlight-fill')) map.setLayoutProperty('bdlisa-highlight-fill', 'visibility', 'visible')
          if (map.getLayer('bdlisa-highlight-line')) map.setLayoutProperty('bdlisa-highlight-line', 'visibility', 'visible')
        }
      }
      if (bdlisaCacheRef.current) {
        showBdlisa(bdlisaCacheRef.current)
      } else {
        fetch('/geo/bdlisa.geojson')
          .then(r => r.json())
          .then(data => { bdlisaCacheRef.current = data; showBdlisa(data) })
      }
    } else {
      // Restore normal opacity
      if (map.getLayer('piezo-unclustered')) {
        map.setPaintProperty('piezo-unclustered', 'icon-opacity', 0.9)
      }
      if (map.getLayer('piezo-clusters')) {
        map.setPaintProperty('piezo-clusters', 'circle-opacity', 0.75)
      }
      if (map.getLayer('piezo-cluster-count')) {
        map.setPaintProperty('piezo-cluster-count', 'text-opacity', 1)
      }
      if (map.getLayer('hydro-unclustered')) {
        map.setPaintProperty('hydro-unclustered', 'icon-opacity', 0.9)
      }
      if (map.getLayer('hydro-clusters')) {
        map.setPaintProperty('hydro-clusters', 'circle-opacity', 0.75)
      }
      if (map.getLayer('hydro-cluster-count')) {
        map.setPaintProperty('hydro-cluster-count', 'text-opacity', 1)
      }
      // Hide BDLISA polygon
      if (map.getLayer('bdlisa-highlight-fill')) map.setLayoutProperty('bdlisa-highlight-fill', 'visibility', 'none')
      if (map.getLayer('bdlisa-highlight-line')) map.setLayoutProperty('bdlisa-highlight-line', 'visibility', 'none')
    }
  }, [highlightedBasinCode])

  // Highlight selected station with a ring
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return
    const map = mapRef.current
    const layerId = 'selected-station-ring'

    if (selectedStationCode) {
      // Build a highlight ring for the selected station
      const feat = featuresRef.current.find(f => f.properties.code === selectedStationCode)
      if (!feat) return
      const data = {
        type: 'FeatureCollection' as const,
        features: [{ type: 'Feature' as const, geometry: feat.geometry, properties: {} }],
      }
      if (!map.getSource('selected-station')) {
        map.addSource('selected-station', { type: 'geojson', data: data as any })
        map.addLayer({
          id: layerId,
          type: 'circle',
          source: 'selected-station',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 8, 8, 12, 12, 16],
            'circle-color': 'transparent',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 1,
          },
        })
      } else {
        const src = map.getSource('selected-station') as maplibregl.GeoJSONSource
        src.setData(data as any)
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', 'visible')
      }
    } else {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', 'none')
    }
  }, [selectedStationCode])

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
            onBboxChangeRef.current?.(bbox)
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

    // Ensure admin layers (regions/depts/bassins/HER) stay ABOVE WFS layers for click priority
    const adminLayers = [
      'regions-fill', 'regions-line', 'depts-fill', 'depts-line',
      'her-fill', 'her-line', 'bassins-fill', 'bassins-line',
    ]
    adminLayers.forEach(id => {
      if (map.getLayer(id)) map.moveLayer(id, 'piezo-clusters')
    })
  }, [activeWfsLayers, wfsData])

  // Fly to bbox when triggered by search or external action
  const onFlyToCompleteRef = useRef(onFlyToComplete)
  onFlyToCompleteRef.current = onFlyToComplete
  useEffect(() => {
    if (!flyToBbox || !mapRef.current || !mapLoadedRef.current) return
    mapRef.current.fitBounds(flyToBbox as maplibregl.LngLatBoundsLike, { padding: 80, duration: 600 })
    onFlyToCompleteRef.current?.()
  }, [flyToBbox])

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
      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 bg-gray-900/90 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-[10px] space-y-1.5">
        <div className="text-gray-400 font-medium uppercase tracking-wider mb-1">Situation</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {[
            ['#991b1b', 'Extr. bas'],
            ['#ef4444', 'Très bas'],
            ['#f97316', 'Bas'],
            ['#10b981', 'Normal'],
            ['#3b82f6', 'Haut'],
            ['#1d4ed8', 'Très haut'],
            ['#312e81', 'Extr. haut'],
            ['#6b7280', 'Non classé'],
          ].map(([color, label]) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-gray-300">{label}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 pt-1 mt-1 flex gap-3">
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
              <polygon points="6,1 11,6 6,11 1,6" fill="#10b981" />
            </svg>
            <span className="text-gray-300">Piézo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="12" height="14" viewBox="0 0 12 14" className="shrink-0">
              <path d="M6,1 Q6,1 10,8 A4.5,4.5 0 1,1 2,8 Q6,1 6,1Z" fill="#10b981" />
            </svg>
            <span className="text-gray-300">Hydro</span>
          </div>
        </div>
      </div>
    </div>
  )
}
