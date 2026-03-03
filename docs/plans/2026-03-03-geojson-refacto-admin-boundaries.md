# GeoJSON Refactoring + Couches Admin + Redis — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Remplacer le chargement lourd (26 MB) par l'endpoint GeoJSON léger (5 MB), ajouter des couches régions/départements interactives sur la carte, et activer Redis pour le cache.

**Architecture:** `ObservatoryPage` charge toutes les stations via `/stations/geojson` (une seule fois, mise en cache React Query 1h). Le filtrage dept/classification se fait client-side. `StationPopup` auto-fetch son détail via `usePiezoStationDetail`/`useHydroStationDetail`. Les couches administratives GeoJSON (régions + départements) sont chargées dans MapLibre depuis `public/geo/`, avec hover + clic pour filtrer.

**Tech Stack:** React 18, MapLibre GL 4, TanStack React Query, FastAPI, Redis 7, TypeScript

**Design doc:** `docs/plans/2026-03-03-geojson-refacto-admin-boundaries-design.md`

---

### Task 0 : Redis dédié

**Files:**
- Modify: `backend/.env`

**Step 1 : Vérifier qu'aucun container `hydro-redis` n'existe déjà**
```bash
docker ps -a --filter name=hydro-redis
```

**Step 2 : Démarrer le container Redis sur port 6380**
```bash
docker run -d --name hydro-redis -p 6380:6379 redis:7-alpine \
  redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
```

**Step 3 : Vérifier que Redis répond**
```bash
docker exec hydro-redis redis-cli ping
```
Expected: `PONG`

**Step 4 : Mettre à jour `.env`**

Dans `backend/.env`, changer :
```
REDIS_URL=redis://redis:6379/0
```
en :
```
REDIS_URL=redis://127.0.0.1:6380/0
```

**Step 5 : Tuer le backend actuel et le relancer**
```bash
powershell.exe -Command "Get-Process -Name python | Where-Object { $_.CommandLine -like '*uvicorn*' } | Stop-Process -Force" 2>/dev/null || true
netstat -ano 2>/dev/null | grep :8001 | awk '{print $5}' | xargs -I{} powershell.exe -Command "Stop-Process -Id {} -Force" 2>/dev/null || true
```
Puis relancer depuis `backend/` :
```bash
cd /e/hydro_dashboard/backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 &
sleep 3
```

**Step 6 : Vérifier que Redis est utilisé**
```bash
curl -s http://localhost:8001/api/v1/stations/geojson | head -c 100
docker exec hydro-redis redis-cli keys "hydro:*" | head -5
```
Expected: La deuxième commande retourne des clés `hydro:*` prouvant que le cache s'est rempli.

**Step 7 : Commit**
```bash
cd /e/hydro_dashboard
git add backend/.env
git commit -m "fix: use dedicated Redis on port 6380 for hydro backend"
```

---

### Task 1 : StationPopup — self-fetch via code+type

**Context:** Le popup reçoit actuellement un objet station complet. Après refactoring, la carte n'a que `code` et `type` disponibles. On le rend auto-suffisant.

**Files:**
- Modify: `frontend/src/components/map/StationPopup.tsx`

**Step 1 : Lire le fichier actuel**
Lire `frontend/src/components/map/StationPopup.tsx` pour avoir le code exact avant modification.

**Step 2 : Remplacer le composant entier**

```typescript
import { Link } from 'react-router-dom'
import { X, ExternalLink, Calendar, Database, Mountain } from 'lucide-react'
import { ClassificationBadge } from '../station/ClassificationBadge'
import { formatNumber } from '../../lib/utils'
import { usePiezoStationDetail, useHydroStationDetail } from '../../hooks/useStations'

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

function PopupSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div role="dialog" className="absolute bottom-20 left-4 z-10 bg-bg-card border border-white/10 rounded-xl shadow-2xl p-4 w-[calc(100%-2rem)] sm:w-80 backdrop-blur-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 space-y-2">
          <div className="h-3 w-16 bg-white/10 rounded animate-pulse" />
          <div className="h-4 w-40 bg-white/10 rounded animate-pulse" />
          <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
        </div>
        <button onClick={onClose} aria-label="Fermer" className="p-1 hover:bg-bg-hover rounded">
          <X className="w-4 h-4 text-text-secondary" />
        </button>
      </div>
      <div className="space-y-2">
        <div className="h-5 w-20 bg-white/10 rounded animate-pulse" />
        <div className="h-3 w-full bg-white/10 rounded animate-pulse" />
        <div className="h-3 w-3/4 bg-white/10 rounded animate-pulse" />
      </div>
    </div>
  )
}

export function StationPopup({ code, type, onClose }: Props) {
  const isPiezo = type === 'piezo'
  const { data: station, isLoading } = isPiezo
    ? usePiezoStationDetail(code)
    : useHydroStationDetail(code)

  if (isLoading || !station) return <PopupSkeleton onClose={onClose} />

  const name = isPiezo
    ? (station.nom_commune || station.code_bss)
    : (station.libelle_station || station.code_station)

  const stationCode = isPiezo ? station.code_bss : station.code_station
  const classification = isPiezo
    ? station.classification_derniere_annee
    : station.classification_resultat_dern_annee

  const value = isPiezo
    ? (station as any).niveau_derniere_annee
    : (station as any).resultat_moyen_global

  const unit = isPiezo ? 'm NGF' : 'm³/s'
  const dept = station.nom_departement ?? station.code_departement ?? ''

  return (
    <div role="dialog" aria-label={`Station ${stationCode}`} className="absolute bottom-20 left-4 z-10 bg-bg-card border border-white/10 rounded-xl shadow-2xl p-4 w-[calc(100%-2rem)] sm:w-80 backdrop-blur-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-accent-cyan font-medium uppercase tracking-wide mb-1">
            {isPiezo ? 'Piézométrie' : 'Hydrométrie'}
          </p>
          <h3 className="text-sm font-semibold text-text-primary truncate">{name}</h3>
          <p className="text-xs text-text-secondary">{dept} &middot; {stationCode}</p>
        </div>
        <button onClick={onClose} aria-label="Fermer" className="p-1 hover:bg-bg-hover rounded">
          <X className="w-4 h-4 text-text-secondary" />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <ClassificationBadge classification={classification} />
        {value != null && (
          <span className="text-sm text-text-primary font-mono">
            {formatNumber(value)} {unit}
          </span>
        )}
      </div>

      {(station as any).tendance_classification && (
        <p className="text-xs text-text-secondary mb-3">
          Tendance: <span className="text-text-primary">{(station as any).tendance_classification}</span>
        </p>
      )}

      <div className="mt-2 pt-2 border-t border-white/10 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-400 mb-3">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3 flex-shrink-0" />
          <span>{formatPeriod((station as any).premiere_mesure, station.derniere_mesure)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Database className="w-3 h-3 flex-shrink-0" />
          <span>{isPiezo
            ? `${formatCount((station as any).nb_mesures_total)} mesures`
            : `${formatCount((station as any).nb_jours_total ?? (station as any).nb_mois_total)} j.`
          }</span>
        </div>
        {isPiezo && (station as any).altitude_station != null && (
          <div className="flex items-center gap-1 col-span-2">
            <Mountain className="w-3 h-3 flex-shrink-0" />
            <span>Alt. {((station as any).altitude_station as number).toFixed(0)} m NGF</span>
          </div>
        )}
        {(station as any).percentile_derniere_annee != null && (
          <div className="flex items-center gap-1 col-span-2">
            <span className="text-gray-500">Percentile :</span>
            <span className="text-gray-200 font-medium">{Math.round((station as any).percentile_derniere_annee)}e</span>
          </div>
        )}
        {(station as any).percentile_resultat_dern_annee != null && (
          <div className="flex items-center gap-1 col-span-2">
            <span className="text-gray-500">Percentile :</span>
            <span className="text-gray-200 font-medium">{Math.round((station as any).percentile_resultat_dern_annee)}e</span>
          </div>
        )}
      </div>

      <Link
        to={`/station/${type}/${stationCode}`}
        className="flex items-center gap-1.5 text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors"
      >
        Voir les détails <ExternalLink className="w-3 h-3" />
      </Link>
    </div>
  )
}
```

> **Note:** `usePiezoStationDetail` et `useHydroStationDetail` existent déjà dans `frontend/src/hooks/useStations.ts` — pas de nouvelle fonction à créer.

**Step 3 : Vérifier que TypeScript compile**
```bash
cd /e/hydro_dashboard/frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 erreurs (ou uniquement des warnings d'autres fichiers non modifiés)

**Step 4 : Commit**
```bash
git add frontend/src/components/map/StationPopup.tsx
git commit -m "refactor: StationPopup self-fetches detail via code+type"
```

---

### Task 2 : Types + API + Hook GeoJSON

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/hooks/useStations.ts`

**Step 1 : Ajouter les interfaces GeoJSON dans `types.ts`**

