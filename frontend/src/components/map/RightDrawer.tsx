import { useState } from 'react'
import { Layers, X, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react'
import { LAYER_GROUPS } from '@/lib/layerConfig'
import { CLASSIFICATION_ORDER, CLASSIFICATION_LABELS, CLASSIFICATION_COLORS } from '@/lib/constants'
import type { Filters } from '@/hooks/useFilters'
import type { WfsLayerId } from '@/lib/types'

interface Props {
  showPiezo: boolean
  setShowPiezo: (v: boolean) => void
  showHydro: boolean
  setShowHydro: (v: boolean) => void
  filters: Filters
  setFilter: (key: string, value: string | string[] | undefined) => void
  filteredCount?: number
  totalCount?: number
  showRegions: boolean
  setShowRegions: (v: boolean) => void
  showDepts: boolean
  setShowDepts: (v: boolean) => void
  showHER: boolean
  setShowHER: (v: boolean) => void
  showSandreDistricts: boolean
  setShowSandreDistricts: (v: boolean) => void
  activeWfsLayers: Set<WfsLayerId>
  onToggleWfsLayer: (layerId: WfsLayerId, group: string) => void
  onResetSpatial?: () => void
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
    props.filters.activeOnly != null ||
    props.filters.minObservations != null ||
    props.filters.lastMeasurementAfter != null ||
    (props.filters.classification != null && props.filters.classification.length > 0) ||
    props.filters.codeDepartement != null
  )

  const resetFilters = () => {
    props.setFilter('active_only', undefined)
    props.setFilter('min_obs', undefined)
    props.setFilter('last_after', undefined)
    props.setFilter('classif', undefined)
    props.setFilter('dept', undefined)
    props.setFilter('bdlisa', undefined)
    props.setFilter('bassin', undefined)
    props.onResetSpatial?.()
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
          drawerOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
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
                    type={group.mode === 'radio' ? 'radio' : 'checkbox'}
                    name={group.mode === 'radio' ? `layer-group-${group.id}` : undefined}
                    checked={props.activeWfsLayers.has(layer.id)}
                    onChange={() => props.onToggleWfsLayer(layer.id, group.id)}
                    className="w-3.5 h-3.5 accent-accent-cyan"
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
