# Observatoire Hydrologique France

Dashboard de surveillance hydrologique temps réel pour la France. Visualise les données piézométriques (eaux souterraines) et hydrométriques (eaux de surface) : carte interactive avec calques SANDRE/Carthage/BDLISA, séries temporelles, alertes avec historique, comparaison multi-stations (z-score) et données climatiques ERA5.

**Stack :** FastAPI / SQLAlchemy async / Redis / PostgreSQL — React 19 / TypeScript / Vite / MapLibre GL / Recharts / TanStack Query / Tailwind CSS 4

## Déploiement (Docker Compose)

### Prérequis

- Docker >= 24 et Docker Compose >= 2.20
- PostgreSQL avec le schéma `gold` peuplé (externe à Docker Compose)

### Lancer

```bash
cp .env.example .env
# Éditer .env avec vos paramètres DB
docker compose up -d
```

Application accessible sur **http://localhost**.

### Vérifier

```bash
curl http://localhost/api/v1/health
# {"status":"ok","db":"ok","redis":"ok"}
```

### Arrêter

```bash
docker compose down
```

## Configuration

Variables d'environnement (fichier `.env` à la racine) :

| Variable | Défaut | Description |
|---|---|---|
| `DB_HOST` | `localhost` | Hôte PostgreSQL |
| `DB_PORT` | `5432` | Port PostgreSQL |
| `DB_NAME` | `postgres` | Nom de la base |
| `DB_USER` | `postgres` | Utilisateur |
| `DB_PASSWORD` | — | Mot de passe (obligatoire en production) |
| `REDIS_URL` | `redis://redis:6379/0` | URL Redis |
| `ALLOWED_ORIGINS` | `["http://localhost:5173"]` | Origines CORS (JSON) |
| `DEBUG` | `false` | Active Swagger (`/docs`) et logs verbeux |
| `LOG_LEVEL` | `INFO` | Niveau de log |

## Développement local

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

API sur http://localhost:8000. Swagger sur `/docs` si `DEBUG=true`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Interface sur http://localhost:5173. Le proxy Vite redirige `/api/*` vers le backend.

## Architecture

```
Navigateur → Nginx (:80) → /api/ → FastAPI (async) → PostgreSQL (schéma gold)
                          → /    → SPA React              ↕ Redis (cache LRU)
```

4 services Docker : `redis`, `backend`, `frontend`, `nginx`.

## Fonctionnalités

- **Carte interactive** — Stations piézo/hydro clusterisées, calques SANDRE (zonage, Carthage, masses d'eau DCE), couches admin (régions, départements, bassins, HER), BDLISA, relief
- **Alertes** — Stations actives en situation anormale, classées par sévérité (Très bas / Bas / Haut / Très haut), avec historique d'années consécutives
- **Comparaison** — Jusqu'à 5 stations, normalisation z-score pour comparer piézo et hydro
- **Détail station** — Chroniques journalières/mensuelles/annuelles, percentiles, tendance (Sen), données ERA5, liens BDLISA/Sandre
- **Filtres** — Département, bassin, classification, tendance, observations min, stations actives

## Sources de données

| Source | Description | Usage |
|---|---|---|
| **Hub'Eau** (BRGM) | API nationale données piézométriques et hydrométriques | Données stations, chroniques, niveaux |
| **SANDRE** | WFS — zonage hydrographique, réseau Carthage, masses d'eau DCE | Calques carte (8 couches) |
| **ERA5** (ECMWF) | Réanalyse climatique : température, précipitations, évaporation | Corrélation climat/niveaux |
| **BDLISA** | Base de données des entités hydrogéologiques | Carte des aquifères |
| **IGN/Admin** | Limites administratives (régions, départements) | Calques de référence |

## Documentation

- [docs/API.md](docs/API.md) — Référence API complète
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Architecture technique
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — Guide de développement

## Licence

MIT