Ajouter à la fin de `frontend/src/lib/types.ts` (avant la ligne `export type Classification`) :

```typescript
// GeoJSON station types (endpoint /stations/geojson)
export interface StationGeoJSONProperties {
  code: string
  type: 'piezo' | 'hydro'
  classification: string | null
  commune: string | null
  departement: string | null
  code_departement: string | null
}

export interface StationGeoJSONFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: StationGeoJSONProperties
}

export interface StationGeoJSON {
  type: 'FeatureCollection'
  features: StationGeoJSONFeature[]
}
```

**Step 2 : Ajouter `stations.geojson` dans `api.ts`**

Dans `frontend/src/lib/api.ts`, importer `StationGeoJSON` et ajouter dans `api.stations` :
```typescript
geojson: (stationType?: 'piezo' | 'hydro' | 'all') =>
  fetchJson<StationGeoJSON>('/stations/geojson', stationType ? { type: stationType } : undefined),
```

**Step 3 : Ajouter `useStationsGeoJSON` dans `useStations.ts`**

Ajouter dans `frontend/src/hooks/useStations.ts` :
```typescript
import type { StationGeoJSON } from '../lib/types'

export function useStationsGeoJSON() {
  return useQuery({
    queryKey: ['stations', 'geojson'],
    queryFn: () => api.stations.geojson(),
    staleTime: 3_600_000, // 1h — correspond au TTL Redis du backend
  })
}
```

**Step 4 : Vérifier que TypeScript compile**
```bash
cd /e/hydro_dashboard/frontend && npx tsc --noEmit 2>&1 | head -20
```

**Step 5 : Commit**
```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useStations.ts
git commit -m "feat: add StationGeoJSON types, api.stations.geojson(), useStationsGeoJSON hook"
```

---

### Task 3 : ObservatoryMap — props GeoJSON features

**Context:** `ObservatoryMap` reçoit actuellement `piezoStations: any[]` et `hydroStations: any[]`. On remplace par `features: StationGeoJSONFeature[]` et on adapte les sources MapLibre.

**Files:**
- Modify: `frontend/src/components/map/ObservatoryMap.tsx`

**Step 1 : Lire le fichier actuel** pour avoir le code exact.

**Step 2 : Modifier l'interface Props**

Remplacer :
```typescript
interface Props {
  piezoStations?: any[]
  hydroStations?: any[]
  showPiezo?: boolean
  showHydro?: boolean
  onStationClick?: (station: any, type: 'piezo' | 'hydro') => void
  era5Data?: any[]
  era5Variable?: 'total_precipitation' | 'temperature_2m'
  showERA5?: boolean
}
```
Par :
```typescript
import type { StationGeoJSONFeature } from '../../lib/types'

interface Props {
  features?: StationGeoJSONFeature[]
  showPiezo?: boolean
  showHydro?: boolean
  onStationClick?: (code: string, type: 'piezo' | 'hydro') => void
  onDeptClick?: (code: string | null) => void
  era5Data?: any[]
  era5Variable?: 'total_precipitation' | 'temperature_2m'
  showERA5?: boolean
}
```

**Step 3 : Supprimer `stationsToGeoJSON` et les refs de lookup**

Supprimer la fonction `stationsToGeoJSON` (lignes 71-88).
Supprimer `piezoMapRef`, `hydroMapRef` et leurs `useEffect` de population (lignes 255-268 environ).

**Step 4 : Ajouter la fonction helper interne de build GeoJSON depuis features**

Remplacer `stationsToGeoJSON` par cette fonction locale (avant `buildColorExpression`) :
```typescript
function featuresToGeoJSON(features: StationGeoJSONFeature[]) {
  return {
    type: 'FeatureCollection' as const,
    features: features
      .filter(f => f.geometry.coordinates[0] != null && f.geometry.coordinates[1] != null)
      .map(f => ({
        type: 'Feature' as const,
        geometry: f.geometry,
        properties: {
          code: f.properties.code,
          classification: f.properties.classification ?? 'UNKNOWN',
        },
      })),
  }
}
```

**Step 5 : Adapter les refs de données**

Remplacer :
```typescript
const piezoDataRef = useRef<any[]>()
const hydroDataRef = useRef<any[]>()
// ...
piezoDataRef.current = piezoStations
hydroDataRef.current = hydroStations
```
Par :
```typescript
const featuresRef = useRef<StationGeoJSONFeature[]>([])
featuresRef.current = features ?? []
```

**Step 6 : Adapter `updateSource`**

Remplacer la signature :
```typescript
const updateSource = useCallback((map, sourceId, stations, classificationKey, codeKey) => {
  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
  if (source) {
    source.setData(stations?.length ? stationsToGeoJSON(stations, classificationKey, codeKey) as any : { type: 'FeatureCollection', features: [] })
  }
}, [])
```
Par :
```typescript
const updateSource = useCallback((map: maplibregl.Map, sourceId: string, features: StationGeoJSONFeature[]) => {
  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
  if (source) {
    source.setData(features.length ? featuresToGeoJSON(features) as any : { type: 'FeatureCollection', features: [] })
  }
}, [])
```

**Step 7 : Adapter la population initiale dans `map.on('load', ...)`**

Remplacer :
```typescript
if (piezoDataRef.current?.length) {
  updateSource(map, 'piezo-stations', piezoDataRef.current, 'classification_derniere_annee', 'code_bss')
}
if (hydroDataRef.current?.length) {
  updateSource(map, 'hydro-stations', hydroDataRef.current, 'classification_resultat_dern_annee', 'code_station')
}
```
Par :
```typescript
const allFeatures = featuresRef.current
const piezoFeats = allFeatures.filter(f => f.properties.type === 'piezo')
const hydroFeats = allFeatures.filter(f => f.properties.type === 'hydro')
if (piezoFeats.length) updateSource(map, 'piezo-stations', piezoFeats)
if (hydroFeats.length) updateSource(map, 'hydro-stations', hydroFeats)
```

**Step 8 : Adapter les clicks station**

Remplacer :
```typescript
map.on('click', 'piezo-unclustered', (e) => {
  if (!e.features?.length) return
  const code = e.features[0].properties?.code
  const station = piezoMapRef.current.get(code)
  if (station && onStationClickRef.current) onStationClickRef.current(station, 'piezo')
})
map.on('click', 'hydro-unclustered', (e) => {
  if (!e.features?.length) return
  const code = e.features[0].properties?.code
  const station = hydroMapRef.current.get(code)
  if (station && onStationClickRef.current) onStationClickRef.current(station, 'hydro')
})
```
Par :
```typescript
map.on('click', 'piezo-unclustered', (e) => {
  const code = e.features?.[0]?.properties?.code
  if (code) onStationClickRef.current?.(code, 'piezo')
})
map.on('click', 'hydro-unclustered', (e) => {
  const code = e.features?.[0]?.properties?.code
  if (code) onStationClickRef.current?.(code, 'hydro')
})
```

**Step 9 : Adapter les useEffect de mise à jour des données**

Remplacer les deux useEffect (piezo + hydro) par un seul :
```typescript
useEffect(() => {
  if (!mapRef.current || !mapLoadedRef.current) return
  const map = mapRef.current
  const piezoFeats = (features ?? []).filter(f => f.properties.type === 'piezo')
  const hydroFeats = (features ?? []).filter(f => f.properties.type === 'hydro')
  updateSource(map, 'piezo-stations', piezoFeats)
  updateSource(map, 'hydro-stations', hydroFeats)
}, [features, updateSource])
```

**Step 10 : Adapter MapLegend**

Remplacer :
```typescript
const piezoCount = useMemo(
  () => piezoStations?.filter((s: any) => s.longitude != null && s.latitude != null).length ?? 0,
  [piezoStations]
)
const hydroCount = useMemo(
  () => hydroStations?.filter((s: any) => s.longitude != null && s.latitude != null).length ?? 0,
  [hydroStations]
)
```
Par :
```typescript
const piezoCount = useMemo(
  () => (features ?? []).filter(f => f.properties.type === 'piezo').length,
  [features]
)
const hydroCount = useMemo(
  () => (features ?? []).filter(f => f.properties.type === 'hydro').length,
  [features]
)
```

**Step 11 : Adapter le composant principal**

Remplacer la signature de la fonction :
```typescript
export function ObservatoryMap({
  piezoStations,
  hydroStations,
  showPiezo = true,
  showHydro = true,
  onStationClick,
  era5Data,
  era5Variable = 'total_precipitation',
  showERA5 = false,
}: Props) {
```
Par :
```typescript
export function ObservatoryMap({
  features,
  showPiezo = true,
  showHydro = true,
  onStationClick,
  onDeptClick,
  era5Data,
  era5Variable = 'total_precipitation',
  showERA5 = false,
}: Props) {
```

Ajouter `onDeptClickRef` :
```typescript
const onDeptClickRef = useRef(onDeptClick)
onDeptClickRef.current = onDeptClick
```

