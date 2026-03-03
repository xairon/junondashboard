# Architecture — Hydro Dashboard

Ce document décrit l'architecture technique du tableau de bord hydrologique, les patterns utilisés et les décisions de conception.

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
│   • En-têtes de sécurité : X-Content-Type-Options, X-Frame-     │
│     Options, Referrer-Policy, Permissions-Policy, X-XSS         │
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
└─────────────┘   └───────────────────┬───────────────────────────┘
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
├── main.py           # Point d'entrée : création de l'app, middleware, lifespan
├── config.py         # Settings Pydantic-settings (lecture .env + env vars)
├── database.py       # Moteur SQLAlchemy async + session factory
├── cache.py          # Helpers Redis (get_redis, cache_key, cached, cached_response)
├── json_response.py  # FastJSONResponse : wrapper orjson pour FastAPI
├── models/           # Modèles Pydantic de validation de réponse
│   ├── station.py    # PiezoStationDetail, HydroStationDetail, StationPercentiles
│   ├── timeseries.py # Schémas séries temporelles
│   └── era5.py       # Schémas ERA5
└── routers/          # Handlers de routes (1 router = 1 domaine métier)
    ├── stations.py
    ├── timeseries.py
    ├── trends.py
    ├── stats.py
    ├── era5.py
    └── alerts.py
```

### Pattern Async et Lifespan

Le serveur utilise la gestion de cycle de vie (`lifespan`) d'ASGI pour initialiser et libérer proprement les ressources :

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup : vérification Redis
    r = get_redis()
    if r is not None:
        await r.ping()
    yield
    # Shutdown : fermeture des pools de connexion
    await redis_pool.aclose()
    await engine.dispose()
```

Chaque requête obtient une session DB SQLAlchemy via `Depends(get_db)`. Les sessions sont des `AsyncSession` avec `expire_on_commit=False` pour éviter les lazy-loads post-commit.

### Stratégie de Cache (Cache-Aside Pattern)

Le cache fonctionne selon le pattern "cache-aside" (lazy loading) :

```
Requête entrante
      │
      ▼
Redis disponible ?
      │
  oui │             non
      ▼              ▼
  GET key         Exécuter fetch_fn()
      │                    │
  hit │  miss              │
      ▼    ▼               ▼
  JSON  Exécuter      Stocker dans Redis
brut  fetch_fn()       avec TTL
      │    │                │
      └────┴────────────────┘
                │
           Réponse HTTP
```

Deux helpers :

- **`cached(r, key, ttl, fetch_fn)`** — Retourne un objet Python (désérialisé). Utilisé quand on a besoin de manipuler le résultat (ex: ajouter `X-Total-Count`).
- **`cached_response(prefix, params, ttl, fetch_fn)`** — Retourne directement une `Response` HTTP. Stocke et restitue les bytes JSON bruts pour éviter la double sérialisation.

Les clés Redis ont la forme `hydro:<prefix>:<sha256_16chars>` où le hash est calculé sur les paramètres JSON sérialisés triés.

### Sérialisation orjson

`FastJSONResponse` remplace la classe de réponse JSON standard de FastAPI :

```python
class FastJSONResponse(JSONResponse):
    media_type = "application/json"

    def render(self, content):
        return orjson.dumps(content)
```

orjson est 2–3× plus rapide que `json.dumps` standard et gère nativement `datetime`, `date`, `Decimal`, `UUID`.

### Optimisations PostgreSQL

**Pagination sans double requête :**

```sql
SELECT *, count(*) OVER() AS total_count
FROM gold.dim_piezo_stations
WHERE ...
ORDER BY code_bss
LIMIT :limit OFFSET :offset
```

La fonction fenêtre `COUNT(*) OVER()` calcule le total sur l'ensemble filtré en une seule passe, évitant un second `SELECT COUNT(*)`.

**Requêtes parallèles (compare endpoint) :**

```python
results = await asyncio.gather(*(fetch_one(code) for code in stations))
```

Jusqu'à 10 requêtes DB simultanées pour l'endpoint de comparaison.

---

## Architecture Frontend (React)

### Arbre de Composants

