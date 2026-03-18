# Observatoire Hydrologique France

Tableau de bord interactif de surveillance des eaux souterraines (piézométrie) et de surface (hydrométrie) en France métropolitaine. Carte interactive, indices de sécheresse standardisés (SPLI/SSFI/SPI), alertes, comparaison multi-stations et données climatiques ERA5.

**Stack :** FastAPI / SQLAlchemy async / Redis / PostgreSQL — React 19 / TypeScript / Vite / MapLibre GL / Recharts / TanStack Query / Tailwind CSS 4

---

## Fonctionnalités

- **Carte interactive** — ~18 000 stations piézo + ~5 000 stations hydro, clusterisées, avec calques SANDRE (zonage, Carthage, masses d'eau DCE), couches admin (régions, départements, bassins, HER), BDLISA (aquifères), relief
- **Classification 7 classes** — Indices de sécheresse standardisés (BRGM / Météo-France) : extrêmement bas → extrêmement haut, calculés on-the-fly au démarrage
- **Fiabilité** — 3 niveaux (fiable, indicatif, insuffisant) basés sur la profondeur historique
- **Timeline historique** — Rejeu mois par mois des classifications depuis 2005, avec filtres de saison et d'année
- **Alertes** — Stations en situation anormale, classées par sévérité, avec durée consécutive
- **Comparaison** — Jusqu'à 5 stations, normalisation z-score pour comparer piézo et hydro
- **Détail station** — Chroniques journalières/mensuelles/annuelles, indices SPLI/SSFI/SPI, percentiles, tendance (Sen), données ERA5
- **Filtres avancés** — Classification, fiabilité, département, activité, observations min, filtre spatial par zone
- **Recherche universelle** — Stations, départements, régions, bassins, HER, calques WFS — insensible aux accents

---

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

---

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

---

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

---

## Architecture

```
Navigateur → Nginx (:80) → /api/ → FastAPI (async) → PostgreSQL (schéma gold)
                          → /    → SPA React              ↕ Redis (cache LRU)
```

4 services Docker : `redis`, `backend`, `frontend`, `nginx`.

Au démarrage, le backend calcule les indices de sécheresse (SPLI/SSFI) et la fiabilité de toutes les stations, puis met le résultat en cache Redis (24h). Si Redis est indisponible, l'application se rabat sur les classifications percentiles de la base de données.

---

## Sources de données

| Source | Description | Usage |
|---|---|---|
| **Hub'Eau** (BRGM / SCHAPI) | API nationale données piézométriques et hydrométriques | Stations, chroniques, niveaux, débits |
| **SANDRE** | WFS — zonage hydrographique, réseau Carthage, masses d'eau DCE | 8 calques de carte |
| **ERA5** (ECMWF) | Réanalyse climatique : température, précipitations, évaporation | Corrélation climat/niveaux |
| **BDLISA** (BRGM) | Base de données des entités hydrogéologiques | Carte des aquifères |
| **IGN** | Limites administratives (régions, départements) | Calques de référence |

---

## Documentation

### Pour les utilisateurs

- **[Guide utilisateur](docs/USER_GUIDE.md)** — Fonctionnalités de la plateforme, carte interactive, filtres, timeline, alertes, comparaison, classification et fiabilité

### Pour les développeurs

- **[Guide de développement](docs/DEVELOPMENT.md)** — Installation locale, conventions de code, ajouter un endpoint ou une page, workflow Git
- **[Architecture technique](docs/ARCHITECTURE.md)** — Architecture système, patterns (cache-aside, indices de sécheresse, classification batch), schéma de base de données, décisions de conception
- **[Référence API](docs/API.md)** — Tous les endpoints, paramètres, réponses, codes d'erreur, TTL des caches

---

## Licence

MIT
