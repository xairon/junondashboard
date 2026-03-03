# Guide de Développement — Hydro Dashboard

Ce guide couvre l'installation locale, les conventions de code, et les procédures pour ajouter de nouvelles fonctionnalités.

---

## Prérequis

| Outil | Version minimum | Usage |
|---|---|---|
| Python | 3.11 | Backend FastAPI |
| Node.js | 20 LTS | Frontend React |
| npm | 10 | Gestionnaire de paquets frontend |
| PostgreSQL | 14 | Base de données principale (externe) |
| Redis | 7 | Cache (optionnel en développement) |
| Docker | 24 | Déploiement conteneurisé |
| Docker Compose | 2.20 | Orchestration multi-services |
| Git | 2.40 | Versionnement |

---

## Installation du Backend

### 1. Créer l'environnement virtuel

```bash
cd /chemin/vers/hydro_dashboard/backend

python -m venv .venv

# Linux / macOS
source .venv/bin/activate

# Windows (PowerShell)
.venv\Scripts\Activate.ps1

# Windows (bash/WSL)
source .venv/Scripts/activate
```

### 2. Installer les dépendances

```bash
# Dépendances de production + développement
pip install -e ".[dev]"
```

Cela installe :
- `fastapi`, `uvicorn[standard]`, `asyncpg`, `sqlalchemy[asyncio]`, `redis`, `pydantic`, `pydantic-settings`, `orjson`
- `pytest`, `pytest-asyncio`, `httpx`, `ruff` (outils dev)

### 3. Configurer les variables d'environnement

```bash
# Depuis la racine du projet
cp .env.example .env
```

