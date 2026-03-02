import { useState, useEffect, useRef, useCallback } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Map, TrendingUp, AlertTriangle, GitCompareArrows, Search } from 'lucide-react'
import { api } from '../../lib/api'

const NAV_ITEMS = [
  { to: '/', icon: Map, label: 'Observatoire' },
  { to: '/trends', icon: TrendingUp, label: 'Tendances' },
  { to: '/alerts', icon: AlertTriangle, label: 'Alertes' },
  { to: '/compare', icon: GitCompareArrows, label: 'Comparer' },
] as const

interface SidebarProps {
  onNavigate?: () => void
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Click outside handler
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Debounced search
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
    setHighlightIndex(-1)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!query || query.length < 2) {
      setSearchResults([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const [piezo, hydro] = await Promise.all([
          api.stations.piezo({ search: query }),
          api.stations.hydro({ search: query }),
        ])

        const piezoResults = (piezo ?? []).slice(0, 4).map((s: any) => ({
          code: s.code_bss,
          name: s.nom_commune || s.code_bss,
          commune: s.nom_commune,
          type: 'piezo' as const,
        }))

        const hydroResults = (hydro ?? []).slice(0, 4).map((s: any) => ({
          code: s.code_station,
          name: s.libelle_station || s.code_station,
          commune: s.nom_commune,
          type: 'hydro' as const,
        }))

        setSearchResults([...piezoResults, ...hydroResults])
        setSearchOpen(true)
      } catch {
        // Fallback: client-side filter if API doesn't support search param
        // This will be empty but won't crash
        setSearchResults([])
      }
    }, 300)
  }, [])

  const selectResult = useCallback((result: any) => {
    navigate(`/station/${result.type}/${result.code}`)
    setSearchQuery('')
    setSearchResults([])
    setSearchOpen(false)
    onNavigate?.()
  }, [navigate, onNavigate])

  // Keyboard navigation for search results
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!searchOpen || searchResults.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex(prev => Math.min(prev + 1, searchResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault()
      selectResult(searchResults[highlightIndex])
    } else if (e.key === 'Escape') {
      setSearchOpen(false)
    }
  }, [searchOpen, searchResults, highlightIndex, selectResult])

  return (
    <nav className="w-48 md:w-16 md:hover:w-48 transition-all duration-300 bg-bg-card border-r border-white/5 flex flex-col py-4 gap-1 group overflow-hidden shrink-0 h-full">
      <div className="mb-4 flex items-center gap-3 px-3 w-full">
        <div className="w-10 h-10 rounded-lg bg-accent-cyan/20 flex items-center justify-center shrink-0">
          <span className="text-accent-cyan font-bold text-lg">H</span>
        </div>
        <span className="text-sm font-semibold text-text-primary md:opacity-0 md:group-hover:opacity-100 transition-opacity whitespace-nowrap">
          Hydro Dashboard
        </span>
      </div>

      {/* Global search */}
      <div ref={wrapperRef} className="px-2 mb-3 relative">
        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-bg-primary border border-white/10 rounded-lg">
          <Search className="w-3.5 h-3.5 text-text-secondary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Rechercher..."
            aria-label="Rechercher une station"
            className="bg-transparent text-xs text-text-primary placeholder:text-text-secondary focus:outline-none w-full md:w-0 md:group-hover:w-full transition-all"
          />
        </div>

        {searchOpen && searchResults.length > 0 && (
          <div className="absolute left-2 right-2 top-full mt-1 bg-bg-card border border-white/10 rounded-lg overflow-hidden shadow-xl z-50 max-h-64 overflow-y-auto" role="listbox">
            {searchResults.map((r, i) => (
              <button
                key={`${r.type}-${r.code}`}
                onClick={() => selectResult(r)}
                role="option"
                aria-selected={i === highlightIndex}
                className={`w-full text-left px-3 py-2 text-xs border-b border-white/5 last:border-0 transition-colors ${
                  i === highlightIndex ? 'bg-bg-hover' : 'hover:bg-bg-hover'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${
                    r.type === 'piezo' ? 'bg-accent-cyan/20 text-accent-cyan' : 'bg-accent-indigo/20 text-accent-indigo'
                  }`}>
                    {r.type === 'piezo' ? 'P' : 'H'}
                  </span>
                  <span className="text-text-primary truncate">{r.name}</span>
                </div>
                <p className="text-[10px] text-text-secondary mt-0.5 ml-5">{r.code}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg w-full transition-colors ${
              isActive
                ? 'bg-accent-cyan/10 text-accent-cyan'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
            }`
          }
        >
          <Icon className="w-5 h-5 shrink-0" />
          <span className="text-sm md:opacity-0 md:group-hover:opacity-100 transition-opacity whitespace-nowrap">
            {label}
          </span>
        </NavLink>
      ))}
    </nav>
  )
}
