import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ObservatoryMap } from '../components/map/ObservatoryMap'
import { StationPopup } from '../components/map/StationPopup'
import { KPIBar } from '../components/map/KPIBar'
import { SearchBar } from '../components/map/SearchBar'
import { TemporalSlider } from '../components/map/TemporalSlider'
import { GlobalFilters } from '../components/filters/GlobalFilters'
import { usePiezoStations, useHydroStations } from '../hooks/useStations'
import { useERA5Dates, useERA5Monthly } from '../hooks/useERA5'
import { useFilters } from '../hooks/useFilters'
import { api } from '../lib/api'

export default function ObservatoryPage() {
  const { filters, setFilter, apiParams } = useFilters()
  const { data: piezoStations } = usePiezoStations(apiParams)
  const { data: hydroStations } = useHydroStations(apiParams)
  const { data: nationalStats } = useQuery({
    queryKey: ['stats', 'national'],
    queryFn: api.stats.national,
  })

  const [selectedStation, setSelectedStation] = useState<{ station: any; type: 'piezo' | 'hydro' } | null>(null)
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

  const handleStationClick = useCallback((station: any, type: 'piezo' | 'hydro') => {
    setSelectedStation({ station, type })
  }, [])

  const totalCount = (piezoStations?.length ?? 0) + (hydroStations?.length ?? 0)

  return (
    <div className="relative h-full">
      <ObservatoryMap
        piezoStations={piezoStations}
        hydroStations={hydroStations}
        showPiezo={showPiezo}
        showHydro={showHydro}
        onStationClick={handleStationClick}
      />

      <SearchBar
        piezoStations={piezoStations}
        hydroStations={hydroStations}
        onSelect={handleStationClick}
      />

      <GlobalFilters
        filters={filters}
        setFilter={setFilter}
        filteredCount={totalCount}
        totalCount={(nationalStats?.total_piezo ?? 0) + (nationalStats?.total_hydro ?? 0)}
      />

      {/* Layer toggles */}
      <div className="absolute top-4 left-[22rem] z-10 flex gap-1">
        <button
          onClick={() => setShowPiezo(!showPiezo)}
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
          station={selectedStation.station}
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
