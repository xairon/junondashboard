import { useState, useCallback, useMemo } from 'react'
import { ObservatoryMap } from '../components/map/ObservatoryMap'
import { StationDrawer } from '../components/map/StationDrawer'
import { KPIBar } from '../components/map/KPIBar'
import { SearchBar } from '../components/map/SearchBar'
import { RightDrawer } from '../components/map/RightDrawer'
import { useStationsGeoJSON } from '../hooks/useStations'
import { useWfsLayer } from '../hooks/useWfsLayer'
import { LAYER_GROUPS } from '../lib/layerConfig'
import type { StationGeoJSONFeature, WfsLayerId } from '../lib/types'
import { useFilters } from '../hooks/useFilters'

export default function ObservatoryPage() {
  const { filters, setFilter } = useFilters()
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
      if (filters.stationCodes?.length) {
        if (!filters.stationCodes.includes(f.properties.code)) return false
      }
      return true
    })
  }, [geojsonData, filters.activeOnly, filters.codeDepartement, filters.classification, filters.codeBdlisa, filters.lastMeasurementAfter, filters.stationCodes])

  const [selectedStation, setSelectedStation] = useState<{ code: string; type: 'piezo' | 'hydro' } | null>(null)
  const [showPiezo, setShowPiezo] = useState(true)
  const [showHydro, setShowHydro] = useState(true)

  const [showRegions, setShowRegions] = useState(false)
  const [showDepts, setShowDepts] = useState(false)
  const [showHER, setShowHER] = useState(false)
  const [showSandre, setShowSandre] = useState(false)

  const [activeWfsLayers, setActiveWfsLayers] = useState<Set<WfsLayerId>>(new Set())

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

  const regionHydro = useWfsLayer('region-hydro', activeWfsLayers.has('region-hydro'))
  const secteurHydro = useWfsLayer('secteur-hydro', activeWfsLayers.has('secteur-hydro'))
  const sousSecteurHydro = useWfsLayer('sous-secteur-hydro', activeWfsLayers.has('sous-secteur-hydro'))
  const zoneHydro = useWfsLayer('zone-hydro', activeWfsLayers.has('zone-hydro'))
  const coursEau1 = useWfsLayer('cours-eau-1', activeWfsLayers.has('cours-eau-1'))
  const coursEau2 = useWfsLayer('cours-eau-2', activeWfsLayers.has('cours-eau-2'))
  const planEau = useWfsLayer('plan-eau', activeWfsLayers.has('plan-eau'))
  const masseEauRiv = useWfsLayer('masse-eau-riv', activeWfsLayers.has('masse-eau-riv'))

  const wfsData = useMemo(() => {
    const d: Record<string, any> = {}
    if (regionHydro.data) d['region-hydro'] = regionHydro.data
    if (secteurHydro.data) d['secteur-hydro'] = secteurHydro.data
    if (sousSecteurHydro.data) d['sous-secteur-hydro'] = sousSecteurHydro.data
    if (zoneHydro.data) d['zone-hydro'] = zoneHydro.data
    if (coursEau1.data) d['cours-eau-1'] = coursEau1.data
    if (coursEau2.data) d['cours-eau-2'] = coursEau2.data
    if (planEau.data) d['plan-eau'] = planEau.data
    if (masseEauRiv.data) d['masse-eau-riv'] = masseEauRiv.data
    return d
  }, [regionHydro.data, secteurHydro.data, sousSecteurHydro.data, zoneHydro.data,
      coursEau1.data, coursEau2.data, planEau.data, masseEauRiv.data])

  const handleStationClick = useCallback((code: string, type: 'piezo' | 'hydro') => {
    setSelectedStation({ code, type })
  }, [])

  const handleDeptClick = useCallback((code: string | null) => {
    setFilter('dept', code ?? undefined)
    setFilter('stations', undefined)
  }, [setFilter])

  const handleBassinClick = useCallback((code: string | null) => {
    setFilter('bassin', code ?? undefined)
    setFilter('stations', undefined)
  }, [setFilter])

  const handleSpatialFilter = useCallback((codes: string[] | null) => {
    setFilter('stations', codes ?? undefined)
  }, [setFilter])

  return (
    <div className="relative h-full">
      {geojsonError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-red-900/90 text-red-200 px-4 py-2 rounded-lg text-sm">
          Erreur lors du chargement des stations. <button onClick={() => window.location.reload()} className="underline ml-2">Réessayer</button>
        </div>
      )}

      <ObservatoryMap
        features={filteredFeatures}
        showPiezo={showPiezo}
        showHydro={showHydro}
        onStationClick={handleStationClick}
        onDeptClick={handleDeptClick}
        activeCodeDepartement={filters.codeDepartement}
        showRegions={showRegions}
        showDepts={showDepts}
        showHER={showHER}
        showSandre={showSandre}
        onBassinClick={handleBassinClick}
        activeCodeBassin={filters.codeBassin}
        onSpatialFilter={handleSpatialFilter}
        activeWfsLayers={activeWfsLayers}
        wfsData={wfsData}
      />

      <SearchBar
        features={geojsonData?.features}
        onSelect={handleStationClick}
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
      />

      {selectedStation && (
        <StationDrawer
          code={selectedStation.code}
          type={selectedStation.type}
          onClose={() => setSelectedStation(null)}
        />
      )}

      <KPIBar />
    </div>
  )
}