**Step 12 : Vérifier TypeScript**
```bash
cd /e/hydro_dashboard/frontend && npx tsc --noEmit 2>&1 | head -30
```

**Step 13 : Commit**
```bash
git add frontend/src/components/map/ObservatoryMap.tsx
git commit -m "refactor: ObservatoryMap accepts StationGeoJSONFeature[] instead of separate station arrays"
```

---

### Task 4 : SearchBar — GeoJSON features

**Files:**
- Modify: `frontend/src/components/map/SearchBar.tsx`

**Step 1 : Remplacer props et logique de recherche**

Modifier `SearchBar.tsx` pour utiliser les features GeoJSON.

Nouvelles props :
```typescript
import type { StationGeoJSONFeature } from '../../lib/types'

interface Props {
  features?: StationGeoJSONFeature[]
  onSelect: (code: string, type: 'piezo' | 'hydro') => void
}
```

Nouvelle logique `results` :
```typescript
const results = useMemo(() => {
  if (!query || query.length < 2) return []
  const q = query.toLowerCase()
  return (features ?? [])
    .filter(f => {
      const name = (f.properties.commune || f.properties.code || '').toLowerCase()
      return name.includes(q) || f.properties.code.toLowerCase().includes(q)
    })
    .slice(0, 10)
}, [query, features])
```

Nouvelle fonction `selectItem` :
```typescript
const selectItem = useCallback((f: StationGeoJSONFeature) => {
  onSelect(f.properties.code, f.properties.type)
  setQuery('')
  setOpen(false)
  setHighlightIndex(-1)
}, [onSelect])
```

Nouveau JSX pour les résultats (remplacer le `.map` existant) :
```tsx
{results.map((f, i) => (
  <button
    key={`${f.properties.type}-${f.properties.code}-${i}`}
    role="option"
    aria-selected={i === highlightIndex}
    onClick={() => selectItem(f)}
    className={`w-full text-left px-3 py-2 transition-colors border-b border-white/5 last:border-0 ${
      i === highlightIndex ? 'bg-bg-hover' : 'hover:bg-bg-hover'
    }`}
  >
    <div className="flex items-center gap-2">
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
        f.properties.type === 'piezo'
          ? 'bg-accent-cyan/20 text-accent-cyan'
          : 'bg-accent-indigo/20 text-accent-indigo'
      }`}>
        {f.properties.type === 'piezo' ? 'PIEZO' : 'HYDRO'}
      </span>
      <span className="text-sm text-text-primary truncate">
        {f.properties.commune || f.properties.code}
      </span>
    </div>
    <p className="text-xs text-text-secondary mt-0.5 ml-14">
      {f.properties.departement || ''} &middot; {f.properties.code}
    </p>
  </button>
))}
```

**Step 2 : Adapter handleKeyDown**

La logique clavier reste la même, juste l'appel `selectItem(results[highlightIndex])` devient `selectItem(results[highlightIndex])` — aucun changement car `results` est maintenant `StationGeoJSONFeature[]`.

**Step 3 : Vérifier TypeScript**
```bash
cd /e/hydro_dashboard/frontend && npx tsc --noEmit 2>&1 | head -30
```

**Step 4 : Commit**
```bash
git add frontend/src/components/map/SearchBar.tsx
git commit -m "refactor: SearchBar uses StationGeoJSONFeature[] for search"
```

---

### Task 5 : ObservatoryPage — refactoring complet

**Files:**
- Modify: `frontend/src/pages/ObservatoryPage.tsx`

**Step 1 : Lire le fichier actuel complet**

**Step 2 : Remplacer les imports stations**

Supprimer :
```typescript
import { usePiezoStations, useHydroStations } from '../hooks/useStations'
```
Ajouter :
```typescript
import { useStationsGeoJSON } from '../hooks/useStations'
import type { StationGeoJSONFeature } from '../lib/types'
```

**Step 3 : Remplacer les hooks de données**

Supprimer :
```typescript
const { data: piezoStations, isLoading: piezoLoading, isError: piezoError } = usePiezoStations({ ...apiParams, limit: '30000' })
const { data: hydroStations, isLoading: hydroLoading, isError: hydroError } = useHydroStations({ ...apiParams, limit: '30000' })
```
Remplacer par :
```typescript
const { data: geojsonData, isError: geojsonError } = useStationsGeoJSON()

