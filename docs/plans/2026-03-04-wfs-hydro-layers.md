# WFS Hydrological Layers — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 9 new WFS-backed map layers (SANDRE zonages, Carthage network, DCE masses d'eau) with accordion layer panel, progressive zoom loading, hover popups with attributes, and spatial station filtering on click.

**Architecture:** New backend router proxies SANDRE WFS services, converts GML→GeoJSON, caches in Redis (24h TTL). Frontend loads layers on-demand based on zoom level via TanStack Query hooks. New accordion "Calques" panel replaces the current flat checkbox list. All polygon/line layers support hover (tooltip with attributes) and click (zoom + point-in-polygon station filtering).

**Tech Stack:** FastAPI + httpx (async WFS client) + Redis cache | React + MapLibre GL + TanStack Query

---

## Layer Inventory

| ID | Group | WFS TypeName | WFS Base URL | Min Zoom | Geometry |
|---|---|---|---|---|---|
| `region-hydro` | SANDRE | `sa:RegionHydro` | `geo/zonage` | 0 | Polygon |
| `secteur-hydro` | SANDRE | `sa:SecteurHydro` | `geo/zonage` | 6 | Polygon |
| `sous-secteur-hydro` | SANDRE | `sa:SousSecteurHydro` | `geo/zonage` | 7 | Polygon |
| `zone-hydro` | SANDRE | `sa:ZoneHydro` | `geo/zonage` | 9 | Polygon |
| `cours-eau-1` | Carthage | `sa:CoursEau1` | `geo/zonage` | 6 | LineString |
| `cours-eau-2` | Carthage | `sa:CoursEau2` | `geo/zonage` | 8 | LineString |
| `plan-eau` | Carthage | `sa:PlanEau_FXX` | `geo/zonage` | 8 | Polygon |
| `masse-eau-sout` | Hydro-éco | `sa:MasseDEauSouterraine_VRAP2022_FXX` | `geo/MasseDEau_VRAP2022` | 7 | Polygon |
| `masse-eau-riv` | Hydro-éco | `sa:MasseDEauRiviere_VRAP2022_FXX` | `geo/MasseDEau_VRAP2022` | 8 | LineString |

---

### Task 1: Backend WFS Proxy Router

**Files:**
- Create: `backend/app/routers/wfs.py`
- Modify: `backend/app/main.py` (register router)

**Step 1: Create `backend/app/routers/wfs.py`**

```python
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from starlette.responses import Response

from app.cache import cached_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/wfs", tags=["wfs"])

WFS_TTL = 86400  # 24h — reference data, rarely changes

# Registry of known WFS layers
WFS_LAYERS = {
    # SANDRE zonages hydrographiques
    "region-hydro": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "sa:RegionHydro",
    },
    "secteur-hydro": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "sa:SecteurHydro",
    },
    "sous-secteur-hydro": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "sa:SousSecteurHydro",
    },
    "zone-hydro": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "sa:ZoneHydro",
    },
    # BD Carthage (réseau hydrographique)
    "cours-eau-1": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "sa:CoursEau1",
    },
    "cours-eau-2": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "sa:CoursEau2",
    },
    "plan-eau": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/zonage",
        "typename": "sa:PlanEau_FXX",
    },
    # Masses d'eau DCE (rapportage 2022)
    "masse-eau-sout": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/MasseDEau_VRAP2022",
        "typename": "sa:MasseDEauSouterraine_VRAP2022_FXX",
    },
    "masse-eau-riv": {
        "base_url": "https://services.sandre.eaufrance.fr/geo/MasseDEau_VRAP2022",
        "typename": "sa:MasseDEauRiviere_VRAP2022_FXX",
    },
}


@router.get("/{layer_id}")
async def get_wfs_layer(
    layer_id: str,
    bbox: Optional[str] = Query(None, description="Bounding box: min_lon,min_lat,max_lon,max_lat"),
):
    if layer_id not in WFS_LAYERS:
        raise HTTPException(status_code=404, detail=f"Unknown layer: {layer_id}")

    layer = WFS_LAYERS[layer_id]
    cache_params = {"layer_id": layer_id, "bbox": bbox}

    async def fetch():
        params = {
            "SERVICE": "WFS",
            "VERSION": "2.0.0",
            "REQUEST": "GetFeature",
            "TYPENAME": layer["typename"],
            "OUTPUTFORMAT": "application/json",
            "SRSNAME": "EPSG:4326",
        }
        if bbox:
            params["BBOX"] = bbox

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(layer["base_url"], params=params)
            if resp.status_code != 200:
                logger.error("WFS error for %s: %s %s", layer_id, resp.status_code, resp.text[:200])
                raise HTTPException(status_code=502, detail=f"WFS service error for {layer_id}")
            return resp.json()

    return await cached_response(f"wfs_{layer_id}", cache_params, WFS_TTL, fetch)
```