Éditer `.env` :

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=votre_mot_de_passe
REDIS_URL=redis://localhost:6379/0
ALLOWED_ORIGINS=["http://localhost:5173","http://localhost:3000"]
DEBUG=true
LOG_LEVEL=DEBUG
```

**Note :** Mettre `DEBUG=true` active les endpoints Swagger UI (`/docs`) et ReDoc (`/redoc`).

### 4. Lancer le serveur de développement

```bash
cd backend
uvicorn app.main:app --reload --port 8000 --log-level debug
```

L'API est disponible sur :
- http://localhost:8000/api/v1/health — endpoint santé
- http://localhost:8000/docs — Swagger UI (si `DEBUG=true`)
- http://localhost:8000/redoc — ReDoc (si `DEBUG=true`)

Le flag `--reload` redémarre automatiquement le serveur à chaque modification de fichier Python.

### 5. Redis optionnel en développement

Si Redis n'est pas disponible localement, l'API fonctionne sans cache. Pour lancer Redis avec Docker :

```bash
docker run -d --name redis-dev -p 6379:6379 redis:7-alpine
```

---

## Installation du Frontend

### 1. Installer les dépendances

```bash
cd /chemin/vers/hydro_dashboard/frontend
npm install
```

### 2. Lancer le serveur de développement

```bash
npm run dev
```

L'interface est accessible sur http://localhost:5173.

Le proxy Vite redirige automatiquement `/api/*` vers `http://localhost:8000` (configuré dans `vite.config.ts`). Le backend doit donc être lancé en parallèle.

### 3. Build de production

```bash
npm run build
```

Les artefacts sont générés dans `frontend/dist/`. Le build applique le code splitting en 4 chunks vendeurs.

### 4. Prévisualiser le build de production

```bash
npm run preview
```

---

## Lancer les Tests

### Backend

Les tests utilisent `pytest` avec `pytest-asyncio` (mode `auto` configuré dans `pyproject.toml`) et `httpx` comme client HTTP de test.

```bash
cd backend

# Lancer tous les tests
pytest

# Avec verbosité
pytest -v

# Un fichier spécifique
pytest tests/test_stations.py -v

# Avec coverage (si coverage installé)
pytest --cov=app --cov-report=term-missing
```

Les tests nécessitent une base de données PostgreSQL accessible. Il est recommandé d'utiliser une base de test dédiée.

### Frontend

```bash
cd frontend

# Vérification TypeScript
npm run tsc --noEmit

# ESLint
npm run lint
```

---

## Conventions de Code

### Backend Python — ruff

Le projet utilise `ruff` comme linter et formateur. La configuration est dans `pyproject.toml` :

```toml
[tool.ruff]
line-length = 120
target-version = "py311"
```

**Commandes :**

```bash
# Vérifier le style
ruff check app/

# Corriger automatiquement
ruff check --fix app/

# Formater le code
ruff format app/
```

**Conventions importantes :**
- Type hints obligatoires pour les paramètres de route et les retours de fonctions publiques
- Imports groupés : standard library, tiers, local (séparés par une ligne vide)
- Pas de `*` imports
- Docstrings anglaises pour les fonctions complexes

### Frontend TypeScript — ESLint

```bash
# Vérifier le style
npm run lint

# Corriger automatiquement
npm run lint -- --fix
```

**Conventions importantes :**
- `interface` plutôt que `type` pour les objets de données (voir `lib/types.ts`)
- Hooks personnalisés dans `src/hooks/` avec préfixe `use`
- Composants dans `src/components/<domaine>/` en PascalCase
- Pas de `any` explicite — utiliser `unknown` si le type est indéterminé
- Toutes les props de composants typées avec une interface nommée `<Composant>Props`

---

## Ajouter un Nouvel Endpoint API

Voici le processus complet pour ajouter un endpoint, illustré par l'exemple d'un endpoint de recherche de stations par masse d'eau BDLISA.

### Étape 1 : Créer ou identifier le router

Si le nouveau endpoint appartient à un domaine existant, l'ajouter dans le fichier router correspondant (`routers/stations.py`, etc.). Pour un nouveau domaine, créer un nouveau fichier.

```bash
# Nouveau domaine
touch backend/app/routers/bdlisa.py
```

### Étape 2 : Définir le modèle de réponse (si nécessaire)

Dans `backend/app/models/`, ajouter le schéma Pydantic :

```python
# backend/app/models/station.py (ajout)
from pydantic import BaseModel

class BDLISAStats(BaseModel):
    code_bdlisa: str
    nb_stations: int
    classification_dominante: str | None
```

### Étape 3 : Implémenter le handler

```python
# backend/app/routers/bdlisa.py
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import cached_response
from app.database import get_db

router = APIRouter(prefix="/api/v1/bdlisa", tags=["bdlisa"])

STATS_TTL = 21600  # 6h


@router.get("/stats")
async def get_bdlisa_stats(
    db: AsyncSession = Depends(get_db),
):
    async def fetch():
        query = """
            SELECT codes_bdlisa, count(*) AS nb_stations,
                   mode() WITHIN GROUP (ORDER BY classification_derniere_annee)
                       AS classification_dominante
            FROM gold.dim_piezo_stations
            WHERE codes_bdlisa IS NOT NULL
            GROUP BY codes_bdlisa
            ORDER BY codes_bdlisa
        """
        result = await db.execute(text(query))
        return [dict(row) for row in result.mappings().all()]

    return await cached_response("bdlisa_stats", {}, STATS_TTL, fetch)
```

**Règles importantes :**
- Toujours utiliser des **requêtes paramétrées** (`:param_name`) pour éviter les injections SQL
- Toujours envelopper la logique DB dans une fonction `async def fetch()` interne pour le cache
- Choisir le bon TTL en fonction de la fréquence de mise à jour des données

### Étape 4 : Enregistrer le router dans main.py

```python
# backend/app/main.py
from app.routers import stations, timeseries, trends, stats, era5, alerts, bdlisa  # ajout

app.include_router(bdlisa.router)  # ajout
```

### Étape 5 : Écrire un test

```python
# backend/tests/test_bdlisa.py
import pytest
from httpx import AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_get_bdlisa_stats():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/v1/bdlisa/stats")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    if data:
        assert "code_bdlisa" in data[0]
        assert "nb_stations" in data[0]
```

### Étape 6 : Documenter l'endpoint

Ajouter l'endpoint dans `docs/API.md` avec le même format que les autres endpoints.

---

## Ajouter une Nouvelle Page Frontend

Voici le processus complet pour ajouter une page, illustré par une page "Statistiques Départementales".

### Étape 1 : Créer le composant de page

```typescript
// frontend/src/pages/DepartmentsPage.tsx
import { useQuery } from '@tanstack/react-query'
import { getDepartmentStats } from '@/lib/api'
import type { DepartmentStats } from '@/lib/types'

export default function DepartmentsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['departmentStats'],
    queryFn: getDepartmentStats,
    staleTime: 1000 * 60 * 30, // 30 minutes
  })

  if (isLoading) {
    return <div className="p-8 text-gray-400">Chargement...</div>
  }

  if (error) {
    return <div className="p-8 text-red-400">Erreur de chargement</div>
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">
        Statistiques Départementales
      </h1>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-gray-300">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left p-3">Département</th>
              <th className="text-right p-3">Stations piézo</th>
              <th className="text-right p-3">Stations hydro</th>
              <th className="text-right p-3">% TRES_BAS</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((dept: DepartmentStats) => (
              <tr key={dept.code_departement}
                  className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="p-3">{dept.nom_departement}</td>
                <td className="text-right p-3">{dept.nb_piezo}</td>
                <td className="text-right p-3">{dept.nb_hydro}</td>
                <td className="text-right p-3">
                  {dept.pct_tres_bas?.toFixed(1) ?? '—'} %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

### Étape 2 : Ajouter la fonction API

```typescript
// frontend/src/lib/api.ts (ajout)
import type { DepartmentStats } from './types'

export async function getDepartmentStats(): Promise<DepartmentStats[]> {
  const res = await fetch('/api/v1/stats/departments')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
```

### Étape 3 : Ajouter le type si nécessaire

Le type `DepartmentStats` existe déjà dans `frontend/src/lib/types.ts`. Si le type n'existe pas, l'ajouter :

```typescript
// frontend/src/lib/types.ts (ajout si nécessaire)
export interface DepartmentStats {
  code_departement: string
  nom_departement: string
  nb_piezo: number
  nb_hydro: number
  pct_tres_bas: number | null
  avg_variation: number | null
}
```

### Étape 4 : Enregistrer la route

```typescript
// frontend/src/routes.tsx
import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { Layout } from './components/layout/Layout'

// Imports existants
const ObservatoryPage = lazy(() => import('./pages/ObservatoryPage'))
// ... autres pages

// Nouvel import
const DepartmentsPage = lazy(() => import('./pages/DepartmentsPage'))

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <SuspenseWrapper><ObservatoryPage /></SuspenseWrapper> },
      // ... autres routes
      { path: 'departments', element: <SuspenseWrapper><DepartmentsPage /></SuspenseWrapper> },
    ],
  },
])
```

### Étape 5 : Ajouter un lien dans la Sidebar

```typescript
// frontend/src/components/layout/Layout.tsx (ou Sidebar.tsx)
// Ajouter dans le menu de navigation :
<NavLink to="/departments">
  Statistiques Départementales
</NavLink>
```

### Étape 6 : Ajouter un hook personnalisé (optionnel mais recommandé)

Pour les pages complexes avec plusieurs requêtes ou de la logique réutilisable :

```typescript
// frontend/src/hooks/useDepartments.ts
import { useQuery } from '@tanstack/react-query'
import { getDepartmentStats } from '@/lib/api'

export function useDepartmentStats() {
  return useQuery({
    queryKey: ['departmentStats'],
    queryFn: getDepartmentStats,
    staleTime: 1000 * 60 * 30,
  })
}
```

---

## Workflow Git

```bash
# Créer une branche feature
git checkout -b feat/ma-fonctionnalite

# Développer, committer avec des messages conventionnels
git commit -m "feat: ajouter endpoint stats BDLISA"
git commit -m "fix: corriger pagination alerts"
git commit -m "docs: mettre à jour référence API"
git commit -m "refactor: extraire hook useFilters"

# Mettre à jour depuis main avant de PR
git fetch origin
git rebase origin/main

# Ouvrir une Pull Request
git push origin feat/ma-fonctionnalite
```

**Format des commits (Conventional Commits) :**

| Préfixe | Usage |
|---|---|
| `feat:` | Nouvelle fonctionnalité |
| `fix:` | Correction de bug |
| `docs:` | Documentation uniquement |
| `refactor:` | Refactoring sans changement de comportement |
| `perf:` | Amélioration de performance |
| `test:` | Ajout ou modification de tests |
| `chore:` | Maintenance (deps, config, CI) |

---

## Débogage

### Backend

**Logs en temps réel :**

```bash
uvicorn app.main:app --reload --log-level debug
```

**Inspecter le cache Redis :**

```bash
# Se connecter à Redis
redis-cli

# Lister les clés hydro
KEYS hydro:*

# Voir la valeur d'une clé
GET hydro:piezo_list:abcd1234ef567890

# TTL restant d'une clé
TTL hydro:piezo_list:abcd1234ef567890

# Vider tout le cache
FLUSHDB
```

**Tester un endpoint directement :**

```bash
curl -s http://localhost:8000/api/v1/health | python -m json.tool

curl -s "http://localhost:8000/api/v1/stations/piezo?limit=5" | python -m json.tool
```

### Frontend

**Console du navigateur :** TanStack Query DevTools est disponible en développement (si configuré dans `main.tsx`).

**Vérifier les requêtes réseau :** L'onglet "Réseau" des DevTools Chrome/Firefox montre toutes les requêtes `/api/*`.

**Inspecter le cache TanStack Query :**

Si `ReactQueryDevtools` est activé dans le projet :

```typescript
// main.tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

// Dans le JSX :
<ReactQueryDevtools initialIsOpen={false} />
```

---

## Variables d'Environnement de Développement

En développement, créer un fichier `.env` à la racine du projet. Le fichier backend le lit via `pydantic-settings`.

```env
# Base de données
DB_HOST=localhost
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=dev_password

# Cache (optionnel)
REDIS_URL=redis://localhost:6379/0

# CORS — autoriser le dev server Vite
ALLOWED_ORIGINS=["http://localhost:5173","http://localhost:3000"]

# Mode debug : active /docs, /redoc et logs détaillés
DEBUG=true
LOG_LEVEL=DEBUG
```

**Important :** Ne jamais committer le fichier `.env` avec des secrets de production. Le `.gitignore` doit contenir `.env`.
