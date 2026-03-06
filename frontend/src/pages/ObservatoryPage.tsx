import { useState, useCallback, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ObservatoryMap } from '../components/map/ObservatoryMap'
import { StationDrawer } from '../components/map/StationDrawer'
import { KPIBar } from '../components/map/KPIBar'
import { SearchBar } from '../components/map/SearchBar'
import type { SearchAction } from '../components/map/SearchBar'
import { TimelineSlider } from '../components/map/TimelineSlider'
import { RightDrawer } from '../components/map/RightDrawer'
import { useStationsGeoJSON } from '../hooks/useStations'
import { useWfsLayer } from '../hooks/useWfsLayer'
import { LAYER_GROUPS } from '../lib/layerConfig'
import type { StationGeoJSONFeature, WfsLayerId, ClassificationTimeline } from '../lib/types'
import { TIMELINE_CLASSIFICATIONS } from '../lib/types'
import { useFilters } from '../hooks/useFilters'

type Bbox = [number, number, number, number] // [minLon, minLat, maxLon, maxLat]

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                   */
/* ------------------------------------------------------------------ */

function computeBboxFromGeometry(geometry: any): Bbox {
  const coords: number[][] = []
  const collect = (g: any) => {
    if (!g) return
    switch (g.type) {
      case 'Point': coords.push(g.coordinates); break
      case 'LineString': g.coordinates.forEach((c: number[]) => coords.push(c)); break
      case 'MultiLineString': g.coordinates.forEach((line: number[][]) => line.forEach((c: number[]) => coords.push(c))); break
      case 'Polygon': g.coordinates[0].forEach((c: number[]) => coords.push(c)); break
      case 'MultiPolygon': g.coordinates.forEach((p: number[][][]) => p[0].forEach((c: number[]) => coords.push(c))); break
    }
  }
  collect(geometry)
  if (coords.length === 0) return [-5, 41, 10, 51]
  if (coords.length === 1) {
    // Single point: create a small bbox around it
    const [lon, lat] = coords[0]
    return [lon - 0.15, lat - 0.1, lon + 0.15, lat + 0.1]
  }
  const lons = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
}

function featureIntersectsBbox(feature: any, bbox: Bbox): boolean {
  const [minLon, minLat, maxLon, maxLat] = bbox
  const coords: number[][] = []
  const collectCoords = (geom: any) => {
    if (!geom) return
    switch (geom.type) {
      case 'Point': coords.push(geom.coordinates); break
      case 'LineString':
      case 'MultiPoint': geom.coordinates.forEach((c: number[]) => coords.push(c)); break
      case 'Polygon':
      case 'MultiLineString': geom.coordinates.forEach((ring: number[][]) => ring.forEach((c: number[]) => coords.push(c))); break
      case 'MultiPolygon': geom.coordinates.forEach((poly: number[][][]) => poly.forEach((ring: number[][]) => ring.forEach((c: number[]) => coords.push(c)))); break
    }
  }
  collectCoords(feature.geometry)
  const margin = 0.1
  return coords.some(c =>
    c[0] >= minLon - margin && c[0] <= maxLon + margin &&
    c[1] >= minLat - margin && c[1] <= maxLat + margin
  )
}

function filterGeoJSONByBbox(geojson: any, bbox: Bbox): any {
  if (!geojson?.features) return geojson
  return { ...geojson, features: geojson.features.filter((f: any) => featureIntersectsBbox(f, bbox)) }
}

/* ------------------------------------------------------------------ */
/*  Point-in-polygon for spatial filtering from search                 */
/* ------------------------------------------------------------------ */

function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}

function pointInGeometry(lon: number, lat: number, geometry: any): boolean {
  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates
    if (!pointInRing(lon, lat, outer)) return false
    for (const hole of holes) { if (pointInRing(lon, lat, hole)) return false }
    return true
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly: number[][][]) => {
      const [outer, ...holes] = poly
      if (!pointInRing(lon, lat, outer)) return false
      for (const hole of holes) { if (pointInRing(lon, lat, hole)) return false }
      return true
    })
  }
  return false
}