```
App (main.tsx)
└── RouterProvider (routes.tsx)
    └── Layout (Sidebar + Outlet)
        ├── ObservatoryPage (/)
        │   ├── ObservatoryMap (MapLibre GL)
        │   │   ├── StationPopup
        │   │   ├── KPIBar
        │   │   ├── SearchBar
        │   │   └── TemporalSlider
        │   └── Filters
        ├── StationPage (/station/:type/:code)
        │   ├── StationKPICards
        │   ├── ClassificationBadge
        │   ├── TimeseriesChart (Recharts)
        │   ├── PercentileChart
        │   ├── CorrelationScatter
        │   ├── SeasonalityChart
        │   └── YearlyHeatmap
        ├── TrendsPage (/trends)
        │   └── Panneau latéral avec tableau de tendances
        ├── AlertsPage (/alerts)
        │   └── Tableau trié des stations en alerte
        └── ComparePage (/compare)
            └── Graphique multi-séries avec normalisation
```

### Flux de Données

```
URL / State
    │
    ▼
React Router (routes.tsx)
    │
    ▼
Page Component (lazy loaded)
    │
    ▼
Custom Hook (useStations, useTimeseries, ...)
    │
    ▼
TanStack Query (queryClient)
    │
  cache hit ?
    │         │
  oui        non
    │         │
    ▼         ▼
  Data     api.ts fetch()
  depuis       │
  cache        ▼
          /api/v1/... (Nginx → FastAPI)
               │
               ▼
          JSON Response
               │
               ▼
        TanStack cache (staleTime)
               │
               ▼
        Composant React (re-render)
```

### Hooks Personnalisés (TanStack Query)

Chaque domaine métier a son hook encapsulant la logique TanStack Query :

- **`useStations(filters)`** — Liste de stations avec filtres réactifs
- **`useTimeseries(code, type, granularity)`** — Séries temporelles avec sélection de granularité
- **`useERA5(date)`** — Données climatiques pour l'overlay carte
- **`useFilters()`** — État partagé des filtres (classification, département, etc.)

### Code Splitting (Vite)

La configuration Vite divise le bundle en 4 chunks vendeurs distincts pour optimiser le chargement initial :

```javascript
manualChunks: {
  'vendor-react':  ['react', 'react-dom', 'react-router-dom'],  // ~130 KB
  'vendor-map':    ['maplibre-gl'],                              // ~650 KB
  'vendor-charts': ['recharts'],                                 // ~200 KB
  'vendor-query':  ['@tanstack/react-query'],                    // ~35 KB
}
```

Les pages sont chargées à la demande via `React.lazy()` + `Suspense`. L'utilisateur voit un spinner animé pendant le chargement.

### Proxy de Développement

En développement, Vite proxifie automatiquement les requêtes API :

```javascript
server: {
  proxy: {
    '/api': 'http://localhost:8000',
  },
}
```

Cela évite les problèmes CORS en développement et reflète fidèlement le comportement de production.

---

## Schéma de Base de Données

Toutes les tables sont dans le schéma `gold` de PostgreSQL.

### Tables de Dimension (Métadonnées)

```
gold.dim_piezo_stations
├── code_bss            PK  VARCHAR   Code BSS unique
├── bss_id                  VARCHAR   Identifiant BSS complémentaire
├── latitude                FLOAT     Latitude WGS84
├── longitude               FLOAT     Longitude WGS84
├── nom_commune             VARCHAR   Commune
├── code_departement        VARCHAR   Code département INSEE
├── nom_departement         VARCHAR   Nom département
├── nb_mesures_total        INTEGER   Total mesures disponibles
├── derniere_mesure         DATE      Date dernière mesure
├── classification_derniere_annee  VARCHAR  Classification actuelle
├── niveau_derniere_annee   FLOAT     Valeur de la dernière année
├── tendance_classification VARCHAR   Tendance de pente de Sen
├── codes_bdlisa            VARCHAR   Code masse d'eau BDLISA
└── ... (50+ autres champs BSS)

gold.dim_hydro_stations
├── code_station        PK  VARCHAR   Code Hub'Eau unique
├── code_site               VARCHAR   Code du site hydrométrique
├── libelle_station         VARCHAR   Libellé de la station
├── libelle_cours_eau       VARCHAR   Nom du cours d'eau
├── latitude_station        FLOAT     Latitude WGS84
├── longitude_station       FLOAT     Longitude WGS84
├── code_departement        VARCHAR   Code département
├── grandeur_hydro_principale  VARCHAR  Q (débit) ou H (hauteur)
├── nb_jours_total          INTEGER   Jours de mesures
├── derniere_mesure         DATE      Dernière mesure disponible
├── classification_resultat_dern_annee  VARCHAR
└── ...
```

