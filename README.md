# Observatoire Hydrologique France

[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](docker-compose.yml)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](backend/pyproject.toml)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](backend/pyproject.toml)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](frontend/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](frontend/)
[![License](https://img.shields.io/badge/Licence-MIT-green.svg)](LICENSE)

Tableau de bord full-stack de surveillance hydrologique pour la France. Visualise en temps réel les données des stations piézométriques (eaux souterraines) et hydrométriques (eaux de surface), les tendances climatiques long-terme (pente de Sen), les alertes d'extrêmes et les données ERA5 sur une carte interactive.

---

## Captures d'écran

```
+--------------------------------------------------+
|  OBSERVATOIRE HYDROLOGIQUE                       |
|  [Carte interactive MapLibre GL]                 |
|                                                  |
|  ●  Station piézo - TRES_BAS   (rouge vif)       |
|  ●  Station piézo - BAS        (orange)          |
|  ●  Station piézo - NORMAL     (vert)            |
|  ●  Station piézo - HAUT       (bleu clair)      |
|  ●  Station piézo - TRES_HAUT  (bleu foncé)      |
|  ▲  Station hydro              (triangle)        |
|                                                  |
|  [Barre KPI: total piezo | total hydro | TRES_BAS | TRES_HAUT]
|  [Slider temporel ERA5]  [Filtres]               |
+--------------------------------------------------+
```

Les captures réelles sont disponibles dans le répertoire racine :
- `observatory-map-loaded.png` — Vue carte principale chargée
- `observatory-zoomed.png` — Vue zoomée sur un département
- `station-detail.png` — Page de détail avec graphiques
- `trends-page.png` — Analyse des tendances
- `alerts-page.png` — Tableau des alertes

---

## Fonctionnalités

### Carte Observatoire
- Carte interactive MapLibre GL avec toutes les stations piézométriques et hydrométriques de France
- Overlay ERA5 (température 2m, précipitations, évaporation) avec slider temporel mensuel
- Popups enrichies au survol : métadonnées complètes, classification, dernière mesure
- Barre KPI nationale (nombre de stations, répartition par classification)
- Recherche de stations par code BSS, nom de commune ou cours d'eau
- Filtres par département, classification, type de station

### Page de Détail Station
- Graphique de séries temporelles journalières/mensuelles avec bandes de référence percentile (P10/P25/P75/P90)
- Graphique du rang percentile annuel historique
- Nuage de points corrélation (niveau nappe vs précipitations)
- Graphique de saisonnalité climatologique
- Carte thermique annuelle des niveaux
- Fiche technique complète : toutes les métadonnées BSS ou Hub'Eau

### Analyse des Tendances
- Tendances de pente de Sen par station et par saison (annuel, printemps, été, automne, hiver)
- Classification des tendances : HAUSSE_FORTE, HAUSSE_SIGNIFICATIVE, STABLE, BAISSE_SIGNIFICATIVE, BAISSE_FORTE
- Classement par département, filtrage par fiabilité et grandeur hydrologique
- Projection de variation à 5 ans

### Alertes
- Tableau trié des stations en situation extrême (TRES_BAS ou TRES_HAUT)
- Filtrage par sévérité, type de station et département
- Dernière date de mesure, coordonnées géographiques

### Comparaison Multi-stations
- Superposition de séries temporelles jusqu'à 10 stations simultanément
- Normalisation optionnelle (z-score) pour comparer des unités différentes
- Corrélation de Spearman entre stations

---

## Architecture

```
                    ┌─────────────────────────────┐
                    │       Navigateur Web         │
                    │   React 19 + MapLibre GL     │
                    └──────────────┬──────────────┘
                                   │ HTTP/80
                    ┌──────────────▼──────────────┐
                    │      Nginx Reverse Proxy     │
                    │  Gzip · Rate limit · Headers │
                    └────────┬────────────┬────────┘
                             │/api/        │/
              ┌──────────────▼──┐    ┌────▼──────────────┐
              │  Backend        │    │  Frontend Nginx    │
              │  FastAPI 0.115  │    │  (build React)    │
              │  Uvicorn async  │    └───────────────────┘
              └──────┬────┬────┘
                     │    │
          ┌──────────▼┐  ┌▼──────────────┐
          │ PostgreSQL │  │  Redis 7      │
          │ (schéma    │  │  Cache LRU    │
          │  gold)     │  │  256 MB       │
          └────────────┘  └───────────────┘
```

### Flux de données

```
Requête API
    │
    ├─► Redis hit ?  ──oui──► Retour JSON brut (sous-ms)
    │
    └─► Non ──► SQLAlchemy async ──► PostgreSQL
                    │
                    └─► orjson sérialisation ──► Stockage Redis ──► Réponse
```

---

## Démarrage Rapide (Docker Compose)

### Prérequis
- Docker >= 24
- Docker Compose >= 2.20
- Une base PostgreSQL peuplée (schéma `gold`)

### 1. Cloner et configurer

```bash
git clone <url-du-repo>
cd hydro_dashboard
cp .env.example .env
```

### 2. Éditer `.env`

```env
DB_HOST=votre-hote-postgres
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=votre-mot-de-passe
REDIS_URL=redis://redis:6379/0
ALLOWED_ORIGINS=["http://localhost"]
DEBUG=false
LOG_LEVEL=INFO
```

### 3. Lancer

```bash
docker compose up -d
```

L'application est accessible sur **http://localhost**.

### 4. Vérifier la santé

```bash
curl http://localhost/api/v1/health
# {"status":"ok","db":"ok","redis":"ok"}
```

### Arrêter

```bash
docker compose down
```

---

## Installation en Développement

### Backend

**Prérequis :** Python 3.11+, PostgreSQL accessible, Redis (optionnel)

```bash
cd backend

# Créer un environnement virtuel
python -m venv .venv
source .venv/bin/activate       # Linux/macOS
# .venv\Scripts\activate        # Windows

# Installer les dépendances (y compris dev)
pip install -e ".[dev]"

# Copier et remplir les variables d'environnement
cp ../.env.example .env
# Éditer .env avec vos paramètres DB

# Lancer le serveur de développement
uvicorn app.main:app --reload --port 8000
```

L'API est disponible sur http://localhost:8000.
La documentation Swagger est accessible sur http://localhost:8000/docs (uniquement si `DEBUG=true`).

### Frontend

**Prérequis :** Node.js 20+, npm 10+

```bash
cd frontend

# Installer les dépendances
npm install

# Lancer le serveur de développement (avec proxy vers l'API backend)
npm run dev
```

L'interface est disponible sur http://localhost:5173.

Le proxy Vite redirige automatiquement `/api/*` vers `http://localhost:8000`.

---

## Variables d'Environnement

| Variable | Défaut | Description |
|---|---|---|
| `DB_HOST` | `localhost` | Hôte PostgreSQL |
| `DB_PORT` | `5432` | Port PostgreSQL |
| `DB_NAME` | `postgres` | Nom de la base de données |
| `DB_USER` | `postgres` | Utilisateur PostgreSQL |
| `DB_PASSWORD` | *(vide)* | Mot de passe PostgreSQL — **obligatoire en production** |
| `REDIS_URL` | `redis://redis:6379/0` | URL de connexion Redis |
| `ALLOWED_ORIGINS` | `["http://localhost:5173"]` | Liste JSON des origines CORS autorisées |
| `DEBUG` | `false` | Active les docs Swagger (`/docs`, `/redoc`) et logs verbeux |
| `LOG_LEVEL` | `INFO` | Niveau de log : `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` |

---

## Référence API

L'API de base est préfixée par `/api/v1`.

### Santé

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/health` | Statut de l'application, DB et Redis |

### Stations

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/stations/piezo` | Liste paginée des stations piézométriques |
| GET | `/api/v1/stations/hydro` | Liste paginée des stations hydrométriques |
| GET | `/api/v1/stations/geojson` | GeoJSON pour la carte (piezo, hydro ou all) |
| GET | `/api/v1/stations/piezo/{code_bss}` | Détail complet d'une station piézométrique |
| GET | `/api/v1/stations/hydro/{code_station}` | Détail complet d'une station hydrométrique |
| GET | `/api/v1/stations/piezo/{code_bss}/percentiles` | Percentiles historiques P10/P25/P75/P90 (piézo) |
| GET | `/api/v1/stations/hydro/{code_station}/percentiles` | Percentiles historiques P10/P25/P75/P90 (hydro) |

### Séries temporelles

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/timeseries/piezo/{code}/daily` | Mesures journalières piézométriques |
| GET | `/api/v1/timeseries/hydro/{code}/daily` | Mesures journalières hydrométriques |
| GET | `/api/v1/timeseries/piezo/{code}/monthly` | Agrégats mensuels + moyennes mobiles |
| GET | `/api/v1/timeseries/hydro/{code}/monthly` | Agrégats mensuels hydrométriques |
| GET | `/api/v1/timeseries/piezo/{code}/yearly` | Statistiques annuelles + percentile historique |
| GET | `/api/v1/timeseries/hydro/{code}/yearly` | Statistiques annuelles hydrométriques |
| GET | `/api/v1/timeseries/compare` | Séries multi-stations en parallèle |

### Tendances

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/trends/piezo` | Tendances piézométriques (pente de Sen) |
| GET | `/api/v1/trends/hydro` | Tendances hydrométriques |

### Statistiques

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/stats/national` | Totaux nationaux par classification |
| GET | `/api/v1/stats/departments` | Statistiques par département |

### Données ERA5

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/era5/grid` | Points de grille ERA5 disponibles |
| GET | `/api/v1/era5/snapshot?date=YYYY-MM-DD` | Snapshot météo pour une date |
| GET | `/api/v1/era5/dates` | Mois disponibles dans les données ERA5 |
| GET | `/api/v1/era5/monthly?month=YYYY-MM-DD` | Agrégats mensuels ERA5 |

### Alertes

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/alerts` | Stations en situation extrême (TRES_BAS ou TRES_HAUT) |

Pour la documentation complète des paramètres et schémas de réponse, voir [docs/API.md](docs/API.md).

---

## Stack Technique

| Couche | Technologie | Version |
|---|---|---|
| **Backend — Framework** | FastAPI | 0.115+ |
| **Backend — Serveur** | Uvicorn | 0.34+ |
| **Backend — ORM async** | SQLAlchemy | 2.0 |
| **Backend — Driver DB** | asyncpg | 0.30+ |
| **Backend — Cache** | Redis (redis-py async) | 5.0+ |
| **Backend — Sérialisation** | orjson | 3.10+ |
| **Backend — Validation** | Pydantic | 2.0+ |
| **Base de données** | PostgreSQL | 14+ |
| **Cache** | Redis | 7 |
| **Frontend — Framework** | React | 19 |
| **Frontend — Langage** | TypeScript | 5.9 |
| **Frontend — Build** | Vite | 7.3 |
| **Frontend — Data fetching** | TanStack Query | v5 |
| **Frontend — Carte** | MapLibre GL | 5.19 |
| **Frontend — Graphiques** | Recharts | 3.7 |
| **Frontend — CSS** | Tailwind CSS | 4.2 |
| **Frontend — Routing** | React Router | 7.13 |
| **Proxy** | Nginx | alpine |
| **Conteneurisation** | Docker Compose | — |

---

## Structure du Projet

```
hydro_dashboard/
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   └── app/
│       ├── main.py              # Point d'entrée FastAPI, CORS, routers
│       ├── config.py            # Paramètres Pydantic (variables d'env)
│       ├── database.py          # Moteur SQLAlchemy async
│       ├── cache.py             # Helpers Redis async (cache-aside)
│       ├── json_response.py     # FastJSONResponse (orjson)
│       ├── models/
│       │   ├── station.py       # Modèles Pydantic de réponse station
│       │   ├── timeseries.py    # Modèles séries temporelles
│       │   └── era5.py          # Modèles ERA5
│       └── routers/
│           ├── stations.py      # /api/v1/stations/*
│           ├── timeseries.py    # /api/v1/timeseries/*
│           ├── trends.py        # /api/v1/trends/*
│           ├── stats.py         # /api/v1/stats/*
│           ├── era5.py          # /api/v1/era5/*
│           └── alerts.py        # /api/v1/alerts
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf               # Nginx du conteneur frontend
│   ├── vite.config.ts           # Vite + code splitting + proxy
│   └── src/
│       ├── routes.tsx           # React Router (lazy loading)
│       ├── lib/
│       │   ├── api.ts           # Toutes les fonctions d'appel API
│       │   ├── types.ts         # Interfaces TypeScript
│       │   ├── constants.ts     # Constantes (couleurs, labels)
│       │   └── utils.ts         # Utilitaires
│       ├── hooks/               # Hooks TanStack Query
│       │   ├── useStations.ts
│       │   ├── useTimeseries.ts
│       │   ├── useERA5.ts
│       │   └── useFilters.ts
│       ├── pages/
│       │   ├── ObservatoryPage.tsx   # Vue carte principale
│       │   ├── StationPage.tsx       # Détail station
│       │   ├── TrendsPage.tsx        # Analyse tendances
│       │   ├── AlertsPage.tsx        # Tableau des alertes
│       │   └── ComparePage.tsx       # Comparaison multi-stations
│       └── components/
│           ├── charts/               # Composants Recharts
│           │   ├── TimeseriesChart.tsx
│           │   ├── PercentileChart.tsx
│           │   ├── CorrelationScatter.tsx
│           │   ├── SeasonalityChart.tsx
│           │   └── YearlyHeatmap.tsx
│           ├── map/                  # Composants MapLibre
│           │   ├── ObservatoryMap.tsx
│           │   ├── StationPopup.tsx
│           │   ├── KPIBar.tsx
│           │   ├── SearchBar.tsx
│           │   └── TemporalSlider.tsx
│           ├── station/              # UI spécifique aux stations
│           │   ├── ClassificationBadge.tsx
│           │   └── StationKPICards.tsx
│           ├── filters/              # Contrôles de filtres
│           └── layout/               # Shell (Sidebar, Layout)
├── nginx/
│   └── nginx.conf                    # Reverse proxy (port 80)
├── docker-compose.yml
├── .env.example
└── docs/
    ├── API.md                        # Référence API complète
    ├── ARCHITECTURE.md               # Architecture technique
    └── DEVELOPMENT.md                # Guide de développement
```

---

## Système de Classification

Chaque station est classifiée selon le centile de sa valeur annuelle par rapport à son historique complet :

| Classification | Centile | Signification | Couleur |
|---|---|---|---|
| `TRES_BAS` | < P10 | Niveau exceptionnellement bas | Rouge |
| `BAS` | P10 – P25 | Niveau en dessous de la normale | Orange |
| `NORMAL` | P25 – P75 | Niveau dans la normale saisonnière | Vert |
| `HAUT` | P75 – P90 | Niveau au-dessus de la normale | Bleu clair |
| `TRES_HAUT` | > P90 | Niveau exceptionnellement haut | Bleu foncé |

Cette classification est calculée séparément pour les stations piézométriques (niveau de la nappe en m NGF) et hydrométriques (débit ou hauteur d'eau).

---

## Tables de Base de Données

Toutes les tables sont dans le schéma `gold` de PostgreSQL.

| Table | Description |
|---|---|
| `gold.dim_piezo_stations` | Métadonnées des stations piézométriques (50+ champs) |
| `gold.dim_hydro_stations` | Métadonnées des stations hydrométriques |
| `gold.hubeau_daily_chroniques` | Mesures journalières piézométriques + ERA5 |
| `gold.hydro_daily_chroniques` | Mesures journalières hydrométriques + ERA5 |
| `gold.fct_monthly_chroniques` | Agrégats mensuels piézométriques + moyennes mobiles |
| `gold.fct_monthly_hydro` | Agrégats mensuels hydrométriques |
| `gold.fct_yearly_stats` | Statistiques annuelles piézométriques |
| `gold.fct_yearly_hydro` | Statistiques annuelles hydrométriques |
| `gold.agg_station_trends` | Tendances de pente de Sen (piézo) |
| `gold.agg_hydro_trends` | Tendances de pente de Sen (hydro) |
| `gold.int_era5_for_stations` | Données ERA5 interpolées aux stations |
| `gold.int_era5_grid_points` | Points de grille ERA5 disponibles |

---

## Performance

- **Redis cache-aside** : TTL de 1h pour les listes de stations, 6–12h pour les séries temporelles, 24h pour les percentiles et statistiques annuelles
- **orjson** : sérialisation JSON 2-3× plus rapide que la bibliothèque standard
- **`COUNT(*) OVER()`** : fonction fenêtre PostgreSQL pour obtenir le total sans double requête
- **`asyncio.gather`** : requêtes DB parallèles pour l'endpoint `/compare`
- **Lazy loading React** : chaque page chargée à la demande (`React.lazy + Suspense`)
- **Code splitting Vite** : 4 chunks vendeurs séparés (`vendor-react`, `vendor-map`, `vendor-charts`, `vendor-query`)
- **Nginx** : compression gzip niveau 5, rate limiting (30 req/s API, 60 req/s général)

---

## Documentation Technique

- [docs/API.md](docs/API.md) — Référence complète de l'API (paramètres, schémas, exemples)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Architecture système et décisions de conception
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — Guide de développement et contribution

---

## Contribuer

1. Forker le dépôt
2. Créer une branche feature : `git checkout -b feat/ma-fonctionnalite`
3. Suivre les conventions de code (ruff pour Python, ESLint pour TypeScript)
4. Écrire des tests pour les nouveaux endpoints
5. Ouvrir une Pull Request avec une description claire

Consulter [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) pour le guide de contribution détaillé.

---

## Licence

Ce projet est distribué sous licence **MIT**.

```
MIT License

Copyright (c) 2024-2026 Observatoire Hydrologique France

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```
