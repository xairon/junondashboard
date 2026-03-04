# Unified Panel & Layout Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current multi-float layout (sidebar + scattered buttons + overlapping panels) with a clean full-map layout: top nav, retractable right drawer (Données/Filtres/Calques), and left drawer for station info.

**Architecture:** The layout switches from `flex h-screen` with a left sidebar to a vertical stack: fixed TopNav (h-12) + full-bleed content area. The observatory page uses two CSS-animated drawers that overlay the map. All filter/layer/data-toggle state stays in ObservatoryPage; drawers are presentational. No new dependencies.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, MapLibre GL, Lucide icons, TanStack Query v5

**Design doc:** `docs/plans/2026-03-04-unified-panel-design.md`

---

## Task 1: Create TopNav component

**Files:**
- Create: `frontend/src/components/layout/TopNav.tsx`

**Step 1: Create TopNav.tsx**

This replaces `Sidebar.tsx`. Horizontal bar with logo + nav links. Mobile: hamburger dropdown.

```tsx
import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Map, TrendingUp, AlertTriangle, GitCompareArrows, Menu, X } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', icon: Map, label: 'Observatoire' },
  { to: '/trends', icon: TrendingUp, label: 'Tendances' },
  { to: '/alerts', icon: AlertTriangle, label: 'Alertes' },
  { to: '/compare', icon: GitCompareArrows, label: 'Comparer' },
] as const

export function TopNav() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  return (
    <nav className="h-12 bg-bg-card border-b border-white/5 flex items-center px-4 shrink-0 z-30 relative">
      {/* Logo */}
      <NavLink to="/" className="flex items-center gap-2 mr-6">
        <div className="w-8 h-8 rounded-lg bg-accent-cyan/20 flex items-center justify-center">
          <span className="text-accent-cyan font-bold text-sm">H</span>
        </div>
        <span className="text-sm font-semibold text-text-primary hidden sm:block">
          Hydro Dashboard
        </span>
      </NavLink>

      {/* Desktop nav links */}
      <div className="hidden md:flex items-center gap-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-accent-cyan/10 text-accent-cyan'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </div>

      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden ml-auto p-2 hover:bg-bg-hover rounded-lg"
        aria-label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden absolute top-12 left-0 right-0 bg-bg-card border-b border-white/10 shadow-xl z-40">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                  isActive
                    ? 'bg-accent-cyan/10 text-accent-cyan'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </nav>
  )
}
```

**Step 2: Build check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No new errors from TopNav.tsx

**Step 3: Commit**

```bash
git add frontend/src/components/layout/TopNav.tsx
git commit -m "feat(layout): create TopNav horizontal navigation bar"
```

---

## Task 2: Rewrite Layout to use TopNav

**Files:**
- Modify: `frontend/src/components/layout/Layout.tsx` (full rewrite)

**Step 1: Rewrite Layout.tsx**

Replace the flex-row sidebar layout with a flex-col TopNav layout. Remove Sidebar import, remove mobile hamburger/overlay (TopNav handles its own mobile). Keep Breadcrumb for non-observatory pages.

