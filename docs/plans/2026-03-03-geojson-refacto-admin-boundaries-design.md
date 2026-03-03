# Design — Refactoring GeoJSON + Couches administratives + Redis

**Date :** 2026-03-03
**Statut :** Approuvé

## Objectifs

1. **Redis** : démarrer un container dédié sur port 6380, configurer le backend
2. **Refactoring GeoJSON** : remplacer les appels liste (26 MB) par `/stations/geojson` (5 MB) pour la carte
3. **Couches administratives** : régions + départements interactifs sur la carte (hover + clic)

---

## Architecture globale après refactoring

```
ObservatoryPage
  ├── useStationsGeoJSON()         ← /stations/geojson (~5 MB, une fois)
  ├── useQuery(nationalStats)      ← /stats/national (KPIBar)
  │
  ├── <ObservatoryMap features={filteredFeatures} />    ← MapLibre clustered sources
  ├── <SearchBar features={allFeatures} />              ← filtre client-side
  └── <StationPopup code={} type={} />                  ← fetchs propre détail
```

**Filtrage client-side** dans `ObservatoryPage` :
```typescript
const filteredFeatures = useMemo(() => {
  return (geojsonData?.features ?? []).filter(f => {
    if (filters.codeDepartement && f.properties.code_departement !== filters.codeDepartement) return false
    if (filters.classification?.length && !filters.classification.includes(f.properties.classification)) return false
    return true
  })
}, [geojsonData, filters])
```

> `min_observations` et `last_measurement_after` ne s'appliquent plus à la carte (non présents dans GeoJSON) — ces filtres restent dans la barre pour cohérence mais n'affectent que la vue liste des autres pages.

---

## Task 0 : Redis

- `docker run -d --name hydro-redis -p 6380:6379 redis:7-alpine`
- `.env` : `REDIS_URL=redis://127.0.0.1:6380/0`
- Tuer et relancer le backend
- Vérifier avec `docker exec hydro-redis redis-cli ping`

---

## Task 1 : StationPopup — self-fetch

**Fichier :** `frontend/src/components/map/StationPopup.tsx`

**Props avant :**
```typescript
{ station: any; type: 'piezo' | 'hydro'; onClose: () => void }
```

**Props après :**
```typescript
{ code: string; type: 'piezo' | 'hydro'; onClose: () => void }
```

Le composant utilise `usePiezoStationDetail(code)` ou `useHydroStationDetail(code)` en interne.
Pendant le chargement : skeleton avec `animate-pulse` (4 lignes).
Toute la logique d'affichage existante (classification, value, période, percentile, lien détail) est conservée.

---

## Task 2 : Types + API + Hook GeoJSON

### `frontend/src/lib/types.ts`
```typescript
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

### `frontend/src/lib/api.ts`
```typescript
geojson: (stationType?: 'piezo' | 'hydro' | 'all') =>
  fetchJson<StationGeoJSON>('/stations/geojson', stationType ? { type: stationType } : undefined),
