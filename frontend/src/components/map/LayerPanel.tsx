import { useState } from 'react'
import { LAYER_GROUPS } from '@/lib/layerConfig'
import type { WfsLayerId } from '@/lib/types'

interface Props {
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
}

export function LayerPanel({
  showRegions, setShowRegions,
  showDepts, setShowDepts,
  showHER, setShowHER,
  showSandreDistricts, setShowSandreDistricts,
  activeWfsLayers, onToggleWfsLayer,
}: Props) {
  const [showPanel, setShowPanel] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  return (
    <div className="absolute top-[8.5rem] right-3 z-10">
      <button
        onClick={() => setShowPanel(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${showPanel ? 'bg-bg-card border-white/20 text-text-primary' : 'bg-bg-card/80 border-white/10 text-text-secondary hover:text-text-primary'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        Calques
      </button>

      {showPanel && (
        <div className="mt-1 bg-bg-card/95 backdrop-blur-sm border border-white/10 rounded-lg p-3 min-w-[14rem] max-h-[70vh] overflow-y-auto">

          {/* Existing admin layers */}
          <div className="mb-3">
            <button
              onClick={() => toggleGroup('admin')}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">Administratif</span>
              <span className="text-white/30 text-xs">{expandedGroups.has('admin') ? '\u25BC' : '\u25B6'}</span>
            </button>
            {expandedGroups.has('admin') && (
              <div className="mt-1 ml-1">
                {([
                  { label: 'Régions', state: showRegions, setState: setShowRegions },
                  { label: 'Départements', state: showDepts, setState: setShowDepts },
                  { label: 'Bassins (SANDRE)', state: showSandreDistricts, setState: setShowSandreDistricts },
                ] as const).map(({ label, state, setState }) => (
                  <label key={label} className="flex items-center gap-2 py-0.5 cursor-pointer group">
                    <input type="checkbox" checked={state} onChange={e => setState(e.target.checked)} className="w-3 h-3 accent-accent-cyan rounded" />
                    <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">{label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* WFS dynamic layer groups */}
          {LAYER_GROUPS.map(group => (
            <div key={group.id} className="mb-3">
              <button
                onClick={() => toggleGroup(group.id)}
                className="flex items-center justify-between w-full text-left"
              >
                <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                  {group.icon} {group.label}
                </span>
                <span className="text-white/30 text-xs">{expandedGroups.has(group.id) ? '\u25BC' : '\u25B6'}</span>
              </button>
              {expandedGroups.has(group.id) && (
                <div className="mt-1 ml-1">
                  {group.layers.map(layer => (
                    <label key={layer.id} className="flex items-center gap-2 py-0.5 cursor-pointer group">
                      <input
                        type={group.mode === 'radio' ? 'radio' : 'checkbox'}
                        name={group.mode === 'radio' ? `wfs-group-${group.id}` : undefined}
                        checked={activeWfsLayers.has(layer.id)}
                        onChange={() => onToggleWfsLayer(layer.id, group.id)}
                        className="w-3 h-3 accent-accent-cyan"
                      />
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: layer.color }}
                      />
                      <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">{layer.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* HER-2 standalone */}
          <div className="mb-1">
            <label className="flex items-center gap-2 py-0.5 cursor-pointer group ml-1">
              <input type="checkbox" checked={showHER} onChange={e => setShowHER(e.target.checked)} className="w-3 h-3 accent-accent-cyan rounded" />
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-400" />
              <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">Hydroécorégions (HER-2)</span>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
