# Design — Contextualisation des niveaux piézométriques et hydrométriques

**Date :** 2026-03-03
**Statut :** Approuvé

## Contexte

Les valeurs brutes en m NGF (piézométrie) ou m³/s (hydrométrie) sont difficiles à interpréter sans contexte historique. Un niveau de 45 m NGF peut être normal sur une station et catastrophique sur une autre. Le système de classification (TRES_BAS → TRES_HAUT) est déjà calculé via des percentiles par station, mais ces seuils ne sont pas exposés dans l'UI.

**Objectif :** Ajouter deux améliorations visuelles sur la page de détail d'une station :
1. Bandes colorées de contexte historique sur le graphe temporel
2. Nouveau graphique d'évolution du rang centile annuel

## Architecture

### Backend — 2 nouveaux endpoints

**`GET /api/v1/stations/piezo/{code_bss}/percentiles`**

```sql
SELECT
  PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY niveau_nappe_eau) AS p10,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY niveau_nappe_eau) AS p25,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY niveau_nappe_eau) AS p75,
  PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY niveau_nappe_eau) AS p90
FROM gold.hubeau_daily_chroniques
WHERE code_bss = :code
  AND niveau_nappe_eau IS NOT NULL
```

**`GET /api/v1/stations/hydro/{code_station}/percentiles`**

```sql
SELECT
  PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY resultat_obs_elab) AS p10,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY resultat_obs_elab) AS p25,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY resultat_obs_elab) AS p75,
  PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY resultat_obs_elab) AS p90
FROM gold.hydro_daily_chroniques
WHERE code_station = :code
  AND resultat_obs_elab IS NOT NULL
```

**Réponse :** `{ p10: float, p25: float, p75: float, p90: float }`
**Cache Redis :** TTL 86400s (24h) — ces seuils changent très peu dans le temps.
**Fichier :** `backend/app/routers/stations.py`
**Modèle Pydantic :** `StationPercentiles` dans `backend/app/models/station.py`

---

### Frontend

#### `frontend/src/lib/types.ts`

Ajouter l'interface :
```typescript
export interface StationPercentiles {
  p10: number
  p25: number
  p75: number
  p90: number
}
```

#### `frontend/src/lib/api.ts`

Ajouter dans l'objet `api.stations` :
```typescript
piezoPercentiles: (code: string) =>
  fetchJson<StationPercentiles>(`/stations/piezo/${encodeURIComponent(code)}/percentiles`),
hydroPercentiles: (code: string) =>
  fetchJson<StationPercentiles>(`/stations/hydro/${encodeURIComponent(code)}/percentiles`),
```

#### `frontend/src/components/charts/TimeseriesChart.tsx`

Ajouter prop optionnel :
```typescript
percentiles?: StationPercentiles | null
```

Ajouter 5 `ReferenceArea` dans le `ComposedChart`, en arrière-plan de la courbe :

| Zone       | Plage       | Couleur        |
|------------|-------------|----------------|
| Très bas   | −∞ → P10    | rouge pâle     |
| Bas        | P10 → P25   | orange pâle    |
| Normal     | P25 → P75   | vert pâle      |
| Haut       | P75 → P90   | bleu pâle      |
| Très haut  | P90 → +∞    | indigo pâle    |

Petite légende horizontale en bas du graphe, visible seulement si `percentiles` est fourni.

#### `frontend/src/components/charts/PercentileChart.tsx` (nouveau fichier)

Composant graphique en barres :
- **Y-axis :** 0–100 (centile historique)
- **X-axis :** années (string)
- **Données :** `percentile_niveau_historique` (piezo) ou `percentile_resultat_historique` (hydro)
- **Fond :** 5 `ReferenceArea` (mêmes couleurs que ci-dessus) en arrière-plan
- **Barres :** colorées dynamiquement selon la zone de leur valeur
- **Tooltip :** "2022 : 34e centile — Bas"
- **Hauteur :** 200px, responsive

#### `frontend/src/pages/StationPage.tsx`

1. Ajouter `useQuery` pour l'endpoint percentiles (clé : `['percentiles', type, code]`)
2. Passer `percentiles` au `<TimeseriesChart />`
3. Afficher `<PercentileChart />` après le `<TimeseriesChart />`, dans une section titrée "Rang centile historique annuel", avec les données yearly existantes

## Zones de couleur (cohérence avec ClassificationBadge)

| Classification | Plage centile | Couleur Tailwind          |
|----------------|---------------|---------------------------|
| TRES_BAS       | < P10         | `red-500/10` fill         |
| BAS            | P10–P25       | `orange-400/10` fill      |
| NORMAL         | P25–P75       | `emerald-500/10` fill     |
| HAUT           | P75–P90       | `blue-400/10` fill        |
| TRES_HAUT      | > P90         | `indigo-400/10` fill      |

## Fichiers à modifier / créer

| Fichier | Action |
|---------|--------|
| `backend/app/routers/stations.py` | Ajouter 2 endpoints |
| `backend/app/models/station.py` | Ajouter modèle `StationPercentiles` |
| `frontend/src/lib/types.ts` | Ajouter interface `StationPercentiles` |
| `frontend/src/lib/api.ts` | Ajouter 2 fonctions |
| `frontend/src/components/charts/TimeseriesChart.tsx` | Ajouter prop + ReferenceArea |
| `frontend/src/components/charts/PercentileChart.tsx` | Créer composant (nouveau) |
| `frontend/src/pages/StationPage.tsx` | useQuery + passer percentiles + ajouter PercentileChart |