### Tables de Faits (Mesures)

```
gold.hubeau_daily_chroniques           -- Mesures journalières piézo
├── code_bss                FK         Code BSS
├── date                               Date de mesure
├── niveau_nappe_eau                   Cote piézométrique (m NGF)
├── profondeur_nappe                   Profondeur nappe (m)
├── temperature_2m                     ERA5 température 2m (°C)
├── total_precipitation                ERA5 précipitations (m)
└── potential_evaporation              ERA5 ETP (m)

gold.hydro_daily_chroniques            -- Mesures journalières hydro
├── code_station            FK
├── date
├── resultat_obs_elab                  Débit (m³/s) ou Hauteur (m)
├── grandeur_hydro_elab                Q ou H
└── ... (données ERA5 identiques)

gold.fct_monthly_chroniques            -- Agrégats mensuels piézo
├── code_bss                FK
├── mois                               Premier jour du mois
├── niveau_moyen / min / max
├── amplitude_mensuelle
├── niveau_moy_mobile_3m               Moyenne mobile 3 mois
├── niveau_moy_mobile_12m              Moyenne mobile 12 mois
├── variation_niveau_vs_mois_prec
└── variation_niveau_vs_annee_prec

gold.fct_yearly_stats                  -- Statistiques annuelles piézo
├── code_bss                FK
├── annee
├── niveau_moyen_annuel / min / max
├── percentile_niveau_historique       Rang percentile 0–100
├── classification_niveau_annuel
└── niveau_moy_mobile_5ans

gold.agg_station_trends                -- Tendances pente de Sen (piézo)
├── code_bss                FK
├── saison                             annuel / printemps / ete / automne / hiver
├── variation_annuelle_m               Variation en m/an
├── fiabilite_tendance                 Indice 0–1
├── nb_points                          Points utilisés
├── classification_tendance
└── projection_variation_5ans_m

gold.int_era5_for_stations             -- ERA5 interpolé aux stations
├── era5_date
├── latitude
├── longitude
├── temperature_2m
├── total_precipitation
└── potential_evaporation

gold.int_era5_grid_points              -- Points de grille ERA5
├── era5_latitude
└── era5_longitude
```

---

## Couches de Cache

### Stratégie Globale

Le système utilise deux niveaux de cache :

1. **Cache Redis (serveur)** — Données brutes de la DB, TTL configurable par endpoint
2. **Cache TanStack Query (client)** — Données reçues par le browser, staleTime par type

### TTL Redis par Type de Données

| Type de données | TTL | Justification |
|---|---|---|
| Listes de stations | 1 heure | Mise à jour quotidienne max |
| Détails de station | 1 heure | Métadonnées stables |
| GeoJSON carte | 1 heure | Même fréquence de mise à jour |
| Séries temporelles journalières | 6 heures | Nouvelles mesures en fin de journée |
| Agrégats mensuels | 12 heures | Calculs recalculés la nuit |
| Tendances | 12 heures | Calculs hebdomadaires |
| Statistiques nationales/dépt | 6 heures | Actualisées toutes les 6h |
| Statistiques annuelles | 24 heures | Données historiques stables |
| Percentiles historiques | 24 heures | Basés sur l'historique complet |
| Données ERA5 | 24 heures | Mises à jour mensuelles |
| Alertes | 1 heure | Fraîcheur opérationnelle |
| Comparaison multi-stations | 30 minutes | Requêtes variées, TTL court |

### Comportement en cas d'Indisponibilité Redis