```

### `frontend/src/hooks/useStations.ts`
```typescript
export function useStationsGeoJSON() {
  return useQuery({
    queryKey: ['stations', 'geojson'],
    queryFn: () => api.stations.geojson(),
    staleTime: 3600_000, // 1h
  })
}
```

---

## Task 3 : ObservatoryPage — useStationsGeoJSON

**Fichier :** `frontend/src/pages/ObservatoryPage.tsx`

- Remplacer `usePiezoStations` + `useHydroStations` par `useStationsGeoJSON()`
- Calculer `filteredFeatures` (client-side, voir architecture ci-dessus)
- `selectedStation` : `{ code: string; type: 'piezo' | 'hydro' } | null`
- `handleStationClick(code, type)` → `setSelectedStation({ code, type })`
- `handleDeptClick(code: string | null)` → `setFilter('dept', code ?? undefined)` (depuis la carte)
- Passer `filteredFeatures` à `<ObservatoryMap>` et `<SearchBar>`
- Supprimer `freshness` (champ non présent dans GeoJSON) — l'indicateur "Dernière MAJ" est supprimé
- `<StationPopup code={selectedStation.code} type={selectedStation.type} />`

---

## Task 4 : ObservatoryMap — GeoJSON features en props

**Fichier :** `frontend/src/components/map/ObservatoryMap.tsx`

**Props avant :**
```typescript
piezoStations?: any[]
hydroStations?: any[]
onStationClick?: (station: any, type: 'piezo' | 'hydro') => void
```

**Props après :**
```typescript
features?: StationGeoJSONFeature[]
onStationClick?: (code: string, type: 'piezo' | 'hydro') => void
onDeptClick?: (code: string | null) => void  // pour clic département
```

Changements internes :
- `stationsToGeoJSON` est supprimée — les features sont déjà en GeoJSON
- Split interne : `piezoFeatures = features.filter(f => f.properties.type === 'piezo')` → reconstruire un FeatureCollection
- `piezoMapRef` / `hydroMapRef` supprimés (lookup plus nécessaire)
- `updateSource` met à jour les sources MapLibre depuis les features filtrées
- Sur clic station : `onStationClick(code, type)` directement depuis `properties`
- `MapLegend` : compte piezo/hydro depuis les features

---

## Task 5 : SearchBar — GeoJSON features

**Fichier :** `frontend/src/components/map/SearchBar.tsx`

**Props avant :**
```typescript
piezoStations?: any[]
hydroStations?: any[]
onSelect: (station: any, type: 'piezo' | 'hydro') => void
```

**Props après :**
```typescript
features?: StationGeoJSONFeature[]
onSelect: (code: string, type: 'piezo' | 'hydro') => void
```

Recherche sur `properties.commune` (remplace `nom_commune`/`libelle_station`) et `properties.code`.
Affichage : `commune · departement · code`. Badge PIEZO/HYDRO conservé.

---

## Task 6 : Télécharger boundary GeoJSON

Source : https://github.com/gregoiredavid/france-geojson (domaine public)

```
frontend/public/geo/regions.geojson      (~200 KB)
frontend/public/geo/departments.geojson  (~500 KB)
```

Propriétés :
- Régions : `code` (ex. "84"), `nom`
- Départements : `code` (ex. "01", "13", "75"), `nom` ← correspond à `code_departement` dans les données stations

Téléchargés avec `curl` ou `Invoke-WebRequest`, pas de CDN runtime.

---

## Task 7 : Admin boundary layers dans ObservatoryMap

**Fichier :** `frontend/src/components/map/ObservatoryMap.tsx`

### Sources et layers
```
regions-fill  (maxzoom: 7, fill transparent + hover highlight)
regions-line  (maxzoom: 7, stroke blanc/10)
depts-fill    (minzoom: 7, fill transparent + hover highlight + active dept)
depts-line    (minzoom: 7, stroke blanc/10)
```

### Hover
- `mousemove` sur `*-fill` layers → stocker `hoveredId`, appliquer feature-state `hover: true`
- Layer paint : `['case', ['boolean', ['feature-state', 'hover'], false], 0.12, 0]` pour le fill opacity

### Tooltip nom
- `<div>` React positionné en absolu, state `tooltip: { name: string; x: number; y: number } | null`
- Alimenté par `map.on('mousemove', ...)` avec `e.point` et `feature.properties.nom`
- Caché sur `mouseleave`

### Active département
- Fill avec `code_departement === activeCodeDepartement` → opacity 0.15 (accent-cyan)
- Via feature-state `active: true` sur la feature du département cliqué

### Clic région → zoom
```typescript
map.on('click', 'regions-fill', (e) => {
  const feature = e.features?.[0]
  if (!feature) return
  const bbox = computeBbox(feature.geometry) // [minLon, minLat, maxLon, maxLat]
  map.fitBounds(bbox as LngLatBoundsLike, { padding: 60, duration: 500 })
})
```

### Clic département → filter
```typescript
map.on('click', 'depts-fill', (e) => {
  const code = e.features?.[0]?.properties?.code
  onDeptClickRef.current?.(code ?? null)
})
```

Clic sur le département déjà actif → `onDeptClick(null)` pour désactiver le filtre.

### Ordre des layers
Boundary layers insérés AVANT les couches station (pour ne pas couvrir les clusters).
```
era5-heat → regions-fill → regions-line → depts-fill → depts-line → piezo-* → hydro-*
```

---

## Fichiers modifiés / créés

| Fichier | Action |
|---------|--------|
| `.env` | `REDIS_URL=redis://127.0.0.1:6380/0` |
| `frontend/src/lib/types.ts` | Ajouter interfaces GeoJSON |
| `frontend/src/lib/api.ts` | Ajouter `stations.geojson()` |
| `frontend/src/hooks/useStations.ts` | Ajouter `useStationsGeoJSON()` |
| `frontend/src/pages/ObservatoryPage.tsx` | Refactoring complet |
| `frontend/src/components/map/ObservatoryMap.tsx` | Nouvelles props + boundary layers |
| `frontend/src/components/map/StationPopup.tsx` | Self-fetch via code+type |
| `frontend/src/components/map/SearchBar.tsx` | Nouvelles props GeoJSON |
| `frontend/public/geo/regions.geojson` | Créer (download) |
| `frontend/public/geo/departments.geojson` | Créer (download) |
