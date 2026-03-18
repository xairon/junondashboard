# Architecture — Observatoire Hydrologique France

Ce document décrit l'architecture technique, les patterns utilisés et les décisions de conception.

---

## Vue d'Ensemble du Système

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT (Navigateur)                       │
│                                                                  │
│   React 19 · TypeScript 5.9 · MapLibre GL · Recharts            │
│   TanStack Query v5 · React Router 7 · Tailwind CSS 4           │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTP sur le port 80
                               │
┌──────────────────────────────▼───────────────────────────────────┐
│                     NGINX REVERSE PROXY                          │
│                                                                  │
│   • Gzip compression (niveau 5)                                  │
│   • Rate limiting : 30 req/s API, 60 req/s general              │
│   • 20 connexions simultanées max par IP                         │
│   • En-têtes de sécurité (CSP, X-Frame-Options, etc.)           │
│   • Proxy /api/ → backend:8000                                   │
│   • Proxy /    → frontend:80 (Nginx servant le build React)     │
└──────────────┬───────────────────────────────────────────────────┘
               │
     ┌─────────┴──────────┐
     │                    │
┌────▼────────┐   ┌───────▼──────────────────────────────────────┐
│  Frontend   │   │           BACKEND FastAPI                     │
│  Nginx      │   │                                               │
│  (build     │   │   • Uvicorn (ASGI, workers auto)             │
│  React SPA) │   │   • Middleware CORS (origines configurables) │
│             │   │   • Sérialisation orjson (FastJSONResponse)  │
│   Port 80   │   │   • SQLAlchemy 2.0 async + asyncpg           │
│  (interne)  │   │   • Redis cache-aside (redis-py async)       │
└─────────────┘   │   • Indices sécheresse (SPLI/SSFI/SPI)      │
                  │   • Classification batch + fiabilité          │
                  └───────────────────┬───────────────────────────┘
                                     │
                        ┌────────────┴──────────────┐
                        │                           │
               ┌────────▼────────┐       ┌──────────▼──────────┐
               │   PostgreSQL    │       │      Redis 7         │
               │   (schéma gold) │       │   256 MB · LRU       │
               │                 │       │   allkeys-lru        │
               │   Mesures       │       │                      │
               │   Agrégats      │       │   TTL par endpoint   │
               │   Métadonnées   │       │   1h / 6h / 12h / 24h│
               └─────────────────┘       └──────────────────────┘
```

---

## Architecture Backend (FastAPI)

### Structure des Modules

```
app/
├── main.py              # Point d'entrée : création de l'app, middleware, lifespan
├── config.py            # Settings Pydantic-settings (lecture .env + env vars)
├── database.py          # Moteur SQLAlchemy async + session factory
├── cache.py             # Helpers Redis (get_redis, cache_key, cached, cached_response)
├── json_response.py     # FastJSONResponse : wrapper orjson pour FastAPI
├── drought.py           # Calcul des indices de sécheresse (SPLI, SSFI, SPI)
├── classification.py    # Classification batch + fiabilité — cache Redis au startup
├── models/              # Modèles Pydantic de validation de réponse
│   ├── station.py       # PiezoStationDetail, HydroStationDetail, StationPercentiles
│   ├── hydro.py         # Schémas spécifiques hydro
│   ├── timeseries.py    # Schémas séries temporelles
│   └── era5.py          # Schémas ERA5
└── routers/             # Handlers de routes (1 router = 1 domaine métier)
    ├── piezo.py         # /api/v1/piezo/ — stations, timeseries, trends, SPLI, SPI
    ├── hydro.py         # /api/v1/hydro/ — stations, timeseries, trends, SSFI, SPI
    ├── common.py        # /api/v1/common/ — GeoJSON, alertes, stats, timeline classifications
    ├── era5.py          # /api/v1/era5/ — données climatiques ERA5
    ├── wfs.py           # /api/v1/wfs/ — proxy WFS SANDRE
    └── bdlisa.py        # /api/v1/bdlisa/ — entités hydrogéologiques (fichiers statiques)
```

### Lifespan et Startup

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Vérification Redis
    r = get_redis()
    if r is not None:
        await r.ping()
    # 2. Pré-chauffage WFS (8 calques SANDRE en cache Redis)
    asyncio.create_task(wfs.warm_wfs_cache())
    # 3. Calcul batch des classifications + fiabilité (~23k stations)
    asyncio.create_task(warm_classification_cache())
    yield
    # Shutdown
    await redis_pool.aclose()
    await engine.dispose()
```

