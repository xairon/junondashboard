import { useState, useCallback, useMemo } from 'react'
import { ObservatoryMap } from '../components/map/ObservatoryMap'
import { StationPopup } from '../components/map/StationPopup'
import { KPIBar } from '../components/map/KPIBar'
import { SearchBar } from '../components/map/SearchBar'
import { GlobalFilters } from '../components/filters/GlobalFilters'
import { useStationsGeoJSON } from '../hooks/useStations'
import type { StationGeoJSONFeature } from '../lib/types'
import { useFilters } from '../hooks/useFilters'

// Simplified direct mapping: code_district (first char of code_cours_eau) -> CdBH
// Only handles direct letter matches (A,C,D,E,F,G,H); B->B1/B2 handled by startsWith
// Stations with unmapped code_district letters (I,J,K,L,...,Y) are not filtered out
function matchesBassin(codeDistrict: string | null | undefined, codeBassin: string): boolean {
  if (!codeDistrict) return false
  // Handle two-char CdBH codes like "B1", "B2" — match by first char
  if (codeBassin.length === 2 && /[A-Z][0-9]/.test(codeBassin)) {
    return codeDistrict === codeBassin[0]
  }
  return codeDistrict === codeBassin
}

export default function ObservatoryPage() {
  const { filters, setFilter, apiParams: _apiParams } = useFilters()
  const { data: geojsonData, isError: geojsonError } = useStationsGeoJSON()

  const filteredFeatures = useMemo<StationGeoJSONFeature[]>(() => {
    const all = geojsonData?.features ?? []
    return all.filter(f => {
      if (filters.codeDepartement && f.properties.code_departement !== filters.codeDepartement) return false
      if (filters.classification?.length && !filters.classification.includes(f.properties.classification ?? '')) return false
      if (filters.codeBdlisa && f.properties.type === 'piezo') {
        const codes = f.properties.codes_bdlisa ?? ''
        if (!codes.startsWith(filters.codeBdlisa)) return false
      }
      if (filters.codeBassin && f.properties.type === 'hydro') {
        if (!matchesBassin(f.properties.code_district, filters.codeBassin)) return false
      }
      return true
    })
  }, [geojsonData, filters.codeDepartement, filters.classification, filters.codeBdlisa, filters.codeBassin])

  const [selectedStation, setSelectedStation] = useState<{ code: string; type: 'piezo' | 'hydro' } | null>(null)
  const [showPiezo, setShowPiezo] = useState(true)
  const [showHydro, setShowHydro] = useState(true)

  // Calques panel state
  const [showCalques, setShowCalques] = useState(false)
  const [showRegions, setShowRegions] = useState(false)
  const [showDepts, setShowDepts] = useState(false)
  const [showBdlisa, setShowBdlisa] = useState(false)
  const [showSandre, setShowSandre] = useState(false)

  const handleStationClick = useCallback((code: string, type: 'piezo' | 'hydro') => {
    setSelectedStation({ code, type })
  }, [])

  const handleDeptClick = useCallback((code: string | null) => {
    setFilter('dept', code ?? undefined)
  }, [setFilter])

  const handleBdlisaClick = useCallback((code: string | null) => {
    setFilter('bdlisa', code ?? undefined)
  }, [setFilter])

  const handleBassinClick = useCallback((code: string | null) => {
    setFilter('bassin', code ?? undefined)
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
        showBdlisa={showBdlisa}
        showSandre={showSandre}
        onBdlisaClick={handleBdlisaClick}
        onBassinClick={handleBassinClick}
        activeCodeBdlisa={filters.codeBdlisa}
        activeCodeBassin={filters.codeBassin}
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

      {/* Layer toggles — Piézo + Hydro only */}
      <div className="absolute top-16 md:top-4 left-4 md:left-[22rem] z-10 flex gap-1">
        <button
          onClick={() => setShowPiezo(!showPiezo)}
          aria-label="Afficher couche piézométrique"
          aria-pressed={showPiezo}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${showPiezo ? 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30' : 'bg-bg-card/90 text-text-secondary border-white/10'}`}
        >
          Piezo
        </button>
        <button
          onClick={() => setShowHydro(!showHydro)}
          aria-label="Afficher couche hydrométrique"
          aria-pressed={showHydro}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${showHydro ? 'bg-accent-indigo/20 text-accent-indigo border-accent-indigo/30' : 'bg-bg-card/90 text-text-secondary border-white/10'}`}
        >
          Hydro
        </button>
      </div>

      {/* Calques floating panel — right side, below map nav controls */}
      <div className="absolute top-[8.5rem] right-3 z-10">
        <button
          onClick={() => setShowCalques(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${showCalques ? 'bg-bg-card border-white/20 text-text-primary' : 'bg-bg-card/80 border-white/10 text-text-secondary hover:text-text-primary'}`}
        >
          {/* Layers icon: stacked lines */}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          Calques
        </button>
        {showCalques && (
          <div className="mt-1 bg-bg-card/95 backdrop-blur-sm border border-white/10 rounded-lg p-3 min-w-[10rem]">
            <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-2">Couches géographiques</p>
            {([
              { label: 'Régions', state: showRegions, setState: setShowRegions },
              { label: 'Départements', state: showDepts, setState: setShowDepts },
              { label: 'Nappes (BDLISA)', state: showBdlisa, setState: setShowBdlisa },
              { label: 'Bassins (SANDRE)', state: showSandre, setState: setShowSandre },
            ] as const).map(({ label, state, setState }) => (
              <label key={label} className="flex items-center gap-2 py-1 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={state}
                  onChange={e => setState(e.target.checked)}
                  className="w-3.5 h-3.5 accent-accent-cyan rounded"
                />
                <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">{label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {selectedStation && (
        <StationPopup
          code={selectedStation.code}
          type={selectedStation.type}
          onClose={() => setSelectedStation(null)}
        />
      )}

      <KPIBar />
    </div>
  )
}