```tsx
import { Outlet } from 'react-router-dom'
import { TopNav } from './TopNav'
import { Breadcrumb } from './Breadcrumb'

export function Layout() {
  return (
    <div className="flex flex-col h-screen bg-bg-primary text-text-primary font-sans">
      {/* Skip to content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-blue-600 focus:text-white focus:p-2 focus:rounded focus:z-[100]"
      >
        Aller au contenu principal
      </a>

      <TopNav />

      <div className="flex-1 overflow-hidden flex flex-col">
        <Breadcrumb />
        <main id="main-content" className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

**Step 2: Build check**

Run: `cd frontend && npx tsc --noEmit`
Expected: May show errors about Sidebar import in other files — those will be cleaned in Task 6.

**Step 3: Commit**

```bash
git add frontend/src/components/layout/Layout.tsx
git commit -m "feat(layout): rewrite Layout with TopNav, remove sidebar"
```

---

## Task 3: Create RightDrawer component

**Files:**
- Create: `frontend/src/components/map/RightDrawer.tsx`

**Step 1: Create RightDrawer.tsx**

This merges: Piezo/Hydro data toggles + GlobalFilters + LayerPanel into one retractable right drawer with accordion sections.

```tsx
import { useState } from 'react'
import { Layers, X, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react'
import { LAYER_GROUPS } from '@/lib/layerConfig'
import { CLASSIFICATION_ORDER, CLASSIFICATION_LABELS, CLASSIFICATION_COLORS } from '@/lib/constants'
import type { Filters } from '@/hooks/useFilters'
import type { WfsLayerId } from '@/lib/types'

interface Props {
  // Données
  showPiezo: boolean
  setShowPiezo: (v: boolean) => void
  showHydro: boolean
  setShowHydro: (v: boolean) => void
  // Filtres
  filters: Filters
  setFilter: (key: string, value: string | string[] | undefined) => void
  filteredCount?: number
  totalCount?: number
  // Calques — admin
  showRegions: boolean
  setShowRegions: (v: boolean) => void
  showDepts: boolean
  setShowDepts: (v: boolean) => void
  showHER: boolean
  setShowHER: (v: boolean) => void
  showSandreDistricts: boolean
  setShowSandreDistricts: (v: boolean) => void
  // Calques — WFS
  activeWfsLayers: Set<WfsLayerId>
  onToggleWfsLayer: (layerId: WfsLayerId, group: string) => void
}

function AccordionSection({ id, title, badge, defaultOpen, children }: {
  id: string; title: string; badge?: string; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full px-4 py-3 hover:bg-bg-hover transition-colors"
        aria-expanded={open}
        aria-controls={`section-${id}`}
      >
        <span className="text-sm font-medium text-text-primary">{title}</span>
        <div className="flex items-center gap-2">
          {badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-cyan/20 text-accent-cyan font-mono">{badge}</span>}
          {open ? <ChevronDown className="w-4 h-4 text-text-secondary" /> : <ChevronRight className="w-4 h-4 text-text-secondary" />}
        </div>
      </button>
      <div
        id={`section-${id}`}
        className="grid transition-all duration-200"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-3">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export function RightDrawer(props: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const hasActiveFilter = (
    props.filters.minObservations != null ||
    props.filters.lastMeasurementAfter != null ||
    (props.filters.classification != null && props.filters.classification.length > 0) ||
    props.filters.codeDepartement != null
  )

  const resetFilters = () => {
    props.setFilter('min_obs', undefined)
    props.setFilter('last_after', undefined)
    props.setFilter('classif', undefined)
    props.setFilter('dept', undefined)
    props.setFilter('bdlisa', undefined)
    props.setFilter('bassin', undefined)
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setDrawerOpen(v => !v)}
        aria-label={drawerOpen ? 'Fermer le panneau' : 'Ouvrir le panneau'}
        className={`absolute top-4 right-4 z-20 p-2.5 rounded-lg border transition-colors ${
          drawerOpen
            ? 'bg-accent-cyan/20 border-accent-cyan/30 text-accent-cyan'
            : 'bg-bg-card/90 backdrop-blur-md border-white/10 text-text-secondary hover:text-text-primary'
        }`}
      >
        <Layers className="w-5 h-5" />
      </button>

      {/* Mobile backdrop */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-30"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={`absolute top-0 right-0 h-full z-30 w-full sm:w-80 bg-bg-card border-l border-white/10 shadow-2xl transition-transform duration-200 ease-out overflow-y-auto ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-semibold text-text-primary">Panneau de contrôle</h2>
          <button onClick={() => setDrawerOpen(false)} className="p-1 hover:bg-bg-hover rounded" aria-label="Fermer">
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        {/* Données */}
        <AccordionSection id="donnees" title="Données" defaultOpen>
          <div className="flex gap-2">
            <button
              onClick={() => props.setShowPiezo(!props.showPiezo)}
              aria-pressed={props.showPiezo}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
                props.showPiezo
                  ? 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30'
                  : 'bg-bg-primary text-text-secondary border-white/10'
              }`}
            >
              Piézométrie
            </button>
            <button
              onClick={() => props.setShowHydro(!props.showHydro)}
              aria-pressed={props.showHydro}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
                props.showHydro
                  ? 'bg-accent-indigo/20 text-accent-indigo border-accent-indigo/30'
                  : 'bg-bg-primary text-text-secondary border-white/10'
              }`}
            >
              Hydrométrie
            </button>
          </div>
        </AccordionSection>

        {/* Filtres */}
        <AccordionSection
          id="filtres"
          title="Filtres"
          badge={props.filteredCount != null && props.totalCount != null
            ? `${props.filteredCount}/${props.totalCount}`
            : undefined}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-secondary block mb-1">Département</label>
              <input
                type="text"
                value={props.filters.codeDepartement ?? ''}
                onChange={(e) => props.setFilter('dept', e.target.value || undefined)}
                placeholder="ex: 75"
                className="w-full px-2.5 py-1.5 bg-bg-primary border border-white/10 rounded text-sm text-text-primary focus:outline-none focus:border-accent-cyan/50"
              />
            </div>

            <div>
              <label className="text-xs text-text-secondary block mb-2">Classification</label>
              <div className="flex flex-wrap gap-1.5">
                {CLASSIFICATION_ORDER.map((cls) => {
                  const active = props.filters.classification?.includes(cls) ?? false
                  const color = CLASSIFICATION_COLORS[cls]
                  return (
                    <button
                      key={cls}
                      onClick={() => {
                        const current = props.filters.classification ?? []
                        const next = active
                          ? current.filter(c => c !== cls)
                          : [...current, cls]
                        props.setFilter('classif', next.length > 0 ? next : undefined)
                      }}
                      aria-pressed={active}
                      className="px-2 py-1 rounded text-xs font-medium transition-colors border"
                      style={{
                        backgroundColor: active ? `${color}30` : 'transparent',
                        borderColor: active ? color : 'rgba(255,255,255,0.1)',
                        color: active ? color : '#9ca3af',
                      }}
                    >
                      {CLASSIFICATION_LABELS[cls]}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="text-xs text-text-secondary block mb-1">Observations min (jours)</label>
              <input
                type="number"
                value={props.filters.minObservations ?? ''}
                onChange={(e) => props.setFilter('min_obs', e.target.value || undefined)}
                placeholder="500"
                className="w-full px-2.5 py-1.5 bg-bg-primary border border-white/10 rounded text-sm text-text-primary focus:outline-none focus:border-accent-cyan/50"
              />
            </div>

            <div>
              <label className="text-xs text-text-secondary block mb-1">Dernière mesure après</label>
              <input
                type="date"
                value={props.filters.lastMeasurementAfter ?? ''}
                onChange={(e) => props.setFilter('last_after', e.target.value || undefined)}
                className="w-full px-2.5 py-1.5 bg-bg-primary border border-white/10 rounded text-sm text-text-primary focus:outline-none focus:border-accent-cyan/50"
              />
            </div>

            {hasActiveFilter && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1.5 w-full justify-center px-3 py-2 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Réinitialiser
              </button>
            )}
          </div>
        </AccordionSection>

        {/* Calques */}
        <AccordionSection id="calques" title="Calques">
          {/* Admin layers */}
          <div className="mb-3">
            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider block mb-1">Administratif</span>
            {([
              { label: 'Régions', state: props.showRegions, setState: props.setShowRegions },
              { label: 'Départements', state: props.showDepts, setState: props.setShowDepts },
              { label: 'Bassins (SANDRE)', state: props.showSandreDistricts, setState: props.setShowSandreDistricts },
            ] as const).map(({ label, state, setState }) => (
              <label key={label} className="flex items-center gap-2 py-1 cursor-pointer group">
                <input type="checkbox" checked={state} onChange={e => setState(e.target.checked)} className="w-3.5 h-3.5 accent-accent-cyan rounded" />
                <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">{label}</span>
              </label>
            ))}
          </div>

          {/* WFS dynamic layer groups */}
          {LAYER_GROUPS.map(group => (
            <div key={group.id} className="mb-3">
              <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider block mb-1">
                {group.icon} {group.label}
              </span>
              {group.layers.map(layer => (
                <label key={layer.id} className="flex items-center gap-2 py-1 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={props.activeWfsLayers.has(layer.id)}
                    onChange={() => props.onToggleWfsLayer(layer.id, group.id)}
                    className={`w-3.5 h-3.5 accent-accent-cyan ${group.mode === 'radio' ? 'rounded-full' : ''}`}
                  />
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: layer.color }} />
                  <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">{layer.label}</span>
                </label>
              ))}
            </div>
          ))}

          {/* HER-2 standalone */}
          <label className="flex items-center gap-2 py-1 cursor-pointer group">
            <input type="checkbox" checked={props.showHER} onChange={e => props.setShowHER(e.target.checked)} className="w-3.5 h-3.5 accent-accent-cyan rounded" />
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-emerald-400" />
            <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">Hydroécorégions (HER-2)</span>
          </label>
        </AccordionSection>
      </div>
    </>
  )
}
```

**Step 2: Build check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add frontend/src/components/map/RightDrawer.tsx
git commit -m "feat(map): create RightDrawer with Données, Filtres, Calques sections"
```

---

## Task 4: Create StationDrawer component

**Files:**
- Create: `frontend/src/components/map/StationDrawer.tsx`

**Step 1: Create StationDrawer.tsx**

Left drawer that replaces `StationPopup.tsx`. Slides in from left when a station is clicked. Shows station summary + "Voir détails" link.

```tsx
import { Link } from 'react-router-dom'
import { X, ExternalLink, Calendar, Database, Mountain } from 'lucide-react'
import { ClassificationBadge } from '../station/ClassificationBadge'
import { formatNumber } from '../../lib/utils'
import { usePiezoStationDetail, useHydroStationDetail, useBdlisaLookup } from '../../hooks/useStations'

interface Props {
  code: string
  type: 'piezo' | 'hydro'
  onClose: () => void
}

function formatPeriod(start?: string | null, end?: string | null): string {
  if (!start && !end) return '—'
  const fmt = (d: string) => new Date(d).getFullYear().toString()
  if (start && end) return `${fmt(start)} – ${fmt(end)}`
  if (end) return `jusqu'en ${fmt(end)}`
  return `depuis ${fmt(start!)}`
}