Le cache est **optionnel** : si Redis est indisponible ou non configuré, le système fonctionne normalement en interrogeant directement la base de données. Aucune exception n'est levée — un avertissement est logué.

---

## Architecture de Déploiement

### Services Docker Compose

```
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Compose Network                        │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │    nginx     │    │   backend    │    │    frontend      │   │
│  │              │    │              │    │                  │   │
│  │  Port 80:80  │───▶│  Port 8000   │    │  Port 80 (int.)  │   │
│  │  256 MB RAM  │    │  1 GB RAM    │◀───│  (Nginx build)   │   │
│  │  0.5 CPU     │    │  1.0 CPU     │    │                  │   │
│  └──────────────┘    └──────┬───────┘    └──────────────────┘   │
│                             │                                    │
│                      ┌──────▼───────┐                           │
│                       │    redis     │                          │
│                       │              │                          │
│                       │  Port 6379   │                          │
│                       │  512 MB RAM  │                          │
│                       │  0.5 CPU     │                          │
│                       │  allkeys-lru │                          │
│                       └──────────────┘                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  PostgreSQL (externe au Compose)                 │
│            Schéma gold · Toutes les tables de données            │
└─────────────────────────────────────────────────────────────────┘
```

### Healthchecks

| Service | Commande de vérification | Interval | Retries |
|---|---|---|---|
| `redis` | `redis-cli ping` | 5s | 5 |
| `backend` | `urllib.request.urlopen('http://localhost:8000/api/v1/health')` | 10s | 5 |

Le service `nginx` dépend de `backend` (condition `service_healthy`) et `frontend` (condition `service_started`). Le service `backend` dépend de `redis` (condition `service_healthy`).

### Nginx : Configuration Sécurité et Performance

**En-têtes de sécurité :**

```nginx
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options SAMEORIGIN always;
add_header Referrer-Policy strict-origin-when-cross-origin always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header X-XSS-Protection "1; mode=block" always;
```

**Rate limiting :**

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=general:10m rate=60r/s;
limit_conn_zone $binary_remote_addr zone=connlimit:10m;
```

**Buffering proxy :**

```nginx
proxy_buffer_size 4k;
proxy_buffers 4 8k;
```

---

## Décisions de Conception

### Pourquoi SQLAlchemy 2.0 async + asyncpg ?

L'API est entièrement asynchrone (ASGI avec Uvicorn). SQLAlchemy 2.0 avec le driver `asyncpg` permet d'émettre des requêtes SQL sans bloquer la boucle d'événements. `asyncpg` est le driver PostgreSQL async le plus performant disponible pour Python (connexions binaires, pas de conversion de types intermédiaire).

### Pourquoi orjson plutôt que json standard ?

orjson est implémenté en Rust. Il gère nativement `datetime`, `date`, `Decimal`, `UUID` et `numpy` sans encodeurs personnalisés, et est 2–3× plus rapide que la bibliothèque standard. Dans un contexte de tableau de bord avec de nombreuses séries temporelles, cela représente une amélioration mesurable des temps de réponse.

### Pourquoi Redis en mode cache-aside plutôt que write-through ?

Les données proviennent d'une source externe (Hub'Eau API, ERA5 Copernicus) ingérée en batch. Le cache-aside avec TTL est approprié car :
- Les données ne changent pas à la fréquence des requêtes
- En cas de panne Redis, la DB prend le relais sans perte de service
- Pas de risque d'incohérence écriture-lecture

### Pourquoi TanStack Query v5 côté client ?

TanStack Query gère automatiquement le cache, la deduplication des requêtes identiques, le background refetch et les états de chargement/erreur. Couplé au cache Redis côté serveur, le tableau de bord n'émet en pratique des requêtes réseau que lors du premier accès à une donnée dans la session.

### Pourquoi MapLibre GL plutôt que Mapbox GL ou Leaflet ?

MapLibre GL est un fork open-source de Mapbox GL JS v1 sans licence propriétaire. Il est compatible avec les tuiles vectorielles standards (OpenMapTiles, MapTiler, etc.) et offre les performances WebGL nécessaires pour afficher plusieurs milliers de marqueurs simultanément avec interactions fluides.