function stationsInGeometry(features: StationGeoJSONFeature[], geometry: any): string[] {
  return features
    .filter(f => {
      const [lon, lat] = f.geometry.coordinates
      return lon != null && lat != null && pointInGeometry(lon, lat, geometry)
    })
    .map(f => f.properties.code)
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function ObservatoryPage() {
  const { filters, setFilter } = useFilters()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: geojsonData, isError: geojsonError } = useStationsGeoJSON()
  const filteredFeatures = useMemo<StationGeoJSONFeature[]>(() => {
    const all = geojsonData?.features ?? []
    return all.filter(f => {
      if (filters.activeOnly) {
        const currentYear = new Date().getFullYear().toString()
        if (!f.properties.derniere_mesure || !f.properties.derniere_mesure.startsWith(currentYear)) return false
      }
      if (filters.codeDepartement && f.properties.code_departement !== filters.codeDepartement) return false
      if (filters.classification?.length && !filters.classification.includes(f.properties.classification ?? '')) return false
      if (filters.codeBdlisa && f.properties.type === 'piezo') {
        const codes = f.properties.codes_bdlisa ?? ''
        if (!codes.startsWith(filters.codeBdlisa)) return false
      }
      if (filters.lastMeasurementAfter && f.properties.derniere_mesure) {
        if (f.properties.derniere_mesure < filters.lastMeasurementAfter) return false
      }
      if (filters.minObservations && (f.properties.nb_observations ?? 0) < filters.minObservations) return false
      if (spatialStationCodes?.length) {
        if (!spatialStationCodes.includes(f.properties.code)) return false
      }
      return true
    })
  }, [geojsonData, filters.activeOnly, filters.codeDepartement, filters.classification, filters.codeBdlisa, filters.lastMeasurementAfter, filters.minObservations, spatialStationCodes])

  // Spatial station codes kept in local state (not URL) to avoid 414 URI Too Large
  const [spatialStationCodes, setSpatialStationCodes] = useState<string[] | null>(null)

  const [selectedStation, setSelectedStation] = useState<{ code: string; type: 'piezo' | 'hydro' } | null>(null)
  const [showPiezo, setShowPiezo] = useState(true)
  const [showHydro, setShowHydro] = useState(true)

  const [showRegions, setShowRegions] = useState(true)
  const [showDepts, setShowDepts] = useState(false)
  const [showHER, setShowHER] = useState(false)
  const [showSandre, setShowSandre] = useState(false)

  const [activeWfsLayers, setActiveWfsLayers] = useState<Set<WfsLayerId>>(new Set())
  const [activeBbox, setActiveBbox] = useState<Bbox | null>(null)
  const [flyToBbox, setFlyToBbox] = useState<Bbox | null>(null)

  // Fly to lat/lon from URL (e.g. AlertsPage "Voir sur la carte" link)
  useEffect(() => {
    const lat = parseFloat(searchParams.get('lat') ?? '')
    const lon = parseFloat(searchParams.get('lon') ?? '')
    const zoom = parseFloat(searchParams.get('zoom') ?? '')
    if (!isNaN(lat) && !isNaN(lon)) {
      const delta = zoom > 10 ? 0.05 : 0.15
      setFlyToBbox([lon - delta, lat - delta, lon + delta, lat + delta])
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.delete('lat'); next.delete('lon'); next.delete('zoom')
        return next
      }, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Timeline state
  const [timelinePeriodIndex, setTimelinePeriodIndex] = useState<number | null>(null)
  const [timelineData, setTimelineData] = useState<ClassificationTimeline | null>(null)

  const handleToggleWfsLayer = useCallback((layerId: WfsLayerId, groupId: string) => {
    setActiveWfsLayers(prev => {
      const next = new Set(prev)
      const group = LAYER_GROUPS.find(g => g.id === groupId)
      if (group?.mode === 'radio') {
        group.layers.forEach(l => next.delete(l.id))
        if (!prev.has(layerId)) next.add(layerId)
      } else {
        if (next.has(layerId)) next.delete(layerId)
        else next.add(layerId)
      }
      return next
    })
  }, [])

  /** Activate a WFS layer (always add, never toggle off) */
  const activateWfsLayer = useCallback((layerId: WfsLayerId) => {
    setActiveWfsLayers(prev => {
      const next = new Set(prev)
      const group = LAYER_GROUPS.find(g => g.layers.some(l => l.id === layerId))
      if (group?.mode === 'radio') {
        group.layers.forEach(l => next.delete(l.id))
      }
      next.add(layerId)
      return next
    })
  }, [])

  // Preload all WFS layers on mount so toggling is instant
  const regionHydro = useWfsLayer('region-hydro', true)
  const secteurHydro = useWfsLayer('secteur-hydro', true)
  const sousSecteurHydro = useWfsLayer('sous-secteur-hydro', true)
  const zoneHydro = useWfsLayer('zone-hydro', true)
  const coursEau1 = useWfsLayer('cours-eau-1', true)
  const coursEau2 = useWfsLayer('cours-eau-2', true)
  const planEau = useWfsLayer('plan-eau', true)
  const masseEauRiv = useWfsLayer('masse-eau-riv', true)

  // Raw WFS data (unfiltered) — used by SearchBar for searching all features
  const wfsDataAll = useMemo(() => {
    const raw: Record<string, any> = {}
    if (regionHydro.data) raw['region-hydro'] = regionHydro.data
    if (secteurHydro.data) raw['secteur-hydro'] = secteurHydro.data
    if (sousSecteurHydro.data) raw['sous-secteur-hydro'] = sousSecteurHydro.data
    if (zoneHydro.data) raw['zone-hydro'] = zoneHydro.data
    if (coursEau1.data) raw['cours-eau-1'] = coursEau1.data
    if (coursEau2.data) raw['cours-eau-2'] = coursEau2.data
    if (planEau.data) raw['plan-eau'] = planEau.data
    if (masseEauRiv.data) raw['masse-eau-riv'] = masseEauRiv.data
    return raw
  }, [regionHydro.data, secteurHydro.data, sousSecteurHydro.data, zoneHydro.data,
      coursEau1.data, coursEau2.data, planEau.data, masseEauRiv.data])

  // Filtered WFS data for map display (bbox-filtered when spatial selection active)
  const wfsData = useMemo(() => {
    if (!activeBbox) return wfsDataAll
    const filtered: Record<string, any> = {}
    for (const [key, data] of Object.entries(wfsDataAll)) {
      filtered[key] = filterGeoJSONByBbox(data, activeBbox)
    }
    return filtered
  }, [wfsDataAll, activeBbox])

  const handleStationClick = useCallback((code: string, type: 'piezo' | 'hydro') => {
    setSelectedStation(prev => prev?.code === code && prev?.type === type ? null : { code, type })
  }, [])

  const handleEmptyClick = useCallback(() => {
    setSelectedStation(null)
    setSpatialStationCodes(null)
    setActiveBbox(null)
  }, [])

  const handleDeptClick = useCallback((code: string | null) => {
    setSelectedStation(null)
    setSpatialStationCodes(null)
    setFilter('dept', code ?? undefined)
    if (!code) setActiveBbox(null)
  }, [setFilter])

  const handleBassinClick = useCallback((code: string | null) => {
    setSelectedStation(null)
    setSpatialStationCodes(null)
    setFilter('bassin', code ?? undefined)
    if (!code) setActiveBbox(null)
  }, [setFilter])

  const handleSpatialFilter = useCallback((codes: string[] | null) => {
    setSelectedStation(null)
    setSpatialStationCodes(codes)
    if (!codes) setActiveBbox(null)
  }, [])

  const handleBboxChange = useCallback((bbox: Bbox | null) => {
    setActiveBbox(bbox)
  }, [])

  // Timeline period change handler
  const handleTimelinePeriodChange = useCallback((periodIndex: number | null, timeline: ClassificationTimeline | null) => {
    setTimelinePeriodIndex(periodIndex)
    setTimelineData(timeline)
  }, [])

  // Features with timeline classification override
  const displayFeatures = useMemo<StationGeoJSONFeature[]>(() => {
    if (timelinePeriodIndex == null || !timelineData) return filteredFeatures
    return filteredFeatures.map(f => {
      const arr = timelineData.stations[f.properties.code]
      if (!arr) return f
      const cls = TIMELINE_CLASSIFICATIONS[arr[timelinePeriodIndex]] ?? null
      if (cls === f.properties.classification) return f
      return {
        ...f,
        properties: { ...f.properties, classification: cls === 'UNKNOWN' ? null : cls },
      }
    })
  }, [filteredFeatures, timelinePeriodIndex, timelineData])

  // Universal search action handler
  const handleSearchAction = useCallback((action: SearchAction) => {
    switch (action.kind) {
      case 'station':
        if (action.stationType === 'piezo') setShowPiezo(true)
        if (action.stationType === 'hydro') setShowHydro(true)
        setSelectedStation({ code: action.code, type: action.stationType! })
        if (action.geometry) {
          setFlyToBbox(computeBboxFromGeometry(action.geometry))
        }
        break

      case 'department':
        setSelectedStation(null)
        setSpatialStationCodes(null)
        setShowRegions(false); setShowDepts(true); setShowHER(false); setShowSandre(false)
        setFilter('dept', action.code)
        if (action.geometry) {
          const bbox = computeBboxFromGeometry(action.geometry)
          setActiveBbox(bbox)
          setFlyToBbox(bbox)
        }
        break

      case 'region': {
        setSelectedStation(null)
        setShowRegions(true); setShowDepts(false); setShowHER(false); setShowSandre(false)
        if (action.geometry) {
          const bbox = computeBboxFromGeometry(action.geometry)
          setActiveBbox(bbox)
          setFlyToBbox(bbox)
          const codes = stationsInGeometry(geojsonData?.features ?? [], action.geometry)
          setSpatialStationCodes(codes.length > 0 ? codes : null)
        }
        break
      }

      case 'bassin': {
        setSelectedStation(null)
        setShowRegions(false); setShowDepts(false); setShowHER(false); setShowSandre(true)
        if (action.geometry) {
          const bbox = computeBboxFromGeometry(action.geometry)
          setActiveBbox(bbox)
          setFlyToBbox(bbox)
          const codes = stationsInGeometry(geojsonData?.features ?? [], action.geometry)
          setSpatialStationCodes(codes.length > 0 ? codes : null)
          setFilter('bassin', action.code)
        }
        break
      }

      case 'her': {
        setSelectedStation(null)
        setShowRegions(false); setShowDepts(false); setShowHER(true); setShowSandre(false)
        if (action.geometry) {
          const bbox = computeBboxFromGeometry(action.geometry)
          setActiveBbox(bbox)
          setFlyToBbox(bbox)
          const codes = stationsInGeometry(geojsonData?.features ?? [], action.geometry)
          setSpatialStationCodes(codes.length > 0 ? codes : null)
        }
        break
      }

      case 'bdlisa': {
        setSelectedStation(null)
        if (action.geometry) {
          const bbox = computeBboxFromGeometry(action.geometry)
          setActiveBbox(bbox)
          setFlyToBbox(bbox)
          const codes = stationsInGeometry(geojsonData?.features ?? [], action.geometry)
          setSpatialStationCodes(codes.length > 0 ? codes : null)
        }
        break
      }

      case 'wfs':
        if (action.wfsLayerId) {
          activateWfsLayer(action.wfsLayerId)
        }
        if (action.geometry) {
          setFlyToBbox(computeBboxFromGeometry(action.geometry))
        }
        break
    }
  }, [setFilter, activateWfsLayer, geojsonData])

  // Compute the BDLISA basin code for the selected piezo station (for map highlighting)
  const highlightedBasinCode = useMemo(() => {
    if (!selectedStation || selectedStation.type !== 'piezo') return null
    const feat = (geojsonData?.features ?? []).find(f => f.properties.code === selectedStation.code)
    const bdlisa = feat?.properties?.codes_bdlisa
    if (!bdlisa) return null
    return bdlisa.split(',')[0].trim()
  }, [selectedStation, geojsonData])

  const stationCounts = useMemo(() => {
    const all = geojsonData?.features ?? []
    return {
      filteredPiezo: filteredFeatures.filter(f => f.properties.type === 'piezo').length,
      filteredHydro: filteredFeatures.filter(f => f.properties.type === 'hydro').length,
      totalPiezo: all.filter(f => f.properties.type === 'piezo').length,
      totalHydro: all.filter(f => f.properties.type === 'hydro').length,
    }
  }, [filteredFeatures, geojsonData])

  return (
    <div className="relative h-full">
      {geojsonError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-red-900/90 text-red-200 px-4 py-2 rounded-lg text-sm">
          Erreur lors du chargement des stations. <button onClick={() => window.location.reload()} className="underline ml-2">Reessayer</button>
        </div>
      )}

      <ObservatoryMap
        features={displayFeatures}
        showPiezo={showPiezo}
        showHydro={showHydro}
        onStationClick={handleStationClick}
        onEmptyClick={handleEmptyClick}
        onDeptClick={handleDeptClick}
        activeCodeDepartement={filters.codeDepartement}
        showRegions={showRegions}
        showDepts={showDepts}
        showHER={showHER}
        showSandre={showSandre}
        onBassinClick={handleBassinClick}
        activeCodeBassin={filters.codeBassin}
        onSpatialFilter={handleSpatialFilter}
        onBboxChange={handleBboxChange}
        activeWfsLayers={activeWfsLayers}
        wfsData={wfsData}
        highlightedBasinCode={highlightedBasinCode}
        selectedStationCode={selectedStation?.code ?? null}
        flyToBbox={flyToBbox}
        onFlyToComplete={() => setFlyToBbox(null)}
      />

      <SearchBar
        features={geojsonData?.features}
        wfsData={wfsDataAll}
        onSearchAction={handleSearchAction}
      />

      <RightDrawer
        showPiezo={showPiezo}
        setShowPiezo={setShowPiezo}
        showHydro={showHydro}
        setShowHydro={setShowHydro}
        filters={filters}
        setFilter={setFilter}
        filteredCount={filteredFeatures.length}
        totalCount={geojsonData?.features?.length ?? 0}
        showRegions={showRegions}
        setShowRegions={setShowRegions}
        showDepts={showDepts}
        setShowDepts={setShowDepts}
        showHER={showHER}
        setShowHER={setShowHER}
        showSandreDistricts={showSandre}
        setShowSandreDistricts={setShowSandre}
        activeWfsLayers={activeWfsLayers}
        onToggleWfsLayer={handleToggleWfsLayer}
        onResetSpatial={() => { setSpatialStationCodes(null); setActiveBbox(null) }}
      />

      {selectedStation && (
        <StationDrawer
          code={selectedStation.code}
          type={selectedStation.type}
          onClose={() => setSelectedStation(null)}
        />
      )}

      <TimelineSlider onPeriodChange={handleTimelinePeriodChange} />

      <KPIBar
        filteredPiezo={stationCounts.filteredPiezo}
        filteredHydro={stationCounts.filteredHydro}
        totalPiezo={stationCounts.totalPiezo}
        totalHydro={stationCounts.totalHydro}
      />
    </div>
  )
}