function formatCount(n?: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString('fr-FR')
}

function DrawerSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div className="p-4">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 space-y-2">
          <div className="h-3 w-16 bg-white/10 rounded animate-pulse" />
          <div className="h-5 w-40 bg-white/10 rounded animate-pulse" />
          <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
        </div>
        <button onClick={onClose} aria-label="Fermer" className="p-1 hover:bg-bg-hover rounded">
          <X className="w-4 h-4 text-text-secondary" />
        </button>
      </div>
      <div className="space-y-2">
        <div className="h-6 w-20 bg-white/10 rounded animate-pulse" />
        <div className="h-3 w-full bg-white/10 rounded animate-pulse" />
        <div className="h-3 w-3/4 bg-white/10 rounded animate-pulse" />
      </div>
    </div>
  )
}

export function StationDrawer({ code, type, onClose }: Props) {
  const isPiezo = type === 'piezo'
  const piezoQuery = usePiezoStationDetail(isPiezo ? code : '')
  const hydroQuery = useHydroStationDetail(!isPiezo ? code : '')
  const { data: station, isLoading } = isPiezo ? piezoQuery : hydroQuery
  const bdlisaLookup = useBdlisaLookup()

  const content = (() => {
    if (isLoading || !station) return <DrawerSkeleton onClose={onClose} />

    const bdlisa = isPiezo ? bdlisaLookup((station as any).codes_bdlisa) : null
    const name = isPiezo
      ? ((station as any).nom_commune || (station as any).code_bss)
      : ((station as any).libelle_station || (station as any).code_station)
    const stationCode = isPiezo ? (station as any).code_bss : (station as any).code_station
    const classification = isPiezo
      ? (station as any).classification_derniere_annee
      : (station as any).classification_resultat_dern_annee
    const value = isPiezo
      ? (station as any).niveau_derniere_annee
      : (station as any).resultat_moyen_global
    const unit = isPiezo ? 'm NGF' : 'm³/s'
    const dept = (station as any).nom_departement ?? (station as any).code_departement ?? ''

    return (
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide ${
              isPiezo ? 'bg-accent-cyan/20 text-accent-cyan' : 'bg-accent-indigo/20 text-accent-indigo'
            }`}>
              {isPiezo ? 'Piézométrie' : 'Hydrométrie'}
            </span>
            <h3 className="text-base font-semibold text-text-primary mt-2 break-words">{name}</h3>
            <p className="text-xs text-text-secondary mt-0.5">{dept} &middot; {stationCode}</p>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="p-1 hover:bg-bg-hover rounded ml-2">
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        {/* Classification + value */}
        <div className="flex items-center gap-3 mb-4">
          <ClassificationBadge classification={classification} />
          {value != null && (
            <span className="text-sm text-text-primary font-mono">
              {formatNumber(value)} {unit}
            </span>
          )}
        </div>

        {/* Trend */}
        {(station as any).tendance_classification && (
          <p className="text-xs text-text-secondary mb-4">
            Tendance : <span className="text-text-primary font-medium">{(station as any).tendance_classification}</span>
          </p>
        )}

        {/* Metadata grid */}
        <div className="pt-3 border-t border-white/10 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-text-secondary mb-4">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{formatPeriod((station as any).premiere_mesure, (station as any).derniere_mesure)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{isPiezo
              ? `${formatCount((station as any).nb_mesures_total)} mesures`
              : `${formatCount((station as any).nb_jours_total ?? (station as any).nb_mois_total)} j.`
            }</span>
          </div>
          {isPiezo && (station as any).altitude_station != null && (
            <div className="flex items-center gap-1.5 col-span-2">
              <Mountain className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Alt. {((station as any).altitude_station as number).toFixed(0)} m NGF</span>
            </div>
          )}
          {(station as any).percentile_derniere_annee != null && (
            <div className="flex items-center gap-1.5 col-span-2">
              <span className="text-text-secondary">Percentile :</span>
              <span className="text-text-primary font-medium">{Math.round((station as any).percentile_derniere_annee)}e</span>
            </div>
          )}
          {(station as any).percentile_resultat_dern_annee != null && (
            <div className="flex items-center gap-1.5 col-span-2">
              <span className="text-text-secondary">Percentile :</span>
              <span className="text-text-primary font-medium">{Math.round((station as any).percentile_resultat_dern_annee)}e</span>
            </div>
          )}
        </div>

        {/* BDLISA */}
        {bdlisa?.nature && (
          <div className="pt-3 border-t border-white/10 flex items-center gap-2 text-xs text-text-secondary mb-4">
            <span>Nappe :</span>
            <span className="text-text-primary">{bdlisa.nature}</span>
          </div>
        )}

        {/* Link to detail page */}
        <Link
          to={`/station/${type}/${stationCode}`}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/20 transition-colors"
        >
          Voir les détails <ExternalLink className="w-4 h-4" />
        </Link>
      </div>
    )
  })()

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-30"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-label={`Station ${code}`}
        className="absolute top-0 left-0 h-full z-30 w-full sm:w-80 bg-bg-card border-r border-white/10 shadow-2xl transition-transform duration-200 ease-out overflow-y-auto translate-x-0"
      >
        {content}
      </div>
    </>
  )
}
```

**Step 2: Build check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add frontend/src/components/map/StationDrawer.tsx
git commit -m "feat(map): create StationDrawer left panel for station info"
```

---

## Task 5: Rewrite ObservatoryPage to wire drawers

**Files:**
- Modify: `frontend/src/pages/ObservatoryPage.tsx` (significant rewrite)

**Step 1: Rewrite ObservatoryPage.tsx**

Remove: `GlobalFilters`, `LayerPanel`, `StationPopup` imports and usage, Piezo/Hydro toggle buttons.
Add: `RightDrawer`, `StationDrawer` imports and usage.
Keep: `SearchBar`, `KPIBar`, `ObservatoryMap`, all state and hooks.

The key changes:
- Replace `<GlobalFilters>` + `<LayerPanel>` + piezo/hydro toggle buttons with `<RightDrawer>`
- Replace `<StationPopup>` with `<StationDrawer>`
- Pass all existing state through to RightDrawer
- SearchBar position: `top-4 left-4` (remove the `md:left-[22rem]` offset since sidebar is gone)

```tsx
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
      if (filters.codeDepartement && f.properties.code_departement !== filters.codeDepartement) return false
      if (filters.classification?.length && !filters.classification.includes(f.properties.classification ?? '')) return false
      if (filters.codeBdlisa && f.properties.type === 'piezo') {
        const codes = f.properties.codes_bdlisa ?? ''
        if (!codes.startsWith(filters.codeBdlisa)) return false
      }
      if (filters.stationCodes?.length) {
        if (!filters.stationCodes.includes(f.properties.code)) return false
      }
      return true
    })
  }, [geojsonData, filters.codeDepartement, filters.classification, filters.codeBdlisa, filters.stationCodes])

  const [selectedStation, setSelectedStation] = useState<{ code: string; type: 'piezo' | 'hydro' } | null>(null)
  const [showPiezo, setShowPiezo] = useState(true)
  const [showHydro, setShowHydro] = useState(true)

  // Existing static layers
  const [showRegions, setShowRegions] = useState(false)
  const [showDepts, setShowDepts] = useState(false)
  const [showHER, setShowHER] = useState(false)
  const [showSandre, setShowSandre] = useState(false)

  // WFS dynamic layers
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

  // Fetch WFS data only for active layers
  const regionHydro = useWfsLayer('region-hydro', activeWfsLayers.has('region-hydro'))
  const secteurHydro = useWfsLayer('secteur-hydro', activeWfsLayers.has('secteur-hydro'))
  const sousSecteurHydro = useWfsLayer('sous-secteur-hydro', activeWfsLayers.has('sous-secteur-hydro'))
  const zoneHydro = useWfsLayer('zone-hydro', activeWfsLayers.has('zone-hydro'))
  const coursEau1 = useWfsLayer('cours-eau-1', activeWfsLayers.has('cours-eau-1'))
  const coursEau2 = useWfsLayer('cours-eau-2', activeWfsLayers.has('cours-eau-2'))
  const planEau = useWfsLayer('plan-eau', activeWfsLayers.has('plan-eau'))
  const masseEauSout = useWfsLayer('masse-eau-sout', activeWfsLayers.has('masse-eau-sout'))
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
    if (masseEauSout.data) d['masse-eau-sout'] = masseEauSout.data
    if (masseEauRiv.data) d['masse-eau-riv'] = masseEauRiv.data
    return d
  }, [regionHydro.data, secteurHydro.data, sousSecteurHydro.data, zoneHydro.data,
      coursEau1.data, coursEau2.data, planEau.data, masseEauSout.data, masseEauRiv.data])

  const handleStationClick = useCallback((code: string, type: 'piezo' | 'hydro') => {
    setSelectedStation({ code, type })
  }, [])

  const handleDeptClick = useCallback((code: string | null) => {
    setFilter('dept', code ?? undefined)
    if (!code) setFilter('stations', undefined)
  }, [setFilter])

  const handleBassinClick = useCallback((code: string | null) => {
    setFilter('bassin', code ?? undefined)
    if (!code) setFilter('stations', undefined)
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
```

**Step 2: Build check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/pages/ObservatoryPage.tsx
git commit -m "feat(observatory): wire RightDrawer and StationDrawer, remove old floating panels"
```

---

## Task 6: Update SearchBar positioning

**Files:**
- Modify: `frontend/src/components/map/SearchBar.tsx` (line 65)

**Step 1: Update SearchBar position**

The old `left-12` offset accounted for the mobile hamburger button of the sidebar. Since we removed the sidebar, SearchBar should be `left-4` on all breakpoints.

Change line 65 from:
```tsx
<div ref={wrapperRef} className="absolute top-4 left-12 md:left-4 z-10 w-56 md:w-80">
```
To:
```tsx
<div ref={wrapperRef} className="absolute top-4 left-4 z-10 w-64 sm:w-80">
```

**Step 2: Commit**

```bash
git add frontend/src/components/map/SearchBar.tsx
git commit -m "fix(map): update SearchBar positioning for sidebar-less layout"
```

---

## Task 7: Delete old components

**Files:**
- Delete: `frontend/src/components/filters/GlobalFilters.tsx`
- Delete: `frontend/src/components/map/LayerPanel.tsx`
- Delete: `frontend/src/components/map/StationPopup.tsx`

**Step 1: Remove old GlobalFilters, LayerPanel, StationPopup**

These are now fully replaced by RightDrawer and StationDrawer. Verify no other file imports them:

```bash
grep -r "GlobalFilters\|LayerPanel\|StationPopup" frontend/src/ --include="*.tsx" --include="*.ts"
```

Expected: Only the deleted files themselves (and possibly the old ObservatoryPage which was already updated in Task 5).

**Step 2: Delete the files**

```bash
rm frontend/src/components/filters/GlobalFilters.tsx
rm frontend/src/components/map/LayerPanel.tsx
rm frontend/src/components/map/StationPopup.tsx
```

**Step 3: Check if the `filters/` directory is now empty**

If `GlobalFilters.tsx` was the only file in `components/filters/`, remove the directory.

```bash
ls frontend/src/components/filters/
```

If empty, `rm -r frontend/src/components/filters/`

**Step 4: Build check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS (no remaining imports of deleted files)

**Step 5: Commit**

```bash
git add -u
git commit -m "refactor: delete GlobalFilters, LayerPanel, StationPopup (replaced by drawers)"
```

---

## Task 8: Delete old Sidebar (optional — keep for reference, or delete)

**Files:**
- Delete: `frontend/src/components/layout/Sidebar.tsx`

**Step 1: Verify no imports remain**

```bash
grep -r "Sidebar" frontend/src/ --include="*.tsx" --include="*.ts"
```

Expected: No remaining imports (Layout.tsx was already rewritten in Task 2).

**Step 2: Delete**

```bash
rm frontend/src/components/layout/Sidebar.tsx
```

**Step 3: Build check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add -u
git commit -m "refactor: delete Sidebar.tsx (replaced by TopNav)"
```

---

## Task 9: Update CLAUDE.md documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update layout documentation**

In the `### Frontend` section, update:
- Change `Layout` description from "Sidebar + Outlet" to "TopNav + Outlet (no sidebar)"
- Remove mention of `components/layout/Sidebar.tsx`
- Add mention of `TopNav.tsx`, `RightDrawer.tsx`, `StationDrawer.tsx`
- In "Adding a new page" section, change step 3 from "Add nav link in Sidebar.tsx" to "Add nav link in TopNav.tsx"

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for new layout architecture"
```

---

## Task 10: Add `derniere_mesure` to GeoJSON endpoint + "Stations actives" filter

The user wants to filter stations that still have data for the current year (real-time monitoring use case).

**Files:**
- Modify: `backend/app/routers/stations.py` (GeoJSON endpoint SQL queries)
- Modify: `frontend/src/lib/types.ts` (add `derniere_mesure` to `StationGeoJSONProperties`)
- Modify: `frontend/src/components/map/RightDrawer.tsx` (add toggle)
- Modify: `frontend/src/pages/ObservatoryPage.tsx` (add filter logic)

**Step 1: Add `derniere_mesure` to backend GeoJSON SQL queries**

In `backend/app/routers/stations.py`, add `derniere_mesure` to both piezo and hydro SELECT and properties:

Piezo query (around line 216):
```sql
SELECT code_bss AS code, 'piezo' AS type,
       latitude, longitude, nom_commune AS commune,
       code_departement, nom_departement AS departement,
       classification_derniere_annee AS classification,
       codes_bdlisa,
       derniere_mesure
FROM gold.dim_piezo_stations
WHERE latitude IS NOT NULL AND longitude IS NOT NULL
```

Piezo properties (around line 233): add `"derniere_mesure": r["derniere_mesure"]`

Hydro query (around line 245):
```sql
SELECT code_station AS code, 'hydro' AS type,
       latitude_station AS latitude, longitude_station AS longitude,
       libelle_station AS commune,
       code_departement, nom_departement AS departement,
       classification_resultat_dern_annee AS classification,
       LEFT(code_cours_eau, 1) AS code_district,
       derniere_mesure
FROM gold.dim_hydro_stations
WHERE latitude_station IS NOT NULL AND longitude_station IS NOT NULL
```

Hydro properties (around line 264): add `"derniere_mesure": r["derniere_mesure"]`

**Step 2: Add to frontend types**

In `frontend/src/lib/types.ts`, add to `StationGeoJSONProperties`:
```ts
derniere_mesure: string | null
```

**Step 3: Add "Stations actives" toggle in RightDrawer Filtres section**

Add a toggle at the top of the Filtres accordion, before the Département field:

```tsx
<label className="flex items-center gap-2 cursor-pointer group">
  <input
    type="checkbox"
    checked={props.filters.activeOnly ?? false}
    onChange={(e) => props.setFilter('active_only', e.target.checked ? 'true' : undefined)}
    className="w-3.5 h-3.5 accent-accent-cyan rounded"
  />
  <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">
    Données année en cours uniquement
  </span>
</label>
```

**Step 4: Add `activeOnly` to Filters interface**

In `frontend/src/hooks/useFilters.ts`, add to `Filters`:
```ts
activeOnly?: boolean
```
And parse from URL:
```ts
activeOnly: searchParams.get('active_only') === 'true' ? true : undefined,
```

**Step 5: Add filter logic in ObservatoryPage**

In the `filteredFeatures` useMemo, add:
```ts
if (filters.activeOnly) {
  const currentYear = new Date().getFullYear().toString()
  if (!f.properties.derniere_mesure || !f.properties.derniere_mesure.startsWith(currentYear)) return false
}
```

**Step 6: Commit**

```bash
git add backend/app/routers/stations.py frontend/src/lib/types.ts frontend/src/hooks/useFilters.ts frontend/src/components/map/RightDrawer.tsx frontend/src/pages/ObservatoryPage.tsx
git commit -m "feat: add 'stations actives' filter for current-year data"
```

---

## Task 11: Switch map style to terrain with relief

Replace the dark CARTO basemap with a lighter terrain map showing relief, mountains, and topography.

**Files:**
- Modify: `frontend/src/components/map/ObservatoryMap.tsx` (map init + hillshading)
- Modify: `frontend/src/index.css` (adjust UI colors if needed for light map)

**Step 1: Change map style**

In `ObservatoryMap.tsx` around line 295, replace:
```ts
style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
```
With a lighter style + terrain. Use **CARTO Voyager** (light, clean, labels) as the base, then add a hillshade layer for terrain relief:

```ts
style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
```

**Step 2: Add hillshade terrain layer**

After map `load` event, add terrain hillshading using free AWS terrain tiles:

```ts
// Add terrain hillshading
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
}, 'building')  // Insert below labels
```

**Step 3: Remove/adjust the dark overlay**

The current code (around line 310-313) adjusts base layer opacity for dark theme. Since we're switching to a light map, this opacity hack should be removed or adjusted:

```ts
// Remove or adjust the style.layers.forEach block that modifies background/fill opacity
```

Station dots, overlays, and drawer text should still be readable. The dark UI theme (bg-bg-card etc.) will contrast well against a light map since map panels use `backdrop-blur-md` and solid dark backgrounds.

**Step 4: Build check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/components/map/ObservatoryMap.tsx
git commit -m "feat(map): switch to Voyager light basemap with terrain hillshading"
```

---

## Task 12: Docker build and push

**Step 1: Rebuild and verify**

```bash
docker compose build frontend backend
docker compose up -d
```

Wait for containers to be healthy, then verify the app loads at `http://localhost:49510`.

**Step 2: Push all commits**

```bash
git push origin master
```