Le calcul de classification au startup :
1. Charge les séries mensuelles de toutes les stations depuis la DB
2. Calcule le SPLI (piézo) ou SSFI (hydro) du dernier mois pour chaque station
3. Convertit en classe (7 seuils Météo-France)
4. Calcule le niveau de fiabilité (comptage d'années distinctes avec >= 6 mois de données)
5. Stocke le lookup dans Redis (`hydro:classifications:current`, TTL 24h)

### Indices de Sécheresse (`drought.py`)

Trois indices standardisés calculés à la demande ou en batch :

| Indice | Fonction | Méthode | Usage |
|---|---|---|---|
| **SPLI (IPS)** | `compute_spli()` | KDE (estimation par noyau) par mois calendaire | Stations piézométriques |
| **SSFI** | `compute_ssfi()` | Distribution gamma par mois calendaire | Stations hydrométriques |
| **SPI** | `compute_spi()` | Distribution gamma par mois calendaire | Précipitations (toutes stations) |

Fonctions optimisées pour le batch :
- `classify_latest_spli()` — calcul single-value SPLI pour la classification batch
- `classify_latest_ssfi()` — idem pour SSFI

Les calculs CPU-bound (KDE, fitting gamma) sont exécutés dans un thread pool via `asyncio.run_in_executor()` pour ne pas bloquer la boucle événements.

### Classification Batch (`classification.py`)

```
Startup
   │
   ▼
warm_classification_cache()
   │
   ├── Charge toutes les séries mensuelles (piézo + hydro)
   │   via des sessions DB indépendantes (async_session())
   │
   ├── Pour chaque station :
   │   ├── Calcule l'indice du dernier mois (SPLI ou SSFI)
   │   ├── Convertit en classe (7 seuils)
   │   └── Calcule la fiabilité (nb années >= 6 mois)
   │
   └── Stocke dans Redis :
       ├── "hydro:classifications:current" → {"piezo": {code: class}, "hydro": {code: class}, "reliability": {code: level}}
       └── TTL: 24 heures
```

Le lookup est consommé par `get_classification_lookup()` dans les routers (GeoJSON, alertes, stats, détail, listes).

### Stratégie de Cache (Cache-Aside)

Deux helpers :

- **`cached(r, key, ttl, fetch_fn)`** — Retourne un objet Python désérialisé. Utilisé quand on manipule le résultat avant la réponse.
- **`cached_response(prefix, params, ttl, fetch_fn)`** — Retourne une `Response` HTTP brute. Stocke les bytes JSON directement pour éviter la double sérialisation. **Pattern préféré.**

Clés Redis : `hydro:<prefix>:<sha256_16chars>` (hash sur les paramètres JSON triés).

### TTL Redis par Type

| Type de données | TTL | Justification |
|---|---|---|
| Listes de stations / GeoJSON | 1h | Mise à jour quotidienne |
| Alertes | 1h | Fraîcheur opérationnelle |
| Séries journalières | 6h | Nouvelles mesures en fin de journée |
| Agrégats mensuels / Tendances | 12h | Recalcul nocturne |
| Annuels / Percentiles / ERA5 | 24h | Données stables |
| WFS SANDRE | 24h | Données de référence |
| Classifications | 24h | Batch au startup |
| Comparaison multi-stations | 30min | Requêtes variées |

### BDLISA (`bdlisa.py`)

Les entités hydrogéologiques sont servies depuis des fichiers JSON statiques dans `backend/data/bdlisa/` via `FileResponse`. Pas de proxy HTTP ni de cache Redis — les fichiers sont copiés dans l'image Docker (`COPY data/ data/`).

### Sérialisation orjson

`FastJSONResponse` remplace la réponse JSON standard de FastAPI. orjson est 2–3× plus rapide que `json.dumps` et gère nativement `datetime`, `date`, `Decimal`, `UUID`.

---

## Architecture Frontend (React)

### Arbre de Composants

```
App (main.tsx)
└── RouterProvider (routes.tsx)
    └── Layout (TopNav + Outlet)
        ├── ObservatoryPage (/)
        │   ├── ObservatoryMap (MapLibre GL impératif)
        │   │   ├── Stations piézo/hydro (clusters + excluded/grey)
        │   │   ├── Calques admin (régions, départements, bassins, HER)
        │   │   ├── Calques WFS SANDRE (zonage, Carthage, masses d'eau)
        │   │   ├── BDLISA (aquifères)
        │   │   └── Relief (hillshading, terrain AWS)
        │   ├── SearchBar (recherche universelle multi-catégories)
        │   ├── RightDrawer (données / filtres / calques)
        │   ├── StationDrawer (volet gauche au clic)
        │   ├── TimelineSlider (historique classifications mois par mois)
        │   └── KPIBar (compteurs piézo/hydro)
        ├── StationPage (/station/:type/:code)
        │   ├── StationKPICards
        │   ├── ClassificationBadge
        │   ├── TimeseriesChart (daily/monthly/yearly)
        │   ├── DroughtIndexChart (SPLI/SSFI/SPI — barres 7 classes)
        │   └── PercentileChart
        ├── AlertsPage (/alerts)
        │   └── Onglets par sévérité + historique consécutif
        ├── ComparePage (/compare)
        │   └── Multi-séries z-score normalisé (1–5 stations)
        └── AboutPage (/about)
```

### Flux de Données

```
URL search params (filtres)
    │
    ▼
useFilters() hook → sessionStorage persistence
    │
    ▼
Page Component (lazy loaded)
    │
    ▼
Custom Hooks (useStations, useTimeseries, useERA5, useWfsLayer)
    │
    ▼
TanStack Query (staleTime: 5 min)
    │
  cache hit ?
    │         │
  oui        non
    │         │
    ▼         ▼
  Render    api.ts → fetch → /api/v1/... → Nginx → FastAPI
                                 │
                            JSON Response → TanStack cache → Render
```

### Gestion des Filtres

L'état des filtres vit dans les **URL search params** (`useSearchParams`), pas dans un store global. Le hook `useFilters()` :

1. Lit les params de l'URL au montage
2. Restaure depuis `sessionStorage` si l'URL est vide (navigation retour)
3. Persiste chaque changement dans `sessionStorage` et l'URL
4. Expose `apiParams` pour les appels API

Filtres disponibles : `active_only`, `min_obs`, `last_after`, `classif` (array), `dept`, `bdlisa`, `bassin`, `region`, `her`, `fiable`, `indicatif`, `insuffisant`.

### Carte (ObservatoryMap)

La carte utilise MapLibre GL en mode **impératif** (pas de wrapper React déclaratif). L'API `map.addSource()` / `map.addLayer()` est appelée directement via `useRef`.

**Ordre des couches (du fond au dessus) :**
1. Basemap Voyager + hillshading
2. Calques WFS (SANDRE zonage, Carthage, masses d'eau)
3. Calques admin (régions, départements, bassins, HER) — toujours au-dessus des WFS
4. Stations clusters (piézo puis hydro)
5. Stations excluded (grises, non clusterisées)
6. Station sélectionnée (highlight)

**Gestion des clics :** Chaque handler de clic sur un calque admin vérifie d'abord si une station est sous le curseur (`queryRenderedFeatures` sur les layers station + excluded). Si oui, le clic est ignoré pour laisser le handler station prendre la main.

### Timeline

Le composant `TimelineSlider` charge l'historique complet des classifications (`api.common.classificationTimeline()`) et émet des événements `onPeriodChange(index, timelineData)`.

Quand la timeline est active :
- `displayFeatures` est recalculé à partir de **toutes** les features (pas les filtrées), en ne gardant que celles avec données à la période sélectionnée
- La classification de chaque station est remplacée par celle de la période timeline
- `excludedFeatures` montre les stations "qui existaient mais n'ont plus de données" (gris) — seulement si `activeOnly` est coché
- Les stations créées après la période timeline sont invisibles

### Code Splitting (Vite)

```javascript
manualChunks: {
  'vendor-react':  ['react', 'react-dom', 'react-router-dom'],  // ~130 KB
  'vendor-map':    ['maplibre-gl'],                              // ~650 KB
  'vendor-charts': ['recharts'],                                 // ~200 KB
  'vendor-query':  ['@tanstack/react-query'],                    // ~35 KB
}
```

Pages chargées à la demande via `React.lazy()` + `Suspense`.

---

## Schéma de Base de Données

Toutes les tables sont dans le schéma `gold` de PostgreSQL.

### Tables de Dimension

```
gold.dim_piezo_stations
├── code_bss            PK  Code BSS unique
├── latitude / longitude    Coordonnées WGS84
├── nom_commune             Commune
├── code_departement        Code département INSEE
├── nb_mesures_total        Total mesures disponibles
├── derniere_mesure         Date dernière mesure
├── classification_derniere_annee  Classification DB (fallback)
├── tendance_classification        Tendance pente de Sen
├── codes_bdlisa                   Code masse d'eau BDLISA
└── ... (50+ autres champs BSS)

gold.dim_hydro_stations
├── code_station        PK  Code Hub'Eau unique
├── code_site               Code du site hydrométrique
├── libelle_station         Libellé
├── latitude_station / longitude_station
├── grandeur_hydro_principale  Q (débit) ou H (hauteur)
├── nb_jours_total             Jours de mesures
├── derniere_mesure            Date dernière mesure
└── ...
```

### Tables de Faits

```
gold.hubeau_daily_chroniques       — Mesures journalières piézo + ERA5
gold.hydro_daily_chroniques        — Mesures journalières hydro + ERA5
gold.fct_monthly_chroniques        — Agrégats mensuels piézo (moyennes mobiles 3/12 mois)
gold.fct_monthly_hydro             — Agrégats mensuels hydro
gold.fct_yearly_stats              — Statistiques annuelles piézo (percentile, classification)
gold.fct_yearly_hydro              — Statistiques annuelles hydro
gold.agg_station_trends            — Tendances Sen piézo (par saison)
gold.agg_hydro_trends              — Tendances Sen hydro (par saison)
gold.int_era5_for_stations         — ERA5 interpolé aux stations
gold.int_era5_grid_points          — Points de grille ERA5
```

---

## Architecture de Déploiement

### Services Docker Compose

4 services : `redis`, `backend`, `frontend`, `nginx`.

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Compose Network                    │
│                                                             │
│  ┌────────┐   ┌───────────┐   ┌──────────┐   ┌────────┐   │
│  │ nginx  │──▶│  backend  │──▶│  redis   │   │frontend│   │
│  │ :80    │   │  :8000    │   │  :6379   │   │ :80    │   │
│  └────────┘   └─────┬─────┘   └──────────┘   └────────┘   │
│                     │                                       │
└─────────────────────┼───────────────────────────────────────┘
                      │
             ┌────────▼────────┐
             │   PostgreSQL    │
             │   (externe)     │
             │   schéma gold   │
             └─────────────────┘
```

### Healthchecks

| Service | Commande | Interval | Retries |
|---|---|---|---|
| `redis` | `redis-cli ping` | 5s | 5 |
| `backend` | HTTP GET `/api/v1/health` | 10s | 5 |

Dépendances : `nginx` attend `backend` (healthy) + `frontend` (started). `backend` attend `redis` (healthy).

---

## Décisions de Conception

### SPLI/SSFI plutôt que percentiles bruts

Le passage des percentiles (P10/P25/P75/P90, 5 classes) aux indices standardisés (7 classes Météo-France) permet :
- Un alignement avec les standards nationaux (BSH, ADES, DREAL)
- Une granularité plus fine (7 classes vs 5)
- Une meilleure comparabilité entre stations (indices normalisés)

### Calcul on-the-fly plutôt que ETL

Les indices sont calculés au démarrage du backend plutôt que dans le pipeline ETL. Avantages :
- Pas de modification du pipeline de données
- Recalcul automatique à chaque redémarrage
- Isolation du code métier dans `drought.py` / `classification.py`

### BDLISA statique plutôt que proxy

Les données BDLISA sont servies depuis des fichiers JSON statiques plutôt que via un proxy SANDRE API. Avantages :
- Latence minimale (lecture disque locale)
- Pas de dépendance à un service externe
- Pas de cache Redis nécessaire

### MapLibre impératif plutôt que déclaratif

La carte utilise l'API impérative MapLibre GL (`map.addLayer()`, `map.moveLayer()`) plutôt qu'un wrapper React déclaratif. Raisons :
- Contrôle fin de l'ordre des couches
- Performance sur les interactions (survol, clic)
- Gestion précise des clusters et de la symbologie dynamique