**Step 2: Register router in `backend/app/main.py`**

Add import and include_router alongside existing routers:

```python
from app.routers import stations, timeseries, trends, stats, era5, alerts, wfs
# ...
app.include_router(wfs.router)
```

**Step 3: Add httpx dependency to `backend/pyproject.toml`**

Add `"httpx>=0.27.0"` to the `dependencies` list (it's already in dev deps, move to main).

**Step 4: Test manually**

```bash
cd backend
uvicorn app.main:app --reload --port 8000
# Test:
curl "http://localhost:8000/api/v1/wfs/region-hydro" | python -m json.tool | head -20
curl "http://localhost:8000/api/v1/wfs/cours-eau-1" | python -m json.tool | head -20
```

Expected: GeoJSON FeatureCollection with features array.

**Step 5: Commit**

```bash
git add backend/app/routers/wfs.py backend/app/main.py backend/pyproject.toml
git commit -m "feat(api): add WFS proxy router for SANDRE/Carthage/DCE layers"
```

---

### Task 2: Frontend API + Types + Hook for WFS Layers

**Files:**
- Modify: `frontend/src/lib/types.ts` (add WFS layer types)
- Modify: `frontend/src/lib/api.ts` (add wfs.layer function)
- Create: `frontend/src/hooks/useWfsLayer.ts`

**Step 1: Add types to `frontend/src/lib/types.ts`**

Append at end of file:

```typescript
// WFS Layer types
export type WfsLayerId =
  | 'region-hydro' | 'secteur-hydro' | 'sous-secteur-hydro' | 'zone-hydro'
  | 'cours-eau-1' | 'cours-eau-2' | 'plan-eau'
  | 'masse-eau-sout' | 'masse-eau-riv'

export interface WfsLayerConfig {
  id: WfsLayerId
  label: string
  group: 'sandre' | 'carthage' | 'hydroeco' | 'admin'
  minZoom: number
  geometryType: 'polygon' | 'line'
  color: string
  tooltipFields: string[]  // property names to show on hover
}
```

**Step 2: Add API function to `frontend/src/lib/api.ts`**

Add to the `api` export object:

```typescript
wfs: {
  layer: (layerId: string, bbox?: string) =>
    fetchJson<GeoJSON.FeatureCollection>(`/wfs/${layerId}`, bbox ? { bbox } : undefined),
},
```

Also add at top of file (no import needed, GeoJSON types are built-in for MapLibre users; use `any` for FeatureCollection):

Replace the type with just the raw response shape — we don't need full GeoJSON typing since MapLibre handles it:

```typescript
wfs: {
  layer: (layerId: string, bbox?: string) =>
    fetchJson<any>(`/wfs/${layerId}`, bbox ? { bbox } : undefined),
},
```

**Step 3: Create `frontend/src/hooks/useWfsLayer.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { WfsLayerId } from '@/lib/types'

export function useWfsLayer(layerId: WfsLayerId, enabled: boolean) {
  return useQuery({
    queryKey: ['wfs', layerId],
    queryFn: () => api.wfs.layer(layerId),
    enabled,
    staleTime: 24 * 60 * 60 * 1000, // 24h — matches backend cache
    gcTime: 60 * 60 * 1000, // keep in memory 1h after unmount
  })
}
```

**Step 4: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useWfsLayer.ts
git commit -m "feat(frontend): add WFS layer API, types, and query hook"
```

---

### Task 3: Layer Configuration Registry

**Files:**
- Create: `frontend/src/lib/layerConfig.ts`

**Step 1: Create the layer config registry**

This file defines all layer metadata: colors, zoom thresholds, tooltip fields, group membership. Single source of truth for both the map and the panel.

```typescript
import type { WfsLayerConfig, WfsLayerId } from './types'

// SANDRE zonage colors (blue-teal gradient by hierarchy depth)
const SANDRE_ZONAGE_COLORS: Record<string, string> = {
  'region-hydro': '#3b82f6',      // blue-500
  'secteur-hydro': '#06b6d4',     // cyan-500
  'sous-secteur-hydro': '#14b8a6', // teal-500
  'zone-hydro': '#10b981',         // emerald-500
}

export const WFS_LAYERS: WfsLayerConfig[] = [
  // --- SANDRE Zonages (radio: only one active at a time) ---
  {
    id: 'region-hydro',
    label: 'Régions hydrographiques',
    group: 'sandre',
    minZoom: 0,
    geometryType: 'polygon',
    color: SANDRE_ZONAGE_COLORS['region-hydro'],
    tooltipFields: ['CdRegionHydro', 'LbRegionHydro'],
  },
  {
    id: 'secteur-hydro',
    label: 'Secteurs hydrographiques',
    group: 'sandre',
    minZoom: 6,
    geometryType: 'polygon',
    color: SANDRE_ZONAGE_COLORS['secteur-hydro'],
    tooltipFields: ['CdSecteurHydro', 'LbSecteurHydro'],
  },
  {
    id: 'sous-secteur-hydro',
    label: 'Sous-secteurs hydrographiques',
    group: 'sandre',
    minZoom: 7,
    geometryType: 'polygon',
    color: SANDRE_ZONAGE_COLORS['sous-secteur-hydro'],
    tooltipFields: ['CdSousSecteurHydro', 'LbSousSecteurHydro'],
  },
  {
    id: 'zone-hydro',
    label: 'Zones hydrographiques',
    group: 'sandre',
    minZoom: 9,
    geometryType: 'polygon',
    color: SANDRE_ZONAGE_COLORS['zone-hydro'],
    tooltipFields: ['CdZoneHydro', 'LbZoneHydro', 'Superficie'],
  },
  // --- Carthage (checkboxes, independent) ---
  {
    id: 'cours-eau-1',
    label: 'Cours d\'eau principaux (>100km)',
    group: 'carthage',
    minZoom: 6,
    geometryType: 'line',
    color: '#60a5fa',  // blue-400
    tooltipFields: ['NomEntworseauVCourEau', 'CdEntworseauVCourEau'],
  },
  {
    id: 'cours-eau-2',
    label: 'Cours d\'eau secondaires (50-100km)',
    group: 'carthage',
    minZoom: 8,
    geometryType: 'line',
    color: '#93c5fd',  // blue-300
    tooltipFields: ['NomEntworseauVCourEau', 'CdEntworseauVCourEau'],
  },
  {
    id: 'plan-eau',
    label: 'Plans d\'eau',
    group: 'carthage',
    minZoom: 8,
    geometryType: 'polygon',
    color: '#38bdf8',  // sky-400
    tooltipFields: ['NomEntworseauVPlanEau', 'CdEntworseauVPlanEau', 'Superficie'],
  },
  // --- Hydro-écologie (checkboxes, independent) ---
  {
    id: 'masse-eau-sout',
    label: 'Masses d\'eau souterraines (DCE)',
    group: 'hydroeco',
    minZoom: 7,
    geometryType: 'polygon',
    color: '#a78bfa',  // violet-400
    tooltipFields: ['CdMasseDEau', 'NomMasseDEau', 'EchelleApparworseenance'],
  },
  {
    id: 'masse-eau-riv',
    label: 'Masses d\'eau cours d\'eau (DCE)',
    group: 'hydroeco',
    minZoom: 8,
    geometryType: 'line',
    color: '#c084fc',  // purple-400
    tooltipFields: ['CdMasseDEau', 'NomMasseDEau'],
  },
]

export const WFS_LAYER_MAP = Object.fromEntries(
  WFS_LAYERS.map(l => [l.id, l])
) as Record<WfsLayerId, WfsLayerConfig>

export interface LayerGroup {
  id: string
  label: string
  icon: string
  mode: 'radio' | 'checkbox'  // radio = one at a time, checkbox = independent
  layers: WfsLayerConfig[]
}

export const LAYER_GROUPS: LayerGroup[] = [
  {
    id: 'sandre',
    label: 'Zonages SANDRE',
    icon: '\u{1F30A}',  // wave emoji
    mode: 'radio',
    layers: WFS_LAYERS.filter(l => l.group === 'sandre'),
  },
  {
    id: 'carthage',
    label: 'Réseau hydrographique',
    icon: '\u{1F3DE}',  // national park emoji
    mode: 'checkbox',
    layers: WFS_LAYERS.filter(l => l.group === 'carthage'),
  },
  {
    id: 'hydroeco',
    label: 'Hydro-écologie',
    icon: '\u{1F9EA}',  // test tube emoji
    mode: 'checkbox',
    layers: WFS_LAYERS.filter(l => l.group === 'hydroeco'),
  },
]
```

**Step 2: Commit**

```bash
git add frontend/src/lib/layerConfig.ts
git commit -m "feat: add WFS layer configuration registry"
```

---

### Task 4: LayerPanel Component (Accordion with Radio/Checkbox)

**Files:**
- Create: `frontend/src/components/map/LayerPanel.tsx`

**Step 1: Create the accordion panel component**

This replaces the current flat checkbox list in ObservatoryPage. It manages which WFS layers are enabled and passes that state up.

```typescript
import { useState } from 'react'
import { LAYER_GROUPS } from '@/lib/layerConfig'
import type { WfsLayerId } from '@/lib/types'

interface Props {
  // Existing static layers
  showRegions: boolean
  setShowRegions: (v: boolean) => void
  showDepts: boolean
  setShowDepts: (v: boolean) => void
  showHER: boolean
  setShowHER: (v: boolean) => void
  showSandreDistricts: boolean
  setShowSandreDistricts: (v: boolean) => void
  // WFS dynamic layers
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

          {/* HER-2 in hydroeco group */}
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
```

**Step 2: Commit**

```bash
git add frontend/src/components/map/LayerPanel.tsx
git commit -m "feat: add accordion LayerPanel component for map layers"
```

---

### Task 5: Integrate WFS Layers into ObservatoryMap

**Files:**
- Modify: `frontend/src/components/map/ObservatoryMap.tsx` (add WFS layer rendering)

This is the core task. The map component needs to:
1. Accept `activeWfsLayers` as a prop (Set of layer IDs)
2. Accept `wfsData` as a prop (Record<WfsLayerId, GeoJSON>)
3. Add/remove MapLibre sources and layers when WFS data arrives or layers toggle
4. Add hover (tooltip) and click (zoom + spatial filter) interactions for each WFS layer

**Step 1: Update Props interface**

Add to the existing Props interface in ObservatoryMap.tsx:

```typescript
import type { WfsLayerId, WfsLayerConfig } from '../../lib/types'
import { WFS_LAYER_MAP } from '../../lib/layerConfig'

interface Props {
  // ... existing props ...
  activeWfsLayers?: Set<WfsLayerId>
  wfsData?: Record<string, any>  // layerId → GeoJSON FeatureCollection
}
```

**Step 2: Add a useEffect that syncs WFS layers to the map**

After the existing layer visibility useEffects, add a new effect:

```typescript
// Sync WFS layers to map
useEffect(() => {
  if (!mapRef.current || !mapLoadedRef.current) return
  const map = mapRef.current
  const active = activeWfsLayers ?? new Set()

  // For each known WFS layer, add or show/hide
  for (const [layerId, config] of Object.entries(WFS_LAYER_MAP)) {
    const fillId = `wfs-${layerId}-fill`
    const lineId = `wfs-${layerId}-line`
    const isActive = active.has(layerId as WfsLayerId)
    const data = wfsData?.[layerId]

    // If layer doesn't exist yet but we have data and it's active, add it
    if (isActive && data && !map.getSource(`wfs-${layerId}`)) {
      map.addSource(`wfs-${layerId}`, { type: 'geojson', data, generateId: true })

      if (config.geometryType === 'polygon') {
        map.addLayer({
          id: fillId,
          type: 'fill',
          source: `wfs-${layerId}`,
          paint: {
            'fill-color': config.color,
            'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.30, 0.12],
          },
        }, 'piezo-clusters')
        map.addLayer({
          id: lineId,
          type: 'line',
          source: `wfs-${layerId}`,
          paint: {
            'line-color': config.color,
            'line-width': 1,
            'line-opacity': 0.5,
          },
        }, 'piezo-clusters')
      } else {
        // Line geometry
        map.addLayer({
          id: lineId,
          type: 'line',
          source: `wfs-${layerId}`,
          paint: {
            'line-color': config.color,
            'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 12, 3],
            'line-opacity': 0.7,
          },
        }, 'piezo-clusters')
      }

      // Hover interaction
      const hoverLayerId = config.geometryType === 'polygon' ? fillId : lineId
      let hoveredId: number | null = null

      map.on('mousemove', hoverLayerId, (e) => {
        if (!e.features?.length) return
        const feat = e.features[0]
        if (hoveredId !== null) map.setFeatureState({ source: `wfs-${layerId}`, id: hoveredId }, { hover: false })
        hoveredId = feat.id as number
        map.setFeatureState({ source: `wfs-${layerId}`, id: hoveredId }, { hover: true })
        // Build tooltip from config.tooltipFields
        const parts = config.tooltipFields
          .map(f => feat.properties?.[f])
          .filter(Boolean)
        setTooltip({ name: parts.join(' — ') || layerId, x: e.point.x, y: e.point.y })
      })
      map.on('mouseleave', hoverLayerId, () => {
        if (hoveredId !== null) map.setFeatureState({ source: `wfs-${layerId}`, id: hoveredId }, { hover: false })
        hoveredId = null
        setTooltip(null)
      })
      map.on('mouseenter', hoverLayerId, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', hoverLayerId, () => { map.getCanvas().style.cursor = '' })

      // Click → zoom + spatial filter (polygons only)
      if (config.geometryType === 'polygon') {
        map.on('click', fillId, (e) => {
          const feat = e.features?.[0]
          if (!feat) return
          const bbox = computeBbox(feat.geometry)
          map.fitBounds(bbox as maplibregl.LngLatBoundsLike, { padding: 60, duration: 500 })
          const codes = stationsInGeometry(featuresRef.current, feat.geometry)
          onSpatialFilterRef.current?.(codes.length > 0 ? codes : null)
        })
      }
    }

    // Update data if source exists
    if (data && map.getSource(`wfs-${layerId}`)) {
      const src = map.getSource(`wfs-${layerId}`) as maplibregl.GeoJSONSource
      src.setData(data)
    }

    // Toggle visibility
    if (map.getLayer(fillId)) {
      map.setLayoutProperty(fillId, 'visibility', isActive ? 'visible' : 'none')
    }
    if (map.getLayer(lineId)) {
      map.setLayoutProperty(lineId, 'visibility', isActive ? 'visible' : 'none')
    }
  }
}, [activeWfsLayers, wfsData])
```

**Step 3: Update the empty-click handler**

In the existing `map.on('click', ...)` handler that clears spatial filters, add WFS fill layers to the check:

```typescript
const visibleSpatialLayers = [
  'depts-fill', 'regions-fill', 'her-fill', 'bassins-fill',
  // Add visible WFS polygon layers
  ...Object.entries(WFS_LAYER_MAP)
    .filter(([, cfg]) => cfg.geometryType === 'polygon')
    .map(([id]) => `wfs-${id}-fill`)
].filter(id => {
  if (!map.getLayer(id)) return false
  return map.getLayoutProperty(id, 'visibility') === 'visible'
})
```

**Step 4: Commit**

```bash
git add frontend/src/components/map/ObservatoryMap.tsx
git commit -m "feat(map): render WFS layers with hover/click interactions"
```

---

### Task 6: Wire Everything in ObservatoryPage

**Files:**
- Modify: `frontend/src/pages/ObservatoryPage.tsx`

This task connects the LayerPanel, useWfsLayer hooks, and ObservatoryMap together.

**Step 1: Replace the Calques panel with LayerPanel and add WFS state management**

```typescript
import { useState, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ObservatoryMap } from '../components/map/ObservatoryMap'
import { StationPopup } from '../components/map/StationPopup'
import { KPIBar } from '../components/map/KPIBar'
import { SearchBar } from '../components/map/SearchBar'
import { GlobalFilters } from '../components/filters/GlobalFilters'
import { LayerPanel } from '../components/map/LayerPanel'
import { useStationsGeoJSON } from '../hooks/useStations'
import { useWfsLayer } from '../hooks/useWfsLayer'
import { LAYER_GROUPS } from '../lib/layerConfig'
import type { StationGeoJSONFeature } from '../lib/types'
import type { WfsLayerId } from '../lib/types'
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
        // Radio: deselect all others in group, toggle this one
        group.layers.forEach(l => next.delete(l.id))
        if (!prev.has(layerId)) next.add(layerId)
      } else {
        // Checkbox: simple toggle
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
  }, [setFilter])

  const handleBassinClick = useCallback((code: string | null) => {
    setFilter('bassin', code ?? undefined)
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

      <GlobalFilters
        filters={filters}
        setFilter={setFilter}
        filteredCount={filteredFeatures.length}
        totalCount={geojsonData?.features?.length ?? 0}
      />

      {/* Station layer toggles */}
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

      {/* Layer panel (replaces old Calques) */}
      <LayerPanel
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
```

**Step 2: Commit**

```bash
git add frontend/src/pages/ObservatoryPage.tsx
git commit -m "feat: wire WFS layers, LayerPanel, and data hooks in ObservatoryPage"
```

---

### Task 7: Verify WFS Property Names and Fix Tooltips

**Files:**
- Modify: `frontend/src/lib/layerConfig.ts` (fix tooltipFields if needed)

After the first integration, the WFS GeoJSON responses may have different property names than expected. This task is to:

**Step 1: Hit each WFS endpoint and inspect the actual property names**

```bash
# From project root, with backend running:
curl -s "http://localhost:8000/api/v1/wfs/region-hydro" | python -c "import sys,json; d=json.load(sys.stdin); print(list(d['features'][0]['properties'].keys()) if d['features'] else 'no features')"

curl -s "http://localhost:8000/api/v1/wfs/secteur-hydro" | python -c "import sys,json; d=json.load(sys.stdin); print(list(d['features'][0]['properties'].keys()) if d['features'] else 'no features')"

curl -s "http://localhost:8000/api/v1/wfs/cours-eau-1" | python -c "import sys,json; d=json.load(sys.stdin); print(list(d['features'][0]['properties'].keys()) if d['features'] else 'no features')"

curl -s "http://localhost:8000/api/v1/wfs/masse-eau-sout" | python -c "import sys,json; d=json.load(sys.stdin); print(list(d['features'][0]['properties'].keys()) if d['features'] else 'no features')"
```

**Step 2: Update `tooltipFields` in `layerConfig.ts` to match actual property names**

Example: if `RegionHydro` returns `{CdRegionHydro: "A", LbRegionHydro: "Artois-Picardie"}`, keep as-is. If it returns `{code: "A", nom: "Artois-Picardie"}`, update tooltipFields to `['code', 'nom']`.

**Step 3: Commit fixes**

```bash
git add frontend/src/lib/layerConfig.ts
git commit -m "fix: correct WFS property names for tooltip display"
```

---

### Task 8: Build, Lint, Type-Check

**Step 1: Backend lint**

```bash
cd backend
ruff check app/
ruff format app/
```

**Step 2: Frontend type-check and lint**

```bash
cd frontend
npx tsc --noEmit
npm run lint
npm run build
```

**Step 3: Fix any issues found**

**Step 4: Commit all fixes**

```bash
git add -A
git commit -m "fix: resolve lint and type errors from WFS layers feature"
```

---

### Task 9: Manual Integration Test

**Step 1: Start both servers**

```bash
# Terminal 1:
cd backend && uvicorn app.main:app --reload --port 8000

# Terminal 2:
cd frontend && npm run dev
```

**Step 2: Test checklist**

- [ ] Open http://localhost:5173
- [ ] Click "Calques" button — accordion panel appears with 4 groups
- [ ] Expand "Zonages SANDRE" — 4 radio options
- [ ] Select "Régions hydrographiques" — polygons appear on map
- [ ] Hover a polygon — tooltip shows code + name
- [ ] Click a polygon — map zooms, stations filter
- [ ] Select "Secteurs hydrographiques" — replaces régions (radio behavior)
- [ ] Expand "Réseau hydrographique" — enable "Cours d'eau principaux"
- [ ] Blue lines appear for major rivers
- [ ] Expand "Hydro-écologie" — enable "Masses d'eau souterraines"
- [ ] Purple polygons appear
- [ ] Click on empty map — clears all spatial filters
- [ ] Existing layers (Régions, Départements, HER, Bassins) still work

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete WFS hydrological layers integration"
```
