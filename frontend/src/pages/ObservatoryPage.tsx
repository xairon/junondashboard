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
  // Spatial station codes kept in local state (not URL) to avoid 414 URI Too Large
  const [spatialStationCodes, setSpatialStationCodes] = useState<string[] | null>(null)
  const [selectedStation, setSelectedStation] = useState<{ code: string; type: 'piezo' | 'hydro' } | null>(null)
  const [showPiezo, setShowPiezo] = useState(true)
  const [showHydro, setShowHydro] = useState(true)
  const [showExcluded, setShowExcluded] = useState(true)
  const filteredFeatures = useMemo<StationGeoJSONFeature[]>(() => {
    const all = geojsonData?.features ?? []
    return all.filter(f => {
      // Type visibility
      if (f.properties.type === 'piezo' && !showPiezo) return false
      if (f.properties.type === 'hydro' && !showHydro) return false
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
      // Reliability filter — skip when all three are unchecked (= no filter)
      const anyReliabilityActive = filters.showFiable || filters.showIndicatif || filters.showInsuffisant
      if (anyReliabilityActive) {
        const fiab = f.properties.fiabilite ?? 'insuffisant'
        if (fiab === 'fiable' && !filters.showFiable) return false
        if (fiab === 'indicatif' && !filters.showIndicatif) return false
        if (fiab === 'insuffisant' && !filters.showInsuffisant) return false
      }
      if (spatialStationCodes?.length) {
        if (!spatialStationCodes.includes(f.properties.code)) return false
      }
      return true
    })
  }, [geojsonData, showPiezo, showHydro, filters.activeOnly, filters.codeDepartement, filters.classification, filters.codeBdlisa, filters.lastMeasurementAfter, filters.minObservations, filters.showFiable, filters.showIndicatif, filters.showInsuffisant, spatialStationCodes])


  // Single active zone layer (exclusive) — admin or WFS zonage
  const [activeZoneLayer, setActiveZoneLayer] = useState<string | null>('regions')
  // Overlay layers (independent, combinable) — carthage + hydroeco
  const [overlayLayers, setOverlayLayers] = useState<Set<string>>(new Set())
  const [activeBbox, setActiveBbox] = useState<Bbox | null>(null)
  const [flyToBbox, setFlyToBbox] = useState<Bbox | null>(null)

  // Derive legacy props for ObservatoryMap from activeZoneLayer
  const showRegions = activeZoneLayer === 'regions'
  const showDepts = activeZoneLayer === 'depts'
  const showSandre = activeZoneLayer === 'bassins'
  const showHER = activeZoneLayer === 'her'

  // Derive activeWfsLayers for ObservatoryMap from zone + overlay
  const activeWfsLayers = useMemo(() => {
    const s = new Set<WfsLayerId>()
    // Zone WFS layers
    const wfsZones: WfsLayerId[] = ['region-hydro', 'secteur-hydro', 'sous-secteur-hydro', 'zone-hydro']
    if (activeZoneLayer && wfsZones.includes(activeZoneLayer as WfsLayerId)) {
      s.add(activeZoneLayer as WfsLayerId)
    }
    // Overlay layers
    overlayLayers.forEach(id => s.add(id as WfsLayerId))
    return s
  }, [activeZoneLayer, overlayLayers])

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

  /** Toggle an overlay layer (independent, combinable) */
  const handleOverlayToggle = useCallback((id: string) => {
    setOverlayLayers(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
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
    // Clear spatial filters from previous region/bassin clicks so counters stay meaningful
    setSpatialStationCodes(null)
    setActiveBbox(null)
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
  // When timeline is active: start from ALL features (not just filtered),
  // keep only stations that had data at that period (!= UNKNOWN),
  // apply non-reliability filters on top (dept, classification, spatial, etc.)
  const displayFeatures = useMemo<StationGeoJSONFeature[]>(() => {
    if (timelinePeriodIndex == null || !timelineData) return filteredFeatures

    const all = geojsonData?.features ?? []
    return all
      .filter(f => {
        // Must have timeline data at this period
        const arr = timelineData.stations[f.properties.code]
        if (!arr) return false
        const clsIdx = arr[timelinePeriodIndex]
        if (clsIdx === 7 || clsIdx == null) return false // 7 = UNKNOWN = no data

        // Type visibility
        if (f.properties.type === 'piezo' && !showPiezo) return false
        if (f.properties.type === 'hydro' && !showHydro) return false

        // Apply non-reliability filters (dept, spatial, classification from timeline)
        if (filters.codeDepartement && f.properties.code_departement !== filters.codeDepartement) return false
        if (filters.codeBdlisa && f.properties.type === 'piezo') {
          const codes = f.properties.codes_bdlisa ?? ''
          if (!codes.startsWith(filters.codeBdlisa)) return false
        }
        if (spatialStationCodes?.length) {
          if (!spatialStationCodes.includes(f.properties.code)) return false
        }
        // Classification filter applies to timeline classification, not current
        if (filters.classification?.length) {
          const cls = TIMELINE_CLASSIFICATIONS[clsIdx]
          if (!filters.classification.includes(cls)) return false
        }
        return true
      })
      .map(f => {
        const cls = TIMELINE_CLASSIFICATIONS[timelineData.stations[f.properties.code][timelinePeriodIndex]]
        return {
          ...f,
          properties: { ...f.properties, classification: cls === 'UNKNOWN' ? null : cls },
        }
      })
  }, [filteredFeatures, timelinePeriodIndex, timelineData, geojsonData, showPiezo, showHydro,
      filters.codeDepartement, filters.codeBdlisa, filters.classification, spatialStationCodes])

  // Stations excluded by reliability/activeOnly filters — shown as grey unclustered markers
  // During timeline: grey = station existed (had data before this period) but has no data now
  const excludedFeatures = useMemo<StationGeoJSONFeature[]>(() => {
    const activeSet = new Set(displayFeatures.map(f => f.properties.code))
    const all = geojsonData?.features ?? []

    // --- Timeline mode ---
    if (timelinePeriodIndex != null && timelineData) {
      // Grey markers only when activeOnly is checked
      if (!filters.activeOnly) return []

      return all.filter(f => {
        if (activeSet.has(f.properties.code)) return false
        if (f.properties.type === 'piezo' && !showPiezo) return false
        if (f.properties.type === 'hydro' && !showHydro) return false

        // Station must have had data at some point BEFORE this period (it "existed")
        const arr = timelineData.stations[f.properties.code]
        if (!arr) return false
        let existed = false
        for (let i = 0; i < timelinePeriodIndex; i++) {
          if (arr[i] != null && arr[i] !== 7) { existed = true; break }
        }
        if (!existed) return false

        // Apply same geo filters as displayFeatures
        if (filters.codeDepartement && f.properties.code_departement !== filters.codeDepartement) return false
        if (filters.codeBdlisa && f.properties.type === 'piezo') {
          const codes = f.properties.codes_bdlisa ?? ''
          if (!codes.startsWith(filters.codeBdlisa)) return false
        }
        if (spatialStationCodes?.length) {
          if (!spatialStationCodes.includes(f.properties.code)) return false
        }
        return true
      })
    }

    // --- Normal mode ---
    return all.filter(f => {
      if (activeSet.has(f.properties.code)) return false
      if (f.properties.type === 'piezo' && !showPiezo) return false
      if (f.properties.type === 'hydro' && !showHydro) return false
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
  }, [displayFeatures, geojsonData, showPiezo, showHydro, filters.activeOnly, filters.codeDepartement, filters.classification, filters.codeBdlisa, filters.lastMeasurementAfter, filters.minObservations, spatialStationCodes, timelinePeriodIndex, timelineData])

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
        setActiveZoneLayer('depts')
        setFilter('dept', action.code)
        if (action.geometry) {
          const bbox = computeBboxFromGeometry(action.geometry)
          setActiveBbox(bbox)
          setFlyToBbox(bbox)
        }
        break

      case 'region': {
        setSelectedStation(null)
        setActiveZoneLayer('regions')
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
        setActiveZoneLayer('bassins')
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
        setActiveZoneLayer('her')
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
          // WFS zone layers go to activeZoneLayer, overlays go to overlayLayers
          const wfsZones = ['region-hydro', 'secteur-hydro', 'sous-secteur-hydro', 'zone-hydro']
          if (wfsZones.includes(action.wfsLayerId)) {
            setActiveZoneLayer(action.wfsLayerId)
          } else {
            setOverlayLayers(prev => new Set(prev).add(action.wfsLayerId!))
          }
        }
        if (action.geometry) {
          setFlyToBbox(computeBboxFromGeometry(action.geometry))
        }
        break
    }
  }, [setFilter, geojsonData])

  // Get the first BDLISA code for the selected piezo station
  const highlightedBasinCode = useMemo(() => {
    if (!selectedStation || selectedStation.type !== 'piezo') return null
    const feat = (geojsonData?.features ?? []).find(f => f.properties.code === selectedStation.code)
    const bdlisa = feat?.properties?.codes_bdlisa
    if (!bdlisa) return null
    return bdlisa.split(',')[0].trim()
  }, [selectedStation, geojsonData])

  // Get the site code for the selected hydro station
  const highlightedSiteCode = useMemo(() => {
    if (!selectedStation || selectedStation.type !== 'hydro') return null
    const feat = (geojsonData?.features ?? []).find(f => f.properties.code === selectedStation.code)
    return feat?.properties?.code_site ?? null
  }, [selectedStation, geojsonData])

  const stationCounts = useMemo(() => {
    const all = geojsonData?.features ?? []
    return {
      filteredPiezo: showPiezo ? filteredFeatures.filter(f => f.properties.type === 'piezo').length : 0,
      filteredHydro: showHydro ? filteredFeatures.filter(f => f.properties.type === 'hydro').length : 0,
      totalPiezo: showPiezo ? all.filter(f => f.properties.type === 'piezo').length : 0,
      totalHydro: showHydro ? all.filter(f => f.properties.type === 'hydro').length : 0,
    }
  }, [filteredFeatures, geojsonData, showPiezo, showHydro])

  return (
    <div className="relative h-full">
      {geojsonError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-red-900/90 text-red-200 px-4 py-2 rounded-lg text-sm">
          Erreur lors du chargement des stations. <button onClick={() => window.location.reload()} className="underline ml-2">Reessayer</button>
        </div>
      )}

      <ObservatoryMap
        features={displayFeatures}
        excludedFeatures={showExcluded ? excludedFeatures : []}
        allFeatures={geojsonData?.features}
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
        highlightedSiteCode={highlightedSiteCode}
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
        showExcluded={showExcluded}
        setShowExcluded={setShowExcluded}
        filters={filters}
        setFilter={setFilter}
        filteredPiezo={stationCounts.filteredPiezo}
        totalPiezo={stationCounts.totalPiezo}
        filteredHydro={stationCounts.filteredHydro}
        totalHydro={stationCounts.totalHydro}
        activeZoneLayer={activeZoneLayer}
        onZoneLayerChange={setActiveZoneLayer}
        overlayLayers={overlayLayers}
        onOverlayToggle={handleOverlayToggle}
        onResetSpatial={() => { setSpatialStationCodes(null); setActiveBbox(null) }}
        hasSpatialFilter={spatialStationCodes != null && spatialStationCodes.length > 0}
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
