import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ObservatoryMap } from '../components/map/ObservatoryMap'
import { StationPopup } from '../components/map/StationPopup'
import { KPIBar } from '../components/map/KPIBar'
import { SearchBar } from '../components/map/SearchBar'
import { TemporalSlider } from '../components/map/TemporalSlider'
import { GlobalFilters } from '../components/filters/GlobalFilters'
import { useStationsGeoJSON } from '../hooks/useStations'
import type { StationGeoJSONFeature } from '../lib/types'
import { useERA5Dates, useERA5Monthly } from '../hooks/useERA5'
import { useFilters } from '../hooks/useFilters'
import { api } from '../lib/api'

export default function ObservatoryPage() {
  const { filters, setFilter, apiParams } = useFilters()
  const { data: geojsonData, isError: geojsonError } = useStationsGeoJSON()
  const { data: nationalStats } = useQuery({
    queryKey: ['stats', 'national'],
    queryFn: api.stats.national,
  })

  const filteredFeatures = useMemo<StationGeoJSONFeature[]>(() => {
    const all = geojsonData?.features ?? []
    return all.filter(f => {
      if (filters.codeDepartement && f.properties.code_departement !== filters.codeDepartement) return false
      if (filters.classification?.length && !filters.classification.includes(f.properties.classification ?? '')) return false
      return true
    })
  }, [geojsonData, filters.codeDepartement, filters.classification])

  const [selectedStation, setSelectedStation] = useState<{ code: string; type: 'piezo' | 'hydro' } | null>(null)
  const [showPiezo, setShowPiezo] = useState(true)
  const [showHydro, setShowHydro] = useState(true)

  // ERA5 temporal controls
  const [showERA5, setShowERA5] = useState(false)
  const [era5Variable, setERA5Variable] = useState<'total_precipitation' | 'temperature_2m'>('total_precipitation')
  const [era5DateIndex, setERA5DateIndex] = useState(0)
  const [era5Playing, setERA5Playing] = useState(false)
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: era5Dates } = useERA5Dates()
  const currentMonth = era5Dates?.[era5DateIndex]
  const { data: era5Data } = useERA5Monthly(showERA5 ? currentMonth : undefined)

  // Set slider to last date when dates load
  useEffect(() => {
    if (era5Dates?.length) {
      setERA5DateIndex(era5Dates.length - 1)
    }
  }, [era5Dates])

  // Playback logic - era5Dates intentionally excluded from deps to avoid interval leak
  useEffect(() => {
    if (!era5Playing || !era5Dates?.length) return
    const total = era5Dates.length
    const id = setInterval(() => {
      setERA5DateIndex(prev => {
        if (prev >= total - 1) {
          setERA5Playing(false)
          return prev
        }
        return prev + 1
      })
    }, 800)
    playIntervalRef.current = id
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [era5Playing])

  const handleStationClick = useCallback((code: string, type: 'piezo' | 'hydro') => {
    setSelectedStation({ code, type })
  }, [])

  const handleDeptClick = useCallback((code: string | null) => {
    setFilter('dept', code ?? undefined)
  }, [setFilter])

  const totalCount = filteredFeatures.length

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
        era5Data={era5Data}
        era5Variable={era5Variable}
        showERA5={showERA5}
      />

      <SearchBar
        features={geojsonData?.features}
        onSelect={handleStationClick}
      />

      <GlobalFilters
        filters={filters}
        setFilter={setFilter}
        filteredCount={filteredFeatures.length}
        totalCount={geojsonData?.features?.length ?? 0}
      />

      {/* Layer toggles */}
      <div className="absolute top-16 md:top-4 left-4 md:left-[22rem] z-10 flex gap-1">
        <button
          onClick={() => setShowPiezo(!showPiezo)}
          aria-label="Afficher couche piézométrique"
          aria-pressed={showPiezo}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
            showPiezo
              ? 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30'
              : 'bg-bg-card/90 text-text-secondary border-white/10'
          }`}
        >
          Piezo
        </button>
        <button
          onClick={() => setShowHydro(!showHydro)}
          aria-label="Afficher couche hydrométrique"
          aria-pressed={showHydro}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
            showHydro
              ? 'bg-accent-indigo/20 text-accent-indigo border-accent-indigo/30'
              : 'bg-bg-card/90 text-text-secondary border-white/10'
          }`}
        >
          Hydro
        </button>
        <button
          onClick={() => setShowERA5(!showERA5)}
          aria-label="Afficher couche ERA5"
          aria-pressed={showERA5}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
            showERA5
              ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
              : 'bg-bg-card/90 text-text-secondary border-white/10'
          }`}
        >
          ERA5
        </button>
      </div>

      {selectedStation && (
        <StationPopup
          code={selectedStation.code}
          type={selectedStation.type}
          onClose={() => setSelectedStation(null)}
        />
      )}

      {showERA5 && era5Dates?.length ? (
        <TemporalSlider
          dates={era5Dates}
          currentIndex={era5DateIndex}
          onIndexChange={setERA5DateIndex}
          isPlaying={era5Playing}
          onPlayToggle={() => setERA5Playing(!era5Playing)}
          variable={era5Variable}
          onVariableChange={setERA5Variable}
        />
      ) : null}

      <KPIBar />
    </div>
  )
}
