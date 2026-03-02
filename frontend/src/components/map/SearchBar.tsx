import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Search, X } from 'lucide-react'

interface Props {
  piezoStations?: any[]
  hydroStations?: any[]
  onSelect: (station: any, type: 'piezo' | 'hydro') => void
}

export function SearchBar({ piezoStations, hydroStations, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Click-outside handler
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const results = useMemo(() => {
    if (!query || query.length < 2) return []
    const q = query.toLowerCase()
    const piezo = (piezoStations ?? [])
      .filter((s: any) => {
        const name = (s.nom_commune || s.code_bss || '').toLowerCase()
        return name.includes(q) || (s.code_bss || '').toLowerCase().includes(q)
      })
      .slice(0, 5)
      .map((s: any) => ({ ...s, _type: 'piezo' as const }))

    const hydro = (hydroStations ?? [])
      .filter((s: any) => {
        const name = (s.libelle_station || s.code_station || '').toLowerCase()
        const river = (s.libelle_cours_eau || '').toLowerCase()
        return name.includes(q) || river.includes(q) || (s.code_station || '').toLowerCase().includes(q)
      })
      .slice(0, 5)
      .map((s: any) => ({ ...s, _type: 'hydro' as const }))

    return [...piezo, ...hydro]
  }, [query, piezoStations, hydroStations])

  const selectItem = useCallback((s: any) => {
    onSelect(s, s._type)
    setQuery('')
    setOpen(false)
    setHighlightIndex(-1)
  }, [onSelect])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault()
      selectItem(results[highlightIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setHighlightIndex(-1)
    }
  }, [open, results, highlightIndex, selectItem])

  return (
    <div ref={wrapperRef} className="absolute top-4 left-12 md:left-4 z-10 w-56 md:w-80">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlightIndex(-1) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Rechercher une station..."
          aria-label="Rechercher une station sur la carte"
          aria-expanded={open && results.length > 0}
          aria-controls="search-results-list"
          role="combobox"
          aria-autocomplete="list"
          className="w-full pl-9 pr-8 py-2.5 bg-bg-card/90 backdrop-blur-md border border-white/10 rounded-lg text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent-cyan/50"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setOpen(false); setHighlightIndex(-1) }}
            aria-label="Effacer la recherche"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-bg-hover rounded"
          >
            <X className="w-3 h-3 text-text-secondary" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div
          id="search-results-list"
          role="listbox"
          className="mt-1 bg-bg-card/95 backdrop-blur-md border border-white/10 rounded-lg overflow-hidden shadow-xl max-h-64 overflow-y-auto"
        >
          {results.map((s: any, i: number) => (
            <button
              key={`${s._type}-${s.code_bss || s.code_station}-${i}`}
              role="option"
              aria-selected={i === highlightIndex}
              onClick={() => selectItem(s)}
              className={`w-full text-left px-3 py-2 transition-colors border-b border-white/5 last:border-0 ${
                i === highlightIndex ? 'bg-bg-hover' : 'hover:bg-bg-hover'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${s._type === 'piezo' ? 'bg-accent-cyan/20 text-accent-cyan' : 'bg-accent-indigo/20 text-accent-indigo'}`}>
                  {s._type === 'piezo' ? 'PIEZO' : 'HYDRO'}
                </span>
                <span className="text-sm text-text-primary truncate">
                  {s._type === 'piezo' ? (s.nom_commune || s.code_bss) : (s.libelle_station || s.code_station)}
                </span>
              </div>
              <p className="text-xs text-text-secondary mt-0.5 ml-14">
                {s.nom_departement || ''} &middot; {s.code_bss || s.code_station}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