const filteredFeatures = useMemo<StationGeoJSONFeature[]>(() => {
  const all = geojsonData?.features ?? []
  return all.filter(f => {
    if (filters.codeDepartement && f.properties.code_departement !== filters.codeDepartement) return false
    if (filters.classification?.length && !filters.classification.includes(f.properties.classification ?? '')) return false
    return true
  })
}, [geojsonData, filters.codeDepartement, filters.classification])
```

**Step 4 : Adapter selectedStation**

Remplacer :
```typescript
const [selectedStation, setSelectedStation] = useState<{ station: any; type: 'piezo' | 'hydro' } | null>(null)
```
Par :
```typescript
const [selectedStation, setSelectedStation] = useState<{ code: string; type: 'piezo' | 'hydro' } | null>(null)
```

**Step 5 : Adapter handleStationClick**

Remplacer :
```typescript
const handleStationClick = useCallback((station: any, type: 'piezo' | 'hydro') => {
  setSelectedStation({ station, type })
}, [])
```
Par :
```typescript
const handleStationClick = useCallback((code: string, type: 'piezo' | 'hydro') => {
  setSelectedStation({ code, type })
}, [])
```

**Step 6 : Ajouter handleDeptClick**

```typescript
const handleDeptClick = useCallback((code: string | null) => {
  setFilter('dept', code ?? undefined)
}, [setFilter])
```

**Step 7 : Adapter `totalCount` et `freshness`**

Remplacer :
```typescript
const totalCount = (piezoStations?.length ?? 0) + (hydroStations?.length ?? 0)
const freshness = useMemo(() => { ... }, [piezoStations, hydroStations])
```
Par :
```typescript
const totalCount = filteredFeatures.length
```
Supprimer entièrement le bloc `freshness` et `formatRelativeTime`.

**Step 8 : Adapter le JSX — erreur**

Remplacer :
```typescript
{(piezoError || hydroError) && (
```
Par :
```typescript
{geojsonError && (
```

**Step 9 : Adapter les props de ObservatoryMap**

Remplacer :
```tsx
<ObservatoryMap
  piezoStations={piezoStations}
  hydroStations={hydroStations}
  showPiezo={showPiezo}
  showHydro={showHydro}
  onStationClick={handleStationClick}
  era5Data={era5Data}
  era5Variable={era5Variable}
  showERA5={showERA5}
/>
```
Par :
```tsx
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
```

**Step 10 : Adapter SearchBar**

Remplacer :
```tsx
<SearchBar
  piezoStations={piezoStations}
  hydroStations={hydroStations}
  onSelect={handleStationClick}
/>
```
Par :
```tsx
<SearchBar
  features={geojsonData?.features}
  onSelect={handleStationClick}
/>
```
> Note : SearchBar reçoit TOUTES les features (sans filtre) pour avoir tous les résultats de recherche.

**Step 11 : Adapter StationPopup**

Remplacer :
```tsx
<StationPopup
  station={selectedStation.station}
  type={selectedStation.type}
  onClose={() => setSelectedStation(null)}
/>
```
Par :
```tsx
<StationPopup
  code={selectedStation.code}
  type={selectedStation.type}
  onClose={() => setSelectedStation(null)}
/>
```

**Step 12 : Supprimer l'indicateur freshness du JSX**

Supprimer le bloc :
```tsx
{freshness && (
  <div className="absolute top-4 right-14 ...">
    ...
  </div>
)}
```

**Step 13 : Vérifier TypeScript**
```bash
cd /e/hydro_dashboard/frontend && npx tsc --noEmit 2>&1 | head -30
```

**Step 14 : Tester dans le navigateur**

Le serveur frontend tourne déjà sur port 5173.
1. Ouvrir la carte — les stations doivent s'afficher (même comportement qu'avant)
2. Cliquer une station → le popup apparaît avec un skeleton puis le contenu
3. Taper dans la barre de recherche → des résultats apparaissent
4. Activer un filtre classification depuis la barre → les clusters se mettent à jour

**Step 15 : Commit**
```bash
git add frontend/src/pages/ObservatoryPage.tsx
git commit -m "refactor: ObservatoryPage uses useStationsGeoJSON + client-side filtering"
```

---

### Task 6 : Télécharger les GeoJSON de découpage administratif

**Files:**
- Create: `frontend/public/geo/regions.geojson`
- Create: `frontend/public/geo/departments.geojson`

**Step 1 : Créer le dossier**
```bash
mkdir -p /e/hydro_dashboard/frontend/public/geo
```

**Step 2 : Télécharger les fichiers**
```bash
curl -L "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions-version-simplifiee.geojson" \
  -o /e/hydro_dashboard/frontend/public/geo/regions.geojson

curl -L "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson" \
  -o /e/hydro_dashboard/frontend/public/geo/departments.geojson
```

**Step 3 : Vérifier les fichiers**
```bash
wc -c /e/hydro_dashboard/frontend/public/geo/*.geojson
head -c 200 /e/hydro_dashboard/frontend/public/geo/regions.geojson
```
Expected: regions ~200 KB, departments ~500 KB. Le JSON doit commencer par `{"type":"FeatureCollection"`.

Vérifier les propriétés d'une feature :
```bash
python3 -c "
import json
with open('/e/hydro_dashboard/frontend/public/geo/departments.geojson') as f:
    d = json.load(f)
print(d['features'][0]['properties'])
"
```
Expected: `{'code': '01', 'nom': 'Ain'}` ou similaire. Le `code` correspond à `code_departement` dans les données stations.

**Step 4 : Commit**
```bash
git add frontend/public/geo/
git commit -m "feat: add simplified French regions and departments GeoJSON for admin boundary layers"
```

---

### Task 7 : Couches administratives dans ObservatoryMap

**Context:** Ajouter des layers régions + départements dans MapLibre avec hover (highlight + tooltip React) et clic (zoom pour région, filter dept pour département).

**Files:**
- Modify: `frontend/src/components/map/ObservatoryMap.tsx`

**Step 1 : Ajouter le state tooltip + activeCodeDept**

Dans la fonction `ObservatoryMap`, ajouter :
```typescript
const [tooltip, setTooltip] = useState<{ name: string; x: number; y: number } | null>(null)
```

Ajouter dans les props :
```typescript
activeCodeDepartement?: string  // déjà dans filters.codeDepartement
```

Et dans ObservatoryPage passer `activeCodeDepartement={filters.codeDepartement}`.

**Step 2 : Ajouter la fonction `computeBbox`**

Avant `ObservatoryMap` (fonction utilitaire fichier-level) :
```typescript
function computeBbox(geometry: any): [number, number, number, number] {
  const coords: number[][] = []
  const collect = (g: any) => {
    if (g.type === 'Point') coords.push(g.coordinates)
    else if (g.type === 'Polygon') g.coordinates[0].forEach((c: number[]) => coords.push(c))
    else if (g.type === 'MultiPolygon') g.coordinates.forEach((p: number[][][]) => p[0].forEach((c: number[]) => coords.push(c)))
  }
  collect(geometry)
  const lons = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
}
```

**Step 3 : Charger les GeoJSON et ajouter les sources dans `map.on('load', ...)`**

Ajouter APRÈS l'ajout des sources ERA5 et AVANT `addClusteredSource('piezo-stations', ...)` :

```typescript
// --- Regions ---
fetch('/geo/regions.geojson')
  .then(r => r.json())
  .then(data => {
    if (map.getSource('regions')) return // déjà chargé
    map.addSource('regions', { type: 'geojson', data, generateId: true })
    map.addLayer({
      id: 'regions-fill',
      type: 'fill',
      source: 'regions',
      maxzoom: 7,
      paint: {
        'fill-color': '#ffffff',
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.10, 0],
      },
    })
    map.addLayer({
      id: 'regions-line',
      type: 'line',
      source: 'regions',
      maxzoom: 7,
      paint: {
        'line-color': 'rgba(255,255,255,0.25)',
        'line-width': 1,
      },
    })
  })

// --- Departments ---
fetch('/geo/departments.geojson')
  .then(r => r.json())
  .then(data => {
    if (map.getSource('departments')) return
    map.addSource('departments', { type: 'geojson', data, generateId: true })
    map.addLayer({
      id: 'depts-fill',
      type: 'fill',
      source: 'departments',
      minzoom: 7,
      paint: {
        'fill-color': [
          'case',
          ['==', ['get', 'code'], activeCodeDeptRef.current ?? ''],
          '#22d3ee',  // accent-cyan
          '#ffffff',
        ],
        'fill-opacity': [
          'case',
          ['==', ['get', 'code'], activeCodeDeptRef.current ?? ''],
          0.12,
          ['boolean', ['feature-state', 'hover'], false],
          0.08,
          0,
        ],
      },
    })
    map.addLayer({
      id: 'depts-line',
      type: 'line',
      source: 'departments',
      minzoom: 7,
      paint: {
        'line-color': 'rgba(255,255,255,0.2)',
        'line-width': 0.8,
      },
    })

    // Hover regions
    let hoveredRegionId: number | null = null
    map.on('mousemove', 'regions-fill', (e) => {
      if (!e.features?.length) return
      const feat = e.features[0]
      if (hoveredRegionId !== null) map.setFeatureState({ source: 'regions', id: hoveredRegionId }, { hover: false })
      hoveredRegionId = feat.id as number
      map.setFeatureState({ source: 'regions', id: hoveredRegionId }, { hover: true })
      setTooltip({ name: feat.properties?.nom ?? '', x: e.point.x, y: e.point.y })
    })
    map.on('mouseleave', 'regions-fill', () => {
      if (hoveredRegionId !== null) map.setFeatureState({ source: 'regions', id: hoveredRegionId }, { hover: false })
      hoveredRegionId = null
      setTooltip(null)
    })

    // Hover depts
    let hoveredDeptId: number | null = null
    map.on('mousemove', 'depts-fill', (e) => {
      if (!e.features?.length) return
      const feat = e.features[0]
      if (hoveredDeptId !== null) map.setFeatureState({ source: 'departments', id: hoveredDeptId }, { hover: false })
      hoveredDeptId = feat.id as number
      map.setFeatureState({ source: 'departments', id: hoveredDeptId }, { hover: true })
      setTooltip({ name: `${feat.properties?.nom ?? ''} (${feat.properties?.code ?? ''})`, x: e.point.x, y: e.point.y })
    })
    map.on('mouseleave', 'depts-fill', () => {
      if (hoveredDeptId !== null) map.setFeatureState({ source: 'departments', id: hoveredDeptId }, { hover: false })
      hoveredDeptId = null
      setTooltip(null)
    })

    // Clic région → zoom
    map.on('click', 'regions-fill', (e) => {
      const feat = e.features?.[0]
      if (!feat) return
      const bbox = computeBbox(feat.geometry)
      map.fitBounds(bbox as maplibregl.LngLatBoundsLike, { padding: 60, duration: 500 })
    })

    // Clic département → filter ou déselect
    map.on('click', 'depts-fill', (e) => {
      const code = e.features?.[0]?.properties?.code ?? null
      const current = activeCodeDeptRef.current
      onDeptClickRef.current?.(code === current ? null : code)
    })

    // Cursor
    ;['regions-fill', 'depts-fill'].forEach(layer => {
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
    })
  })
```

**Step 4 : Ajouter `activeCodeDeptRef`**

Le `depts-fill` layer a besoin de `activeCodeDepartement` mais la `paint` expression est définie une fois à la création. Pour mettre à jour dynamiquement, on utilise `setPaintProperty`.

Ajouter :
```typescript
const activeCodeDeptRef = useRef<string | undefined>(activeCodeDepartement)
```

Et un `useEffect` pour mettre à jour la paint quand le filtre change :
```typescript
useEffect(() => {
  activeCodeDeptRef.current = activeCodeDepartement
  if (!mapRef.current || !mapLoadedRef.current) return
  const map = mapRef.current
  if (!map.getLayer('depts-fill')) return
  map.setPaintProperty('depts-fill', 'fill-color', [
    'case',
    ['==', ['get', 'code'], activeCodeDepartement ?? '$$NONE$$'],
    '#22d3ee',
    '#ffffff',
  ])
  map.setPaintProperty('depts-fill', 'fill-opacity', [
    'case',
    ['==', ['get', 'code'], activeCodeDepartement ?? '$$NONE$$'],
    0.15,
    ['boolean', ['feature-state', 'hover'], false],
    0.08,
    0,
  ])
}, [activeCodeDepartement])
```

**Step 5 : Ajouter le tooltip React dans le JSX**

Dans le `return` du composant, après `<div ref={containerRef} .../>` :
```tsx
{tooltip && (
  <div
    className="absolute z-20 bg-gray-900/95 border border-white/10 rounded px-2 py-1 text-xs text-white pointer-events-none"
    style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
  >
    {tooltip.name}
  </div>
)}
```

**Step 6 : Adapter ObservatoryPage pour passer `activeCodeDepartement`**

Dans `ObservatoryPage.tsx`, dans le JSX `<ObservatoryMap>` :
```tsx
<ObservatoryMap
  features={filteredFeatures}
  showPiezo={showPiezo}
  showHydro={showHydro}
  onStationClick={handleStationClick}
  onDeptClick={handleDeptClick}
  activeCodeDepartement={filters.codeDepartement}
  era5Data={era5Data}
  era5Variable={era5Variable}
  showERA5={showERA5}
/>
```

Ajouter `activeCodeDepartement?: string` dans l'interface Props de ObservatoryMap.

**Step 7 : Vérifier TypeScript**
```bash
cd /e/hydro_dashboard/frontend && npx tsc --noEmit 2>&1 | head -30
```

**Step 8 : Tester dans le navigateur**

1. Zoomer out (zoom < 7) → les contours de régions apparaissent
2. Hover sur une région → highlight + tooltip "Bretagne"
3. Clic sur une région → la carte zoome sur cette région
4. Zoom 7+ → les contours de départements apparaissent, régions disparaissent
5. Hover sur un département → highlight + tooltip "Finistère (29)"
6. Clic sur un département → les stations se filtrent à ce département, contour en cyan
7. Clic sur le même département → déselectionne
8. Le filtre "Département" dans la barre de filtres (GlobalFilters) est aussi mis à jour

**Step 9 : Commit**
```bash
git add frontend/src/components/map/ObservatoryMap.tsx frontend/src/pages/ObservatoryPage.tsx
git commit -m "feat: add interactive region and department boundary layers with hover and click-to-filter"
```

---

### Task 8 : Push intermédiaire

**Step 1 : Vérifier que tout compile et que la preview est propre**
```bash
cd /e/hydro_dashboard/frontend && npx tsc --noEmit
```

**Step 2 : Vérifier les erreurs console dans le navigateur**
(Utiliser `preview_console_logs` ou les DevTools du navigateur)

**Step 3 : Push vers GitLab**
```bash
cd /e/hydro_dashboard && git push origin master
```

---

### Task 9 : Backend GeoJSON + Types + useFilters — BDLISA & bassins

**Context:** Ajouter `codes_bdlisa` (piézos) et `code_district` (hydros) à l'endpoint `/stations/geojson`, étendre les types TypeScript et le hook `useFilters` pour ces deux nouveaux critères.

**Files:**
- Modify: `backend/app/routers/stations.py`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/hooks/useFilters.ts`
- Modify: `frontend/src/components/filters/GlobalFilters.tsx`

**Step 1 : Étendre le SELECT piézo dans `stations.py`**

Dans la `piezo_query` (ligne ~215), ajouter `codes_bdlisa` :
```python
piezo_query = """
    SELECT code_bss AS code, 'piezo' AS type,
           latitude, longitude, nom_commune AS commune,
           code_departement, nom_departement AS departement,
           classification_derniere_annee AS classification,
           codes_bdlisa
    FROM gold.dim_piezo_stations
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
"""
```

Et dans le bloc properties du piézo :
```python
"properties": {
    "code": r["code"],
    "type": r["type"],
    "classification": r["classification"],
    "commune": r["commune"],
    "departement": r["departement"],
    "code_departement": r["code_departement"],
    "codes_bdlisa": r["codes_bdlisa"],
},
```

**Step 2 : Étendre le SELECT hydro dans `stations.py`**

Dans la `hydro_query` (ligne ~243), ajouter `LEFT(code_cours_eau, 1) AS code_district` :
```python
hydro_query = """
    SELECT code_station AS code, 'hydro' AS type,
           latitude_station AS latitude, longitude_station AS longitude,
           libelle_station AS commune,
           code_departement, nom_departement AS departement,
           classification_resultat_dern_annee AS classification,
           LEFT(code_cours_eau, 1) AS code_district
    FROM gold.dim_hydro_stations
    WHERE latitude_station IS NOT NULL AND longitude_station IS NOT NULL
"""
```

Et dans le bloc properties hydro :
```python
"properties": {
    "code": r["code"],
    "type": r["type"],
    "classification": r["classification"],
    "commune": r["commune"],
    "departement": r["departement"],
    "code_departement": r["code_departement"],
    "code_district": r["code_district"],
},
```

**Step 3 : Invalider le cache Redis**
```bash
docker exec hydro-redis redis-cli DEL "hydro:stations_geojson:type=all"
# Ou vider tout le cache (plus sûr après modification du schéma)
docker exec hydro-redis redis-cli FLUSHDB
```

**Step 4 : Vérifier l'endpoint backend**
```bash
curl -s "http://localhost:8001/api/v1/stations/geojson?type=piezo" | python3 -c "
import sys, json
d = json.load(sys.stdin)
f = d['features'][0]
print('piezo props:', list(f['properties'].keys()))
print('codes_bdlisa sample:', f['properties'].get('codes_bdlisa'))
"

curl -s "http://localhost:8001/api/v1/stations/geojson?type=hydro" | python3 -c "
import sys, json
d = json.load(sys.stdin)
f = d['features'][0]
print('hydro props:', list(f['properties'].keys()))
print('code_district sample:', f['properties'].get('code_district'))
"
```
Expected: Les deux propriétés apparaissent dans les résultats.

**Step 5 : Étendre `StationGeoJSONProperties` dans `types.ts`**

Remplacer l'interface existante :
```typescript
export interface StationGeoJSONProperties {
  code: string
  type: 'piezo' | 'hydro'
  classification: string | null
  commune: string | null
  departement: string | null
  code_departement: string | null
  codes_bdlisa?: string | null    // piezo uniquement
  code_district?: string | null   // hydro uniquement — premier char de code_cours_eau
}
```

**Step 6 : Étendre `Filters` et `useFilters`**

Dans `frontend/src/hooks/useFilters.ts`, étendre l'interface `Filters` :
```typescript
export interface Filters {
  minObservations?: number
  lastMeasurementAfter?: string
  classification?: string[]
  codeDepartement?: string
  codeBdlisa?: string    // code BDLISA N2 (ex: "101AC")
  codeBassin?: string    // code district SANDRE (ex: "06")
}
```

Ajouter dans le `useMemo` des filters :
```typescript
codeBdlisa: searchParams.get('bdlisa') ?? undefined,
codeBassin: searchParams.get('bassin') ?? undefined,
```

**Step 7 : Étendre le reset dans `GlobalFilters.tsx`**

Dans la fonction `resetFilters` :
```typescript
const resetFilters = () => {
  setFilter('min_obs', undefined)
  setFilter('last_after', undefined)
  setFilter('classif', undefined)
  setFilter('dept', undefined)
  setFilter('bdlisa', undefined)
  setFilter('bassin', undefined)
}
```

Et dans `hasActiveFilter` :
```typescript
const hasActiveFilter = useMemo(() => {
  return (
    filters.minObservations != null ||
    filters.lastMeasurementAfter != null ||
    (filters.classification != null && filters.classification.length > 0) ||
    filters.codeDepartement != null ||
    filters.codeBdlisa != null ||
    filters.codeBassin != null
  )
}, [filters])
```

**Step 8 : Vérifier TypeScript**
```bash
cd /e/hydro_dashboard/frontend && npx tsc --noEmit 2>&1 | head -20
```

**Step 9 : Commit**
```bash
git add backend/app/routers/stations.py \
        frontend/src/lib/types.ts \
        frontend/src/hooks/useFilters.ts \
        frontend/src/components/filters/GlobalFilters.tsx
git commit -m "feat: add codes_bdlisa + code_district to geojson endpoint, extend Filters"
```

---

### Task 10 : Télécharger BDLISA N2 + SANDRE districts GeoJSON

**Files:**
- Create: `frontend/public/geo/bdlisa.geojson`
- Create: `frontend/public/geo/bassins.geojson`

> Le dossier `frontend/public/geo/` existe déjà (créé en Task 6).

**Step 1 : Télécharger les districts SANDRE (bassins hydrographiques DCE)**
```bash
curl -L \
  "https://services.sandre.eaufrance.fr/geo/zonage?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAME=BassinDCE&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326" \
  -o /e/hydro_dashboard/frontend/public/geo/bassins.geojson
```

Si cette URL retourne une erreur, essayer :
```bash
curl -L \
  "https://www.sandre.eaufrance.fr/api/zonagehydrographique/bassins.geojson" \
  -o /e/hydro_dashboard/frontend/public/geo/bassins.geojson
```

En dernier recours, télécharger manuellement depuis https://www.sandre.eaufrance.fr (section "Téléchargements" → "Bassins hydrographiques") et placer le fichier dans `frontend/public/geo/bassins.geojson`.

**Step 2 : Vérifier les propriétés du fichier bassins**
```bash
python3 -c "
import json
with open('/e/hydro_dashboard/frontend/public/geo/bassins.geojson') as f:
    d = json.load(f)
print('Nombre de districts:', len(d['features']))
print('Propriétés:', d['features'][0]['properties'])
"
```
Expected : 7 à 16 features (districts métropolitains + DOM-TOM). Les propriétés doivent contenir un code (ex: `CdBH` ou `code`) et un nom (ex: `LbBH` ou `nom`).

> **Important :** noter les noms exacts des propriétés retournées — ils seront utilisés dans Task 12.

**Step 3 : Télécharger les unités hydrogéologiques BDLISA N2**
```bash
curl -L \
  "https://geoservices.brgm.fr/geologie?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAME=GAS:UnitesHydrogeologiquesNiv2&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326" \
  -o /e/hydro_dashboard/frontend/public/geo/bdlisa.geojson
```

Si cette URL échoue, essayer depuis l'API BRGM :
```bash
curl -L \
  "https://data.brgm.fr/opendata/bdlisa/bdlisa_niv2.geojson" \
  -o /e/hydro_dashboard/frontend/public/geo/bdlisa.geojson
```

En dernier recours, télécharger depuis https://bdlisa.eaufrance.fr (onglet "Données") ou depuis https://infoterre.brgm.fr/telechargement/ et convertir si nécessaire :
```bash
# Si le fichier est un shapefile (.zip), convertir avec ogr2ogr
ogr2ogr -f GeoJSON -t_srs EPSG:4326 \
  /e/hydro_dashboard/frontend/public/geo/bdlisa.geojson \
  /chemin/vers/bdlisa_niv2.shp
```

**Step 4 : Vérifier les propriétés du fichier bdlisa**
```bash
python3 -c "
import json
with open('/e/hydro_dashboard/frontend/public/geo/bdlisa.geojson') as f:
    d = json.load(f)
print('Nombre d\'unités N2:', len(d['features']))
print('Propriétés:', d['features'][0]['properties'])
# Chercher les natures présentes
natures = set(f['properties'].get('nature') or f['properties'].get('NatureUH') or f['properties'].get('NATURE') or '' for f in d['features'])
print('Natures trouvées:', natures)
"
```
Expected : 400-600 features. Les propriétés doivent contenir un code (quelques chars alphanum), un nom, et un type de nappe (nature/NatureUH).

> **Important :** noter les noms exacts des propriétés `code`, `nom`, `nature` — ils seront utilisés en Task 12 et 13.

**Step 5 : Vérifier la correspondance codes_bdlisa ↔ BDLISA N2**
```bash
python3 -c "
import json
# Charger un échantillon de stations piézo
import urllib.request
url = 'http://localhost:8001/api/v1/stations/geojson?type=piezo'
with urllib.request.urlopen(url) as r:
    stations = json.load(r)

# Charger BDLISA N2
with open('/e/hydro_dashboard/frontend/public/geo/bdlisa.geojson') as f:
    bdlisa = json.load(f)

# Trouver le nom de la propriété code dans BDLISA
code_field = None
for candidate in ['code', 'Code', 'CODE', 'CdUH', 'cd_uh']:
    if candidate in bdlisa['features'][0]['properties']:
        code_field = candidate
        break
print('Champ code BDLISA:', code_field)

# Tester le matching
sample = [s for s in stations['features'] if s['properties'].get('codes_bdlisa')][:5]
for s in sample:
    codes_bdlisa = s['properties']['codes_bdlisa']
    print(f'Station codes_bdlisa: {codes_bdlisa}')
    matching = [f['properties'][code_field] for f in bdlisa['features']
                if codes_bdlisa and codes_bdlisa.startswith(f['properties'][code_field])]
    print(f'  → BDLISA N2 match: {matching[:3]}')
"
```
Expected : Chaque `codes_bdlisa` de station commence par un code BDLISA N2 (préfixe court).

**Step 6 : Commit**
```bash
git add frontend/public/geo/bdlisa.geojson frontend/public/geo/bassins.geojson
git commit -m "feat: add BDLISA N2 and SANDRE district GeoJSON for hydrogeological layers"
```

---

### Task 11 : ObservatoryPage — toggles BDLISA/SANDRE + filtrage client-side

**Context:** Ajouter les toggles "Nappes" et "Bassins" dans l'UI, étendre `filteredFeatures` pour filtrer par BDLISA et par district, et passer les nouveaux props à `ObservatoryMap`.

**Files:**
- Modify: `frontend/src/pages/ObservatoryPage.tsx`

**Step 1 : Lire le fichier actuel**

**Step 2 : Ajouter les constantes de mapping SANDRE**

Ajouter en tête du fichier (avant le composant) :
```typescript
// Mapping premier caractère de code_cours_eau → code district SANDRE (CdBH ou équivalent)
// Vérifier après download de bassins.geojson que les codes correspondent
const COURS_EAU_TO_DISTRICT: Record<string, string> = {
  'A': '01',                            // Artois-Picardie
  'B': '03', 'C': '03',                // Seine-Normandie
  'D': '02', 'E': '02',                // Rhin-Meuse
  'F': '04', 'G': '04', 'H': '04',    // Loire-Bretagne
  'I': '05', 'J': '05', 'K': '05',    // Adour-Garonne
  'O': '06', 'P': '06', 'Q': '06', 'R': '06', // Rhône-Méditerranée
  'Y': '07',                            // Corse
}
```

> **Note :** Vérifier ces codes contre le fichier `bassins.geojson` téléchargé (Task 10) et ajuster si nécessaire.

**Step 3 : Ajouter les états de toggle**

Après les états existants (`showPiezo`, `showHydro`, `showERA5`) :
```typescript
const [showBdlisa, setShowBdlisa] = useState(false)
const [showSandre, setShowSandre] = useState(false)
```

**Step 4 : Étendre `filteredFeatures` avec le filtrage BDLISA et bassin**

Modifier le `useMemo` de `filteredFeatures` :
```typescript
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
      const letter = f.properties.code_district ?? ''
      if (COURS_EAU_TO_DISTRICT[letter] !== filters.codeBassin) return false
    }
    return true
  })
}, [geojsonData, filters.codeDepartement, filters.classification, filters.codeBdlisa, filters.codeBassin])
```

**Step 5 : Ajouter les handlers**

```typescript
const handleBdlisaClick = useCallback((code: string | null) => {
  setFilter('bdlisa', code ?? undefined)
}, [setFilter])

const handleBassinClick = useCallback((code: string | null) => {
  setFilter('bassin', code ?? undefined)
}, [setFilter])
```

**Step 6 : Ajouter les boutons toggle dans l'UI**

Trouver le groupe de toggles existant (Piézométrie / Hydrométrie / ERA5) et ajouter :
```tsx
<button
  onClick={() => setShowBdlisa(v => !v)}
  aria-pressed={showBdlisa}
  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
    showBdlisa
      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
      : 'bg-bg-card/80 border-white/10 text-text-secondary hover:text-text-primary'
  }`}
>
  <div className="w-2 h-2 rounded-full bg-emerald-400" />
  Nappes
</button>

<button
  onClick={() => setShowSandre(v => !v)}
  aria-pressed={showSandre}
  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
    showSandre
      ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
      : 'bg-bg-card/80 border-white/10 text-text-secondary hover:text-text-primary'
  }`}
>
  <div className="w-2 h-2 rounded-full bg-blue-400" />
  Bassins
</button>
```

**Step 7 : Passer les nouveaux props à `ObservatoryMap`**

```tsx
<ObservatoryMap
  features={filteredFeatures}
  showPiezo={showPiezo}
  showHydro={showHydro}
  onStationClick={handleStationClick}
  onDeptClick={handleDeptClick}
  activeCodeDepartement={filters.codeDepartement}
  showBdlisa={showBdlisa}
  showSandre={showSandre}
  onBdlisaClick={handleBdlisaClick}
  onBassinClick={handleBassinClick}
  activeCodeBdlisa={filters.codeBdlisa}
  activeCodeBassin={filters.codeBassin}
  era5Data={era5Data}
  era5Variable={era5Variable}
  showERA5={showERA5}
/>
```

**Step 8 : Vérifier TypeScript**
```bash
cd /e/hydro_dashboard/frontend && npx tsc --noEmit 2>&1 | head -30
```
Des erreurs TypeScript sur les props inconnues de ObservatoryMap sont attendues — elles seront résolues en Task 12.

**Step 9 : Commit**
```bash
git add frontend/src/pages/ObservatoryPage.tsx
git commit -m "feat: add BDLISA/SANDRE toggles and client-side filtering in ObservatoryPage"
```

---

### Task 12 : Couches BDLISA + SANDRE dans ObservatoryMap

**Context:** Ajouter les layers MapLibre pour les nappes BDLISA (filtrage piézo) et les bassins SANDRE (filtrage hydro). Les layers sont visibles uniquement quand les toggles correspondants sont activés.

**Files:**
- Modify: `frontend/src/components/map/ObservatoryMap.tsx`

**Step 1 : Lire le fichier actuel**

**Step 2 : Étendre l'interface Props**

Ajouter aux props existantes :
```typescript
interface Props {
  // ... props existantes ...
  showBdlisa?: boolean
  showSandre?: boolean
  onBdlisaClick?: (code: string | null) => void
  onBassinClick?: (code: string | null) => void
  activeCodeBdlisa?: string
  activeCodeBassin?: string
}
```

Et dans la déstructuration de la fonction :
```typescript
export function ObservatoryMap({
  // ... props existantes ...
  showBdlisa = false,
  showSandre = false,
  onBdlisaClick,
  onBassinClick,
  activeCodeBdlisa,
  activeCodeBassin,
}: Props) {
```

**Step 3 : Ajouter les refs pour les nouveaux callbacks**

```typescript
const onBdlisaClickRef = useRef(onBdlisaClick)
onBdlisaClickRef.current = onBdlisaClick

const onBassinClickRef = useRef(onBassinClick)
onBassinClickRef.current = onBassinClick

const activeCodeBdlisaRef = useRef(activeCodeBdlisa)
activeCodeBdlisaRef.current = activeCodeBdlisa

const activeCodeBassinRef = useRef(activeCodeBassin)
activeCodeBassinRef.current = activeCodeBassin
```

**Step 4 : Ajouter les constantes de couleur BDLISA**

Ajouter avant le composant (niveau fichier) :
```typescript
// Couleurs par type de nappe — ajuster selon les valeurs réelles de NatureUH dans bdlisa.geojson
const BDLISA_NATURE_COLORS: Record<string, string> = {
  'Domaine sédimentaire': '#22d3ee',   // cyan
  'Socle': '#a78bfa',                  // violet
  'Karstique': '#34d399',              // vert
  'Alluvions': '#60a5fa',              // bleu
  'Volcanique': '#f97316',             // orange
  'default': '#94a3b8',               // gris
}

const SANDRE_DISTRICT_COLORS: Record<string, string> = {
  '01': '#f59e0b', // Artois-Picardie — ambre
  '02': '#f97316', // Rhin-Meuse — orange
  '03': '#3b82f6', // Seine-Normandie — bleu
  '04': '#22c55e', // Loire-Bretagne — vert
  '05': '#ef4444', // Adour-Garonne — rouge
  '06': '#8b5cf6', // Rhône-Méditerranée — violet
  '07': '#ec4899', // Corse — rose
}
```

> **Note :** Les clés des couleurs BDLISA doivent correspondre aux valeurs réelles du champ nature dans `bdlisa.geojson` (Task 10 Step 4). Adapter si nécessaire.

**Step 5 : Ajouter le chargement des layers BDLISA dans `map.on('load', ...)`**

Ajouter AVANT `addClusteredSource('piezo-stations', ...)` et APRÈS les layers depts :

```typescript
// --- BDLISA nappes ---
fetch('/geo/bdlisa.geojson')
  .then(r => r.json())
  .then(data => {
    if (map.getSource('bdlisa')) return
    // Détecter les noms de propriétés (adapter si nécessaire après Task 10)
    const codeProp = 'code'   // TODO: vérifier le nom exact de la propriété code
    const nomProp = 'nom'     // TODO: vérifier le nom exact de la propriété nom
    const natureProp = 'nature' // TODO: vérifier le nom exact (NatureUH, NATURE, etc.)

    map.addSource('bdlisa', { type: 'geojson', data, generateId: true })

    // Couleur dynamique par nature de nappe
    const colorExpr: maplibregl.ExpressionSpecification = [
      'match',
      ['get', natureProp],
      ...Object.entries(BDLISA_NATURE_COLORS).flatMap(([k, v]) => k === 'default' ? [] : [k, v]),
      BDLISA_NATURE_COLORS['default'],
    ]

    map.addLayer({
      id: 'bdlisa-fill',
      type: 'fill',
      source: 'bdlisa',
      layout: { visibility: 'none' },
      paint: {
        'fill-color': colorExpr,
        'fill-opacity': [
          'case',
          ['==', ['get', codeProp], activeCodeBdlisaRef.current ?? '$$NONE$$'], 0.35,
          ['boolean', ['feature-state', 'hover'], false], 0.20,
          0.10,
        ],
      },
    })
    map.addLayer({
      id: 'bdlisa-line',
      type: 'line',
      source: 'bdlisa',
      layout: { visibility: 'none' },
      paint: {
        'line-color': 'rgba(255,255,255,0.3)',
        'line-width': 0.8,
      },
    })

    // Hover BDLISA
    let hoveredBdlisaId: number | null = null
    map.on('mousemove', 'bdlisa-fill', (e) => {
      if (!e.features?.length) return
      const feat = e.features[0]
      if (hoveredBdlisaId !== null) map.setFeatureState({ source: 'bdlisa', id: hoveredBdlisaId }, { hover: false })
      hoveredBdlisaId = feat.id as number
      map.setFeatureState({ source: 'bdlisa', id: hoveredBdlisaId }, { hover: true })
      const nom = feat.properties?.[nomProp] ?? ''
      const nature = feat.properties?.[natureProp] ?? ''
      setTooltip({ name: `${nom}${nature ? ` · ${nature}` : ''}`, x: e.point.x, y: e.point.y })
    })
    map.on('mouseleave', 'bdlisa-fill', () => {
      if (hoveredBdlisaId !== null) map.setFeatureState({ source: 'bdlisa', id: hoveredBdlisaId }, { hover: false })
      hoveredBdlisaId = null
      setTooltip(null)
    })

    // Clic BDLISA → filter piézo ou désélect
    map.on('click', 'bdlisa-fill', (e) => {
      const code = e.features?.[0]?.properties?.[codeProp] ?? null
      const current = activeCodeBdlisaRef.current
      onBdlisaClickRef.current?.(code === current ? null : code)
    })

    map.on('mouseenter', 'bdlisa-fill', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'bdlisa-fill', () => { map.getCanvas().style.cursor = '' })
  })

// --- SANDRE bassins hydrographiques ---
fetch('/geo/bassins.geojson')
  .then(r => r.json())
  .then(data => {
    if (map.getSource('bassins')) return
    // Détecter les noms de propriétés (adapter après Task 10)
    const cdBH = 'CdBH'   // TODO: vérifier le nom exact (CdBH, code, CODE_BH, etc.)
    const lbBH = 'LbBH'   // TODO: vérifier le nom exact (LbBH, nom, NOM_BH, etc.)

    map.addSource('bassins', { type: 'geojson', data, generateId: true })

    const districtColorExpr: maplibregl.ExpressionSpecification = [
      'match',
      ['get', cdBH],
      ...Object.entries(SANDRE_DISTRICT_COLORS).flatMap(([k, v]) => [k, v]),
      '#94a3b8',
    ]

    map.addLayer({
      id: 'bassins-fill',
      type: 'fill',
      source: 'bassins',
      layout: { visibility: 'none' },
      paint: {
        'fill-color': districtColorExpr,
        'fill-opacity': [
          'case',
          ['==', ['get', cdBH], activeCodeBassinRef.current ?? '$$NONE$$'], 0.30,
          ['boolean', ['feature-state', 'hover'], false], 0.18,
          0.08,
        ],
      },
    })
    map.addLayer({
      id: 'bassins-line',
      type: 'line',
      source: 'bassins',
      layout: { visibility: 'none' },
      paint: {
        'line-color': districtColorExpr,
        'line-width': 1.5,
        'line-opacity': 0.6,
      },
    })

    // Hover bassins
    let hoveredBassinId: number | null = null
    map.on('mousemove', 'bassins-fill', (e) => {
      if (!e.features?.length) return
      const feat = e.features[0]
      if (hoveredBassinId !== null) map.setFeatureState({ source: 'bassins', id: hoveredBassinId }, { hover: false })
      hoveredBassinId = feat.id as number
      map.setFeatureState({ source: 'bassins', id: hoveredBassinId }, { hover: true })
      setTooltip({ name: feat.properties?.[lbBH] ?? feat.properties?.[cdBH] ?? '', x: e.point.x, y: e.point.y })
    })
    map.on('mouseleave', 'bassins-fill', () => {
      if (hoveredBassinId !== null) map.setFeatureState({ source: 'bassins', id: hoveredBassinId }, { hover: false })
      hoveredBassinId = null
      setTooltip(null)
    })

    // Clic bassin → filter hydro ou désélect
    map.on('click', 'bassins-fill', (e) => {
      const code = e.features?.[0]?.properties?.[cdBH] ?? null
      const current = activeCodeBassinRef.current
      onBassinClickRef.current?.(code === current ? null : code)
    })

    map.on('mouseenter', 'bassins-fill', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'bassins-fill', () => { map.getCanvas().style.cursor = '' })
  })
```

**Step 6 : Ajouter les `useEffect` pour show/hide BDLISA et SANDRE**

```typescript
useEffect(() => {
  if (!mapRef.current || !mapLoadedRef.current) return
  const map = mapRef.current
  const visibility = showBdlisa ? 'visible' : 'none'
  if (map.getLayer('bdlisa-fill')) map.setLayoutProperty('bdlisa-fill', 'visibility', visibility)
  if (map.getLayer('bdlisa-line')) map.setLayoutProperty('bdlisa-line', 'visibility', visibility)
}, [showBdlisa])

useEffect(() => {
  if (!mapRef.current || !mapLoadedRef.current) return
  const map = mapRef.current
  const visibility = showSandre ? 'visible' : 'none'
  if (map.getLayer('bassins-fill')) map.setLayoutProperty('bassins-fill', 'visibility', visibility)
  if (map.getLayer('bassins-line')) map.setLayoutProperty('bassins-line', 'visibility', visibility)
}, [showSandre])
```

**Step 7 : Ajouter les `useEffect` pour mettre à jour l'highlight actif**

```typescript
useEffect(() => {
  activeCodeBdlisaRef.current = activeCodeBdlisa
  if (!mapRef.current || !mapLoadedRef.current) return
  const map = mapRef.current
  if (!map.getLayer('bdlisa-fill')) return
  map.setPaintProperty('bdlisa-fill', 'fill-opacity', [
    'case',
    ['==', ['get', 'code'], activeCodeBdlisa ?? '$$NONE$$'], 0.35,
    ['boolean', ['feature-state', 'hover'], false], 0.20,
    0.10,
  ])
}, [activeCodeBdlisa])

useEffect(() => {
  activeCodeBassinRef.current = activeCodeBassin
  if (!mapRef.current || !mapLoadedRef.current) return
  const map = mapRef.current
  if (!map.getLayer('bassins-fill')) return
  map.setPaintProperty('bassins-fill', 'fill-opacity', [
    'case',
    ['==', ['get', 'CdBH'], activeCodeBassin ?? '$$NONE$$'], 0.30,  // adapter nom prop si nécessaire
    ['boolean', ['feature-state', 'hover'], false], 0.18,
    0.08,
  ])
}, [activeCodeBassin])
```

**Step 8 : Vérifier TypeScript**
```bash
cd /e/hydro_dashboard/frontend && npx tsc --noEmit 2>&1 | head -30
```

**Step 9 : Tester dans le navigateur**

1. Cliquer le bouton "Nappes" → les polygones BDLISA apparaissent en couleurs
2. Hover sur une nappe → tooltip avec le nom de l'aquifère
3. Clic sur une nappe → les stations piézo se filtrent à cette nappe, le polygone se met en évidence
4. Clic sur la même nappe → désélectionne
5. Cliquer "Bassins" → les polygones SANDRE apparaissent en couleurs par district
6. Clic sur un bassin → les hydros se filtrent au district correspondant
7. Les deux layers peuvent être actifs simultanément

**Step 10 : Commit**
```bash
git add frontend/src/components/map/ObservatoryMap.tsx
git commit -m "feat: add BDLISA aquifer and SANDRE district layers with hover and click-to-filter"
```

---

### Task 13 : Info hydrogéologique dans StationPopup + StationPage piézo

**Context:** Charger `bdlisa.geojson` une fois via React Query et exposer un hook de lookup. Afficher la nappe correspondante dans le popup de station piézo et dans la page détail piézo.

**Files:**
- Modify: `frontend/src/hooks/useStations.ts`
- Modify: `frontend/src/components/map/StationPopup.tsx`
- Modify: `frontend/src/pages/StationPage.tsx` (section piézo uniquement)

**Step 1 : Ajouter `useBdlisaLookup` dans `useStations.ts`**

```typescript
// Charge le GeoJSON BDLISA N2 une seule fois (staleTime: Infinity)
// Retourne une fonction de lookup qui prend un codes_bdlisa de station et retourne les props BDLISA N2
export function useBdlisaLookup() {
  const { data } = useQuery({
    queryKey: ['bdlisa-geojson'],
    queryFn: () => fetch('/geo/bdlisa.geojson').then(r => r.json() as Promise<{ features: any[] }>),
    staleTime: Infinity,
  })

  const lookup = useCallback((codesBdlisa: string | null | undefined): { nom: string; nature: string } | null => {
    if (!codesBdlisa || !data?.features?.length) return null
    // codes_bdlisa peut être un seul code ou plusieurs séparés par des virgules
    const codes = codesBdlisa.split(',').map(s => s.trim()).filter(Boolean)
    for (const code of codes) {
      // Chercher la feature BDLISA N2 dont le code est un préfixe du code station
      const feat = data.features.find(f => {
        const fCode: string = f.properties?.code ?? f.properties?.Code ?? ''
        return fCode && code.startsWith(fCode) && fCode.length >= 3
      })
      if (feat) {
        const nom: string = feat.properties?.nom ?? feat.properties?.Nom ?? feat.properties?.NOM ?? ''
        const nature: string = feat.properties?.nature ?? feat.properties?.NatureUH ?? feat.properties?.NATURE ?? ''
        return { nom, nature }
      }
    }
    return null
  }, [data])

  return lookup
}
```

> **Note :** Les noms de propriétés (`code`, `nom`, `nature`) doivent correspondre à ceux trouvés en Task 10. Adapter si nécessaire.

**Step 2 : Importer et utiliser `useBdlisaLookup` dans `StationPopup.tsx`**

Dans le composant `StationPopup` :
```typescript
import { usePiezoStationDetail, useHydroStationDetail, useBdlisaLookup } from '../../hooks/useStations'

export function StationPopup({ code, type, onClose }: Props) {
  const isPiezo = type === 'piezo'
  const { data: station, isLoading } = isPiezo
    ? usePiezoStationDetail(code)
    : useHydroStationDetail(code)
  const bdlisaLookup = useBdlisaLookup()

  if (isLoading || !station) return <PopupSkeleton onClose={onClose} />

  // ... code existant ...

  const bdlisa = isPiezo ? bdlisaLookup((station as any).codes_bdlisa) : null

  return (
    // ... JSX existant ...
    // Ajouter APRÈS le bloc percentile, AVANT le lien "Voir les détails" :
    {bdlisa && (
      <div className="mt-1 pt-2 border-t border-white/10 text-xs text-gray-400">
        <p className="flex items-center gap-1">
          <span className="text-gray-500">Nappe :</span>
          <span className="text-gray-200">{bdlisa.nom}</span>
        </p>
        {bdlisa.nature && (
          <p className="flex items-center gap-1 mt-0.5">
            <span className="text-gray-500">Type :</span>
            <span className="text-gray-200">{bdlisa.nature}</span>
          </p>
        )}
      </div>
    )}
    // ...
  )
}
```

**Step 3 : Lire la section piézo de `StationPage.tsx`**

Lire `frontend/src/pages/StationPage.tsx` pour trouver la section piézo et l'endroit où ajouter le bloc hydrogéologique.

**Step 4 : Ajouter une section Hydrogéologie dans `StationPage.tsx` (piézo)**

Dans la page de détail piézo, après la section métadonnées existantes (département, commune, altimétrie) et avant les graphiques :

```tsx
// Importer le hook en tête du fichier
import { useBdlisaLookup } from '../hooks/useStations'

// Dans le composant, section piézo
const bdlisaLookup = useBdlisaLookup()
const bdlisaInfo = type === 'piezo' && station
  ? bdlisaLookup((station as PiezoStation).codes_bdlisa)
  : null

// Dans le JSX, après les méta stations
{bdlisaInfo && (
  <div className="bg-bg-card border border-white/10 rounded-xl p-4 mb-4">
    <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
      <span className="text-emerald-400">◈</span>
      Hydrogéologie
    </h3>
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <div>
        <p className="text-xs text-text-secondary">Nappe</p>
        <p className="text-text-primary font-medium">{bdlisaInfo.nom}</p>
      </div>
      {bdlisaInfo.nature && (
        <div>
          <p className="text-xs text-text-secondary">Type</p>
          <p className="text-text-primary font-medium">{bdlisaInfo.nature}</p>
        </div>
      )}
      {(station as PiezoStation).codes_bdlisa && (
        <div className="col-span-2">
          <p className="text-xs text-text-secondary">Code BDLISA</p>
          <p className="text-text-primary font-mono text-xs">{(station as PiezoStation).codes_bdlisa}</p>
        </div>
      )}
    </div>
  </div>
)}
```

**Step 5 : Vérifier TypeScript**
```bash
cd /e/hydro_dashboard/frontend && npx tsc --noEmit 2>&1 | head -30
```

**Step 6 : Tester dans le navigateur**

1. Activer le layer "Nappes"
2. Cliquer sur une station piézo → le popup affiche le nom de la nappe + son type
3. Cliquer "Voir les détails" → la page détail piézo affiche la section "Hydrogéologie"
4. Tester avec une station hydro → aucune info BDLISA ne s'affiche (normal)

**Step 7 : Commit**
```bash
git add frontend/src/hooks/useStations.ts \
        frontend/src/components/map/StationPopup.tsx \
        frontend/src/pages/StationPage.tsx
git commit -m "feat: add BDLISA hydrogeological info in StationPopup and StationPage"
```

---

### Task 14 : Push final

**Step 1 : Vérifier que tout compile**
```bash
cd /e/hydro_dashboard/frontend && npx tsc --noEmit
```

**Step 2 : Vérifier les erreurs console dans le navigateur**

**Step 3 : Push vers GitLab**
```bash
cd /e/hydro_dashboard && git push origin master
```
