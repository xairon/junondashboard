# Hydro Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a public-facing, state-of-the-art hydrology dashboard (React + FastAPI) visualizing ERA5 weather, piezometry, and hydrometry data from a PostgreSQL/TimescaleDB/PostGIS data warehouse.

**Architecture:** React SPA frontend communicating via REST with a FastAPI backend that reads from the gold schema of an existing data warehouse. Redis caches expensive queries. Docker Compose orchestrates all services behind Nginx.

**Tech Stack:** React 19, TypeScript, Vite, MapLibre GL JS, deck.gl, Recharts, shadcn/ui, Tailwind CSS 4, FastAPI, asyncpg, Redis, Docker Compose, Nginx

**Database:** PostgreSQL on `dib-2019006065:49502`, database `postgres`, gold schema. See `docs/plans/2026-03-02-hydro-dashboard-design.md` for full schema reference.

---

## Phase 1: Foundation & Scaffolding

### Task 1.1: Docker Compose & Environment

**Files:**
- Create: `docker-compose.yml`
- Create: `.env`
- Create: `.env.example`
- Create: `.gitignore`

**Step 1: Create .gitignore**

```gitignore
node_modules/
dist/
.env
__pycache__/
*.pyc
.venv/
.ruff_cache/
redis-data/
```

**Step 2: Create .env.example**

```env
# Database (existing warehouse)
DB_HOST=dib-2019006065
DB_PORT=49502
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=change_me

# Redis
REDIS_URL=redis://redis:6379/0

# API
API_HOST=0.0.0.0
API_PORT=8000

# Frontend
VITE_API_URL=http://localhost:8000/api/v1
```

**Step 3: Create .env from .env.example with real values**

Copy `.env.example` to `.env` and fill in the real database password: `<YOUR_DB_PASSWORD>`

**Step 4: Create docker-compose.yml**

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file: .env
    depends_on:
      redis:
        condition: service_healthy
    volumes:
      - ./backend/app:/app/app
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    volumes:
      - ./frontend/src:/app/src
      - ./frontend/index.html:/app/index.html
    command: npm run dev -- --host 0.0.0.0

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - backend
      - frontend

volumes:
  redis-data:
```

**Step 5: Create nginx/nginx.conf**

```nginx
server {
    listen 80;

    location /api/ {
        proxy_pass http://backend:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }

    location / {
        proxy_pass http://frontend:5173/;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

**Step 6: Commit**

```bash
git init
git add .gitignore .env.example docker-compose.yml nginx/nginx.conf
git commit -m "feat: project foundation with Docker Compose, Redis, Nginx"
```

---

### Task 1.2: Backend Scaffold (FastAPI)

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/app/database.py`
- Create: `backend/app/cache.py`

**Step 1: Create backend/pyproject.toml**

```toml
[project]
name = "hydro-dashboard-api"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "asyncpg>=0.30.0",
    "sqlalchemy[asyncio]>=2.0.0",
    "redis>=5.0.0",
    "pydantic>=2.0.0",
    "pydantic-settings>=2.0.0",
    "orjson>=3.10.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.24.0",
    "httpx>=0.27.0",
    "ruff>=0.8.0",
]

[tool.ruff]
line-length = 120
target-version = "py311"

[tool.pytest.ini_options]
asyncio_mode = "auto"
```

**Step 2: Create backend/Dockerfile**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY app/ app/

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Step 3: Create backend/app/config.py**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    db_host: str = "dib-2019006065"
    db_port: int = 49502
    db_name: str = "postgres"
    db_user: str = "postgres"
    db_password: str = ""
    redis_url: str = "redis://redis:6379/0"
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    @property
    def database_url(self) -> str:
        return f"postgresql+asyncpg://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"

    model_config = {"env_file": ".env"}


settings = Settings()
```

**Step 4: Create backend/app/database.py**

```python
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from app.config import settings

engine = create_async_engine(
    settings.database_url,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session
```

**Step 5: Create backend/app/cache.py**

```python
import hashlib
import json
from typing import Any

import redis.asyncio as redis
from app.config import settings

pool = redis.ConnectionPool.from_url(settings.redis_url, decode_responses=True)


def get_redis() -> redis.Redis:
    return redis.Redis(connection_pool=pool)


def cache_key(prefix: str, params: dict) -> str:
    raw = json.dumps(params, sort_keys=True, default=str)
    h = hashlib.md5(raw.encode()).hexdigest()[:12]
    return f"hydro:{prefix}:{h}"


async def cached(r: redis.Redis, key: str, ttl: int, fetch_fn):
    cached_val = await r.get(key)
    if cached_val:
        return json.loads(cached_val)
    result = await fetch_fn()
    await r.setex(key, ttl, json.dumps(result, default=str))
    return result
```

**Step 6: Create backend/app/main.py**

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(
    title="Hydro Dashboard API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/v1/health")
async def health():
    return {"status": "ok"}
```

**Step 7: Create empty `backend/app/__init__.py`**

**Step 8: Verify backend starts**

```bash
cd backend && pip install -e ".[dev]" && cd ..
python -m uvicorn backend.app.main:app --port 8000
# Visit http://localhost:8000/api/v1/health → {"status": "ok"}
```

**Step 9: Commit**

```bash
git add backend/
git commit -m "feat: FastAPI backend scaffold with asyncpg, Redis, config"
```

---

### Task 1.3: Frontend Scaffold (Vite + React + TypeScript)

**Files:**
- Create: `frontend/` (via Vite scaffold)
- Modify: `frontend/package.json` (add dependencies)
- Create: `frontend/Dockerfile`
- Modify: `frontend/tailwind.config.ts`
- Create: `frontend/src/lib/constants.ts`

**Step 1: Scaffold Vite React TypeScript project**

```bash
cd E:/hydro_dashboard
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

**Step 2: Install core dependencies**

```bash
cd E:/hydro_dashboard/frontend
npm install maplibre-gl @deck.gl/core @deck.gl/layers @deck.gl/mapbox recharts @tanstack/react-query react-router-dom framer-motion @radix-ui/react-slot class-variance-authority clsx tailwind-merge lucide-react
npm install -D tailwindcss @tailwindcss/vite
```

**Step 3: Configure Tailwind CSS 4**

Update `frontend/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
```

Replace `frontend/src/index.css` with:

```css
@import "tailwindcss";

@theme {
  --color-bg-primary: #0a0e1a;
  --color-bg-card: #111827;
  --color-bg-hover: #1f2937;
  --color-text-primary: #e5e7eb;
  --color-text-secondary: #9ca3af;
  --color-accent-cyan: #06b6d4;
  --color-accent-indigo: #6366f1;
  --color-status-tres-bas: #ef4444;
  --color-status-bas: #f97316;
  --color-status-normal: #10b981;
  --color-status-haut: #3b82f6;
  --color-status-tres-haut: #1d4ed8;
  --color-precip: oklch(0.7 0.15 230 / 0.3);
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
}
```

**Step 4: Create frontend/src/lib/constants.ts**

```typescript
export const CLASSIFICATION_COLORS: Record<string, string> = {
  TRES_BAS: '#ef4444',
  BAS: '#f97316',
  NORMAL: '#10b981',
  HAUT: '#3b82f6',
  TRES_HAUT: '#1d4ed8',
} as const

export const CLASSIFICATION_LABELS: Record<string, string> = {
  TRES_BAS: 'Très bas',
  BAS: 'Bas',
  NORMAL: 'Normal',
  HAUT: 'Haut',
  TRES_HAUT: 'Très haut',
} as const

export const API_BASE = '/api/v1'
```

**Step 5: Create frontend/Dockerfile**

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

**Step 6: Verify frontend starts**

```bash
cd E:/hydro_dashboard/frontend && npm run dev
# Visit http://localhost:5173 → Vite React page
```

**Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: React frontend scaffold with Vite, Tailwind, MapLibre, deck.gl"
```

---

## Phase 2: Backend API

### Task 2.1: Station Endpoints

**Files:**
- Create: `backend/app/models/station.py`
- Create: `backend/app/routers/stations.py`
- Modify: `backend/app/main.py` (register router)
- Create: `backend/app/queries/stations.sql`
- Create: `backend/tests/test_stations.py`

**Step 1: Create Pydantic models — `backend/app/models/station.py`**

```python
from pydantic import BaseModel
from datetime import date


class PiezoStationMap(BaseModel):
    code_bss: str
    latitude: float | None
    longitude: float | None
    nom_commune: str | None
    code_departement: str | None
    nom_departement: str | None
    libelle_eh: str | None
    niveau_alerte: str | None
    tendance_classification: str | None
    classification_derniere_annee: str | None
    niveau_moyen_global: float | None
    niveau_derniere_annee: float | None
    premiere_mesure: date | None
    derniere_mesure: date | None
    nb_mesures_total: float | None


class HydroStationMap(BaseModel):
    code_station: str
    latitude: float | None
    longitude: float | None
    code_departement: str | None
    nom_departement: str | None
    libelle_station: str | None
    libelle_cours_eau: str | None
    grandeur_hydro_principale: str | None
    classification_resultat_dern_annee: str | None
    resultat_moyen_global: float | None
    premiere_mesure: date | None
    derniere_mesure: date | None
    nb_jours_total: float | None


class PiezoStationDetail(BaseModel):
    """Full detail from dim_piezo_stations."""
    code_bss: str
    bss_id: str | None
    nom_commune: str | None
    code_departement: str | None
    nom_departement: str | None
    codes_bdlisa: str | None
    altitude_station: float | None
    longitude: float | None
    latitude: float | None
    date_debut_mesure: date | None
    date_fin_mesure: date | None
    nb_mesures_total: float | None
    nb_mois_total: int | None
    premiere_mesure: date | None
    derniere_mesure: date | None
    niveau_moyen_global: float | None
    niveau_min_absolu: float | None
    niveau_max_absolu: float | None
    niveau_stddev_global: float | None
    amplitude_totale: float | None
    profondeur_moyenne_globale: float | None
    temperature_moyenne_globale: float | None
    precipitation_moyenne_mensuelle: float | None
    derniere_annee: int | None
    niveau_derniere_annee: float | None
    classification_derniere_annee: str | None
    percentile_derniere_annee: float | None
    slope_niveau: float | None
    r2_niveau: float | None
    slope_precipitation: float | None
    nb_mois_tendance: int | None
    tendance_classification: str | None
    niveau_alerte: str | None
    qualite_tendance: str | None


class HydroStationDetail(BaseModel):
    """Full detail from dim_hydro_stations."""
    code_station: str
    libelle_station: str | None
    code_site: str | None
    libelle_site: str | None
    code_cours_eau: str | None
    nom_cours_eau: str | None
    code_departement: str | None
    nom_departement: str | None
    date_ouverture_station: date | None
    longitude_station: float | None
    latitude_station: float | None
    grandeur_hydro_principale: str | None
    premiere_mesure: date | None
    derniere_mesure: date | None
    nb_jours_total: float | None
    nb_mois_total: int | None
    resultat_moyen_global: float | None
    resultat_min_global: float | None
    resultat_max_global: float | None
    resultat_stddev_global: float | None
    annee_dernier_bilan: int | None
    resultat_moyen_dern_annee: float | None
    classification_resultat_dern_annee: str | None
    percentile_resultat_dern_annee: float | None


class StationFilters(BaseModel):
    min_observations: int | None = None
    last_measurement_after: date | None = None
    classification: list[str] | None = None
    code_departement: str | None = None
```

**Step 2: Create router — `backend/app/routers/stations.py`**

```python
from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.cache import get_redis, cache_key, cached
from app.models.station import (
    PiezoStationMap, HydroStationMap,
    PiezoStationDetail, HydroStationDetail,
)

router = APIRouter(prefix="/api/v1/stations", tags=["stations"])


@router.get("/piezo", response_model=list[PiezoStationMap])
async def list_piezo_stations(
    min_observations: int | None = Query(None, ge=0),
    last_measurement_after: date | None = Query(None),
    classification: list[str] | None = Query(None),
    code_departement: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    r = get_redis()
    params = {
        "min_obs": min_observations,
        "last_after": last_measurement_after,
        "classif": classification,
        "dept": code_departement,
    }
    key = cache_key("stations_piezo", params)

    async def fetch():
        conditions = ["1=1"]
        bind = {}
        if min_observations is not None:
            conditions.append("nb_mesures_total >= :min_obs")
            bind["min_obs"] = min_observations
        if last_measurement_after is not None:
            conditions.append("derniere_mesure >= :last_after")
            bind["last_after"] = last_measurement_after
        if classification:
            conditions.append("classification_derniere_annee = ANY(:classif)")
            bind["classif"] = classification
        if code_departement:
            conditions.append("code_departement = :dept")
            bind["dept"] = code_departement

        where = " AND ".join(conditions)
        query = text(f"""
            SELECT code_bss, latitude, longitude, nom_commune, code_departement,
                   nom_departement, libelle_eh, niveau_alerte, tendance_classification,
                   classification_derniere_annee, niveau_moyen_global, niveau_derniere_annee,
                   premiere_mesure, derniere_mesure, nb_mesures_total
            FROM gold.stations_piezo_carte
            WHERE {where}
            ORDER BY code_bss
        """)
        result = await db.execute(query, bind)
        return [dict(row._mapping) for row in result.fetchall()]

    data = await cached(r, key, 3600, fetch)
    return data


@router.get("/hydro", response_model=list[HydroStationMap])
async def list_hydro_stations(
    min_observations: int | None = Query(None, ge=0),
    last_measurement_after: date | None = Query(None),
    classification: list[str] | None = Query(None),
    code_departement: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    r = get_redis()
    params = {
        "min_obs": min_observations,
        "last_after": last_measurement_after,
        "classif": classification,
        "dept": code_departement,
    }
    key = cache_key("stations_hydro", params)

    async def fetch():
        conditions = ["1=1"]
        bind = {}
        if min_observations is not None:
            conditions.append("nb_jours_total >= :min_obs")
            bind["min_obs"] = min_observations
        if last_measurement_after is not None:
            conditions.append("derniere_mesure >= :last_after")
            bind["last_after"] = last_measurement_after
        if classification:
            conditions.append("classification_resultat_dern_annee = ANY(:classif)")
            bind["classif"] = classification
        if code_departement:
            conditions.append("code_departement = :dept")
            bind["dept"] = code_departement

        where = " AND ".join(conditions)
        query = text(f"""
            SELECT code_station, latitude, longitude, code_departement, nom_departement,
                   libelle_station, libelle_cours_eau, grandeur_hydro_principale,
                   classification_resultat_dern_annee, resultat_moyen_global,
                   premiere_mesure, derniere_mesure, nb_jours_total
            FROM gold.stations_hydro_carte
            WHERE {where}
            ORDER BY code_station
        """)
        result = await db.execute(query, bind)
        return [dict(row._mapping) for row in result.fetchall()]

    data = await cached(r, key, 3600, fetch)
    return data


@router.get("/piezo/{code_bss}", response_model=PiezoStationDetail)
async def get_piezo_station(code_bss: str, db: AsyncSession = Depends(get_db)):
    r = get_redis()
    key = cache_key("station_piezo_detail", {"code": code_bss})

    async def fetch():
        query = text("SELECT * FROM gold.dim_piezo_stations WHERE code_bss = :code")
        result = await db.execute(query, {"code": code_bss})
        row = result.fetchone()
        if not row:
            return None
        return dict(row._mapping)

    data = await cached(r, key, 3600, fetch)
    if data is None:
        from fastapi import HTTPException
        raise HTTPException(404, f"Station {code_bss} not found")
    return data


@router.get("/hydro/{code_station}", response_model=HydroStationDetail)
async def get_hydro_station(code_station: str, db: AsyncSession = Depends(get_db)):
    r = get_redis()
    key = cache_key("station_hydro_detail", {"code": code_station})

    async def fetch():
        query = text("SELECT * FROM gold.dim_hydro_stations WHERE code_station = :code")
        result = await db.execute(query, {"code": code_station})
        row = result.fetchone()
        if not row:
            return None
        return dict(row._mapping)

    data = await cached(r, key, 3600, fetch)
    if data is None:
        from fastapi import HTTPException
        raise HTTPException(404, f"Station {code_station} not found")
    return data
```

**Step 3: Register router in main.py**

Add to `backend/app/main.py`:

```python
from app.routers import stations

app.include_router(stations.router)
```

**Step 4: Test endpoint manually**

```bash
# Start backend locally
cd E:/hydro_dashboard/backend
uvicorn app.main:app --reload --port 8000
# GET http://localhost:8000/api/v1/stations/piezo?min_observations=1000
# Should return list of stations
```

**Step 5: Commit**

```bash
git add backend/
git commit -m "feat: station list and detail API endpoints with Redis caching"
```

---

### Task 2.2: Timeseries Endpoints

**Files:**
- Create: `backend/app/models/timeseries.py`
- Create: `backend/app/routers/timeseries.py`
- Modify: `backend/app/main.py` (register router)

**Step 1: Create models — `backend/app/models/timeseries.py`**

```python
from pydantic import BaseModel
from datetime import date


class DailyPiezoMeasurement(BaseModel):
    date: date
    niveau_nappe_eau: float | None
    profondeur_nappe: float | None
    temperature_2m: float | None
    total_precipitation: float | None
    potential_evaporation: float | None


class DailyHydroMeasurement(BaseModel):
    date: date
    resultat_obs_elab: float | None
    grandeur_hydro_elab: str
    temperature_2m: float | None
    total_precipitation: float | None
    potential_evaporation: float | None


class MonthlyPiezoMeasurement(BaseModel):
    mois: date
    niveau_moyen: float | None
    niveau_min: float | None
    niveau_max: float | None
    amplitude_mensuelle: float | None
    temperature_moyenne: float | None
    precipitation_totale: float | None
    evaporation_moyenne: float | None
    nb_jours_mesures: int | None
    niveau_moy_mobile_3m: float | None
    niveau_moy_mobile_12m: float | None
    precipitation_moy_mobile_12m: float | None
    variation_niveau_vs_mois_prec: float | None
    variation_niveau_vs_annee_prec: float | None


class MonthlyHydroMeasurement(BaseModel):
    mois: date
    resultat_moyen: float | None
    resultat_min: float | None
    resultat_max: float | None
    amplitude_mensuelle: float | None
    temperature_moyenne: float | None
    precipitation_totale: float | None
    evaporation_moyenne: float | None
    nb_jours_mesures: int | None
    resultat_moy_mobile_3m: float | None
    resultat_moy_mobile_12m: float | None
    precipitation_moy_mobile_12m: float | None
    variation_resultat_vs_mois_prec: float | None
    variation_resultat_vs_annee_prec: float | None


class YearlyPiezoStats(BaseModel):
    annee: int
    niveau_moyen_annuel: float | None
    niveau_min_annuel: float | None
    niveau_max_annuel: float | None
    amplitude_annuelle: float | None
    temperature_moyenne_annuelle: float | None
    precipitation_totale_annuelle: float | None
    bilan_hydrique_annuel: float | None
    nb_jours_mesures_annuel: float | None
    percentile_niveau_historique: float | None
    classification_niveau_annuel: str | None
    niveau_moy_mobile_5ans: float | None


class YearlyHydroStats(BaseModel):
    annee: int
    resultat_moyen_annuel: float | None
    resultat_min_annuel: float | None
    resultat_max_annuel: float | None
    amplitude_annuelle: float | None
    temperature_moyenne_annuelle: float | None
    precipitation_totale_annuelle: float | None
    nb_jours_mesures_annuel: float | None
    percentile_resultat_historique: float | None
    classification_resultat_annuel: str | None
```

**Step 2: Create router — `backend/app/routers/timeseries.py`**

```python
from datetime import date
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.cache import get_redis, cache_key, cached
from app.models.timeseries import (
    DailyPiezoMeasurement, DailyHydroMeasurement,
    MonthlyPiezoMeasurement, MonthlyHydroMeasurement,
    YearlyPiezoStats, YearlyHydroStats,
)

router = APIRouter(prefix="/api/v1/timeseries", tags=["timeseries"])


@router.get("/piezo/{code_bss}", response_model=list[DailyPiezoMeasurement])
async def get_piezo_daily(
    code_bss: str,
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    r = get_redis()
    params = {"code": code_bss, "start": start_date, "end": end_date}
    key = cache_key("ts_piezo_daily", params)

    async def fetch():
        conditions = ["code_bss = :code"]
        bind = {"code": code_bss}
        if start_date:
            conditions.append("date >= :start")
            bind["start"] = start_date
        if end_date:
            conditions.append("date <= :end")
            bind["end"] = end_date
        where = " AND ".join(conditions)
        query = text(f"""
            SELECT date, niveau_nappe_eau, profondeur_nappe,
                   temperature_2m, total_precipitation, potential_evaporation
            FROM gold.hubeau_daily_chroniques
            WHERE {where}
            ORDER BY date
        """)
        result = await db.execute(query, bind)
        return [dict(row._mapping) for row in result.fetchall()]

    return await cached(r, key, 300, fetch)


@router.get("/hydro/{code_station}", response_model=list[DailyHydroMeasurement])
async def get_hydro_daily(
    code_station: str,
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    r = get_redis()
    params = {"code": code_station, "start": start_date, "end": end_date}
    key = cache_key("ts_hydro_daily", params)

    async def fetch():
        conditions = ["code_station = :code"]
        bind = {"code": code_station}
        if start_date:
            conditions.append("date >= :start")
            bind["start"] = start_date
        if end_date:
            conditions.append("date <= :end")
            bind["end"] = end_date
        where = " AND ".join(conditions)
        query = text(f"""
            SELECT date, resultat_obs_elab, grandeur_hydro_elab,
                   temperature_2m, total_precipitation, potential_evaporation
            FROM gold.hydro_daily_chroniques
            WHERE {where}
            ORDER BY date
        """)
        result = await db.execute(query, bind)
        return [dict(row._mapping) for row in result.fetchall()]

    return await cached(r, key, 300, fetch)


@router.get("/monthly/piezo/{code_bss}", response_model=list[MonthlyPiezoMeasurement])
async def get_piezo_monthly(code_bss: str, db: AsyncSession = Depends(get_db)):
    r = get_redis()
    key = cache_key("ts_piezo_monthly", {"code": code_bss})

    async def fetch():
        query = text("""
            SELECT mois, niveau_moyen, niveau_min, niveau_max, amplitude_mensuelle,
                   temperature_moyenne, precipitation_totale, evaporation_moyenne,
                   nb_jours_mesures, niveau_moy_mobile_3m, niveau_moy_mobile_12m,
                   precipitation_moy_mobile_12m, variation_niveau_vs_mois_prec,
                   variation_niveau_vs_annee_prec
            FROM gold.fct_monthly_chroniques
            WHERE code_bss = :code
            ORDER BY mois
        """)
        result = await db.execute(query, {"code": code_bss})
        return [dict(row._mapping) for row in result.fetchall()]

    return await cached(r, key, 1800, fetch)


@router.get("/monthly/hydro/{code_station}", response_model=list[MonthlyHydroMeasurement])
async def get_hydro_monthly(code_station: str, db: AsyncSession = Depends(get_db)):
    r = get_redis()
    key = cache_key("ts_hydro_monthly", {"code": code_station})

    async def fetch():
        query = text("""
            SELECT mois, resultat_moyen, resultat_min, resultat_max, amplitude_mensuelle,
                   temperature_moyenne, precipitation_totale, evaporation_moyenne,
                   nb_jours_mesures, resultat_moy_mobile_3m, resultat_moy_mobile_12m,
                   precipitation_moy_mobile_12m, variation_resultat_vs_mois_prec,
                   variation_resultat_vs_annee_prec
            FROM gold.fct_monthly_hydro
            WHERE code_station = :code
            ORDER BY mois
        """)
        result = await db.execute(query, {"code": code_station})
        return [dict(row._mapping) for row in result.fetchall()]

    return await cached(r, key, 1800, fetch)


@router.get("/yearly/piezo/{code_bss}", response_model=list[YearlyPiezoStats])
async def get_piezo_yearly(code_bss: str, db: AsyncSession = Depends(get_db)):
    r = get_redis()
    key = cache_key("ts_piezo_yearly", {"code": code_bss})

    async def fetch():
        query = text("""
            SELECT annee, niveau_moyen_annuel, niveau_min_annuel, niveau_max_annuel,
                   amplitude_annuelle, temperature_moyenne_annuelle,
                   precipitation_totale_annuelle, bilan_hydrique_annuel,
                   nb_jours_mesures_annuel, percentile_niveau_historique,
                   classification_niveau_annuel, niveau_moy_mobile_5ans
            FROM gold.fct_yearly_stats
            WHERE code_bss = :code
            ORDER BY annee
        """)
        result = await db.execute(query, {"code": code_bss})
        return [dict(row._mapping) for row in result.fetchall()]

    return await cached(r, key, 3600, fetch)


@router.get("/yearly/hydro/{code_station}", response_model=list[YearlyHydroStats])
async def get_hydro_yearly(code_station: str, db: AsyncSession = Depends(get_db)):
    r = get_redis()
    key = cache_key("ts_hydro_yearly", {"code": code_station})

    async def fetch():
        query = text("""
            SELECT annee, resultat_moyen_annuel, resultat_min_annuel, resultat_max_annuel,
                   amplitude_annuelle, temperature_moyenne_annuelle,
                   precipitation_totale_annuelle, nb_jours_mesures_annuel,
                   percentile_resultat_historique, classification_resultat_annuel
            FROM gold.fct_yearly_hydro
            WHERE code_station = :code
            ORDER BY annee
        """)
        result = await db.execute(query, {"code": code_station})
        return [dict(row._mapping) for row in result.fetchall()]

    return await cached(r, key, 3600, fetch)
```

**Step 3: Register router in main.py**

Add `from app.routers import timeseries` and `app.include_router(timeseries.router)`

**Step 4: Commit**

```bash
git add backend/
git commit -m "feat: timeseries endpoints (daily, monthly, yearly) for piezo and hydro"
```

---

### Task 2.3: Trends, Stats, and ERA5 Endpoints

**Files:**
- Create: `backend/app/routers/trends.py`
- Create: `backend/app/routers/stats.py`
- Create: `backend/app/routers/era5.py`
- Modify: `backend/app/main.py` (register routers)

**Step 1: Create trends router — `backend/app/routers/trends.py`**

```python
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.cache import get_redis, cache_key, cached

router = APIRouter(prefix="/api/v1/trends", tags=["trends"])


class PiezoTrend(BaseModel):
    code_bss: str
    saison: str
    code_departement: str | None
    nom_departement: str | None
    variation_annuelle_m: float | None
    fiabilite_tendance: float | None
    nb_points: int | None
    classification_tendance: str | None
    projection_variation_5ans_m: float | None


class HydroTrend(BaseModel):
    code_station: str
    grandeur_hydro_elab: str
    saison: str
    code_departement: str | None
    nom_departement: str | None
    variation_annuelle: float | None
    fiabilite_tendance: float | None
    nb_points: int | None
    classification_tendance: str | None
    projection_variation_5ans: float | None


@router.get("/piezo", response_model=list[PiezoTrend])
async def get_piezo_trends(
    saison: str | None = Query(None),
    code_departement: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    r = get_redis()
    params = {"saison": saison, "dept": code_departement}
    key = cache_key("trends_piezo", params)

    async def fetch():
        conditions = ["1=1"]
        bind = {}
        if saison:
            conditions.append("saison = :saison")
            bind["saison"] = saison
        if code_departement:
            conditions.append("code_departement = :dept")
            bind["dept"] = code_departement
        where = " AND ".join(conditions)
        query = text(f"SELECT * FROM gold.agg_station_trends WHERE {where} ORDER BY code_bss")
        result = await db.execute(query, bind)
        return [dict(row._mapping) for row in result.fetchall()]

    return await cached(r, key, 3600, fetch)


@router.get("/hydro", response_model=list[HydroTrend])
async def get_hydro_trends(
    saison: str | None = Query(None),
    code_departement: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    r = get_redis()
    params = {"saison": saison, "dept": code_departement}
    key = cache_key("trends_hydro", params)

    async def fetch():
        conditions = ["1=1"]
        bind = {}
        if saison:
            conditions.append("saison = :saison")
            bind["saison"] = saison
        if code_departement:
            conditions.append("code_departement = :dept")
            bind["dept"] = code_departement
        where = " AND ".join(conditions)
        query = text(f"SELECT * FROM gold.agg_hydro_trends WHERE {where} ORDER BY code_station")
        result = await db.execute(query, bind)
        return [dict(row._mapping) for row in result.fetchall()]

    return await cached(r, key, 3600, fetch)
```

**Step 2: Create stats router — `backend/app/routers/stats.py`**

```python
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.cache import get_redis, cache_key, cached

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])


class NationalStats(BaseModel):
    total_piezo: int
    total_hydro: int
    piezo_tres_bas: int
    piezo_bas: int
    piezo_normal: int
    piezo_haut: int
    piezo_tres_haut: int
    piezo_no_class: int


class DepartmentStats(BaseModel):
    code_departement: str
    nom_departement: str | None
    nb_piezo: int
    nb_hydro: int
    pct_tres_bas: float | None
    avg_variation: float | None


@router.get("/national", response_model=NationalStats)
async def get_national_stats(db: AsyncSession = Depends(get_db)):
    r = get_redis()
    key = cache_key("stats_national", {})

    async def fetch():
        query = text("""
            SELECT
                (SELECT count(*) FROM gold.dim_piezo_stations) AS total_piezo,
                (SELECT count(*) FROM gold.dim_hydro_stations) AS total_hydro,
                (SELECT count(*) FROM gold.dim_piezo_stations WHERE classification_derniere_annee = 'TRES_BAS') AS piezo_tres_bas,
                (SELECT count(*) FROM gold.dim_piezo_stations WHERE classification_derniere_annee = 'BAS') AS piezo_bas,
                (SELECT count(*) FROM gold.dim_piezo_stations WHERE classification_derniere_annee = 'NORMAL') AS piezo_normal,
                (SELECT count(*) FROM gold.dim_piezo_stations WHERE classification_derniere_annee = 'HAUT') AS piezo_haut,
                (SELECT count(*) FROM gold.dim_piezo_stations WHERE classification_derniere_annee = 'TRES_HAUT') AS piezo_tres_haut,
                (SELECT count(*) FROM gold.dim_piezo_stations WHERE classification_derniere_annee IS NULL) AS piezo_no_class
        """)
        result = await db.execute(query)
        return dict(result.fetchone()._mapping)

    return await cached(r, key, 3600, fetch)


@router.get("/departments", response_model=list[DepartmentStats])
async def get_department_stats(db: AsyncSession = Depends(get_db)):
    r = get_redis()
    key = cache_key("stats_departments", {})

    async def fetch():
        query = text("""
            WITH piezo AS (
                SELECT code_departement, nom_departement,
                       count(*) AS nb,
                       count(*) FILTER (WHERE classification_derniere_annee = 'TRES_BAS') AS tres_bas
                FROM gold.dim_piezo_stations
                WHERE code_departement IS NOT NULL
                GROUP BY code_departement, nom_departement
            ),
            hydro AS (
                SELECT code_departement, count(*) AS nb
                FROM gold.dim_hydro_stations
                WHERE code_departement IS NOT NULL
                GROUP BY code_departement
            ),
            trends AS (
                SELECT code_departement, avg(variation_annuelle_m) AS avg_var
                FROM gold.agg_station_trends
                WHERE saison = 'annuel'
                GROUP BY code_departement
            )
            SELECT p.code_departement, p.nom_departement,
                   p.nb AS nb_piezo, COALESCE(h.nb, 0) AS nb_hydro,
                   ROUND(p.tres_bas::numeric / NULLIF(p.nb, 0) * 100, 1) AS pct_tres_bas,
                   t.avg_var AS avg_variation
            FROM piezo p
            LEFT JOIN hydro h ON p.code_departement = h.code_departement
            LEFT JOIN trends t ON p.code_departement = t.code_departement
            ORDER BY p.code_departement
        """)
        result = await db.execute(query)
        return [dict(row._mapping) for row in result.fetchall()]

    return await cached(r, key, 3600, fetch)
```

**Step 3: Create ERA5 router — `backend/app/routers/era5.py`**

```python
from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.cache import get_redis, cache_key, cached

router = APIRouter(prefix="/api/v1/era5", tags=["era5"])


class ERA5GridPoint(BaseModel):
    era5_latitude: float
    era5_longitude: float


class ERA5Snapshot(BaseModel):
    era5_latitude: float
    era5_longitude: float
    temperature_2m: float | None
    total_precipitation: float | None
    potential_evaporation: float | None


@router.get("/grid", response_model=list[ERA5GridPoint])
async def get_era5_grid(db: AsyncSession = Depends(get_db)):
    r = get_redis()
    key = cache_key("era5_grid", {})

    async def fetch():
        query = text("SELECT era5_latitude, era5_longitude FROM gold.int_era5_grid_points ORDER BY era5_latitude, era5_longitude")
        result = await db.execute(query)
        return [dict(row._mapping) for row in result.fetchall()]

    return await cached(r, key, 86400, fetch)


@router.get("/snapshot", response_model=list[ERA5Snapshot])
async def get_era5_snapshot(
    target_date: date = Query(..., alias="date"),
    db: AsyncSession = Depends(get_db),
):
    """Get ERA5 values for all grid points on a specific date."""
    r = get_redis()
    key = cache_key("era5_snapshot", {"date": target_date})

    async def fetch():
        query = text("""
            SELECT latitude AS era5_latitude, longitude AS era5_longitude,
                   temperature_2m, total_precipitation, potential_evaporation
            FROM gold.int_era5_for_stations
            WHERE era5_date = :d
            ORDER BY latitude, longitude
        """)
        result = await db.execute(query, {"d": target_date})
        return [dict(row._mapping) for row in result.fetchall()]

    return await cached(r, key, 86400, fetch)
```

**Step 4: Register all routers in main.py**

```python
from app.routers import stations, timeseries, trends, stats, era5

app.include_router(stations.router)
app.include_router(timeseries.router)
app.include_router(trends.router)
app.include_router(stats.router)
app.include_router(era5.router)
```

**Step 5: Commit**

```bash
git add backend/
git commit -m "feat: trends, stats, and ERA5 API endpoints"
```

---

## Phase 3: Frontend Shell

### Task 3.1: Layout, Routing, and Theme

**Files:**
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/routes.tsx`
- Create: `frontend/src/components/layout/Layout.tsx`
- Create: `frontend/src/components/layout/Sidebar.tsx`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/hooks/useFilters.ts`
- Create: `frontend/src/pages/ObservatoryPage.tsx`
- Create: `frontend/src/pages/StationPage.tsx`
- Create: `frontend/src/pages/TrendsPage.tsx`
- Create: `frontend/src/pages/AlertsPage.tsx`
- Create: `frontend/src/pages/ComparePage.tsx`

**Step 1: Create API client — `frontend/src/lib/api.ts`**

```typescript
import { API_BASE } from './constants'

async function fetchJson<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, v)
    })
  }
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export const api = {
  stations: {
    piezo: (params?: Record<string, string | undefined>) => fetchJson<any[]>('/stations/piezo', params),
    hydro: (params?: Record<string, string | undefined>) => fetchJson<any[]>('/stations/hydro', params),
    piezoDetail: (code: string) => fetchJson<any>(`/stations/piezo/${code}`),
    hydroDetail: (code: string) => fetchJson<any>(`/stations/hydro/${code}`),
  },
  timeseries: {
    piezoDaiiy: (code: string, params?: Record<string, string | undefined>) =>
      fetchJson<any[]>(`/timeseries/piezo/${code}`, params),
    hydroDaily: (code: string, params?: Record<string, string | undefined>) =>
      fetchJson<any[]>(`/timeseries/hydro/${code}`, params),
    piezoMonthly: (code: string) => fetchJson<any[]>(`/timeseries/monthly/piezo/${code}`),
    hydroMonthly: (code: string) => fetchJson<any[]>(`/timeseries/monthly/hydro/${code}`),
    piezoYearly: (code: string) => fetchJson<any[]>(`/timeseries/yearly/piezo/${code}`),
    hydroYearly: (code: string) => fetchJson<any[]>(`/timeseries/yearly/hydro/${code}`),
  },
  trends: {
    piezo: (params?: Record<string, string | undefined>) => fetchJson<any[]>('/trends/piezo', params),
    hydro: (params?: Record<string, string | undefined>) => fetchJson<any[]>('/trends/hydro', params),
  },
  stats: {
    national: () => fetchJson<any>('/stats/national'),
    departments: () => fetchJson<any[]>('/stats/departments'),
  },
  era5: {
    grid: () => fetchJson<any[]>('/era5/grid'),
    snapshot: (date: string) => fetchJson<any[]>('/era5/snapshot', { date }),
  },
}
```

**Step 2: Create Layout — `frontend/src/components/layout/Layout.tsx`**

```tsx
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function Layout() {
  return (
    <div className="flex h-screen bg-bg-primary text-text-primary font-sans">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
```

**Step 3: Create Sidebar — `frontend/src/components/layout/Sidebar.tsx`**

```tsx
import { NavLink } from 'react-router-dom'
import { Map, LineChart, TrendingUp, AlertTriangle, GitCompare } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', icon: Map, label: 'Observatoire' },
  { to: '/trends', icon: TrendingUp, label: 'Tendances' },
  { to: '/alerts', icon: AlertTriangle, label: 'Alertes' },
  { to: '/compare', icon: GitCompare, label: 'Comparer' },
] as const

export function Sidebar() {
  return (
    <nav className="w-16 hover:w-48 transition-all duration-300 bg-bg-card border-r border-white/5 flex flex-col items-center py-4 gap-1 group overflow-hidden">
      <div className="mb-6 flex items-center gap-3 px-3 w-full">
        <div className="w-10 h-10 rounded-lg bg-accent-cyan/20 flex items-center justify-center shrink-0">
          <span className="text-accent-cyan font-bold text-lg">H</span>
        </div>
        <span className="text-sm font-semibold text-text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          Hydro Dashboard
        </span>
      </div>

      {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg w-full transition-colors ${
              isActive
                ? 'bg-accent-cyan/10 text-accent-cyan'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
            }`
          }
        >
          <Icon className="w-5 h-5 shrink-0" />
          <span className="text-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            {label}
          </span>
        </NavLink>
      ))}
    </nav>
  )
}
```

**Step 4: Create placeholder pages**

Each page file (`ObservatoryPage.tsx`, `StationPage.tsx`, `TrendsPage.tsx`, `AlertsPage.tsx`, `ComparePage.tsx`) starts as:

```tsx
export default function XxxPage() {
  return (
    <div className="flex items-center justify-center h-full text-text-secondary">
      <p>Page name — coming soon</p>
    </div>
  )
}
```

**Step 5: Create routes — `frontend/src/routes.tsx`**

```tsx
import { createBrowserRouter } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import ObservatoryPage from './pages/ObservatoryPage'
import StationPage from './pages/StationPage'
import TrendsPage from './pages/TrendsPage'
import AlertsPage from './pages/AlertsPage'
import ComparePage from './pages/ComparePage'

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <ObservatoryPage /> },
      { path: '/station/piezo/:code', element: <StationPage /> },
      { path: '/station/hydro/:code', element: <StationPage /> },
      { path: '/trends', element: <TrendsPage /> },
      { path: '/alerts', element: <AlertsPage /> },
      { path: '/compare', element: <ComparePage /> },
    ],
  },
])
```

**Step 6: Update App.tsx**

```tsx
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { router } from './routes'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
```

**Step 7: Verify**

```bash
cd E:/hydro_dashboard/frontend && npm run dev
# Navigate to http://localhost:5173 — should see sidebar + placeholder pages
```

**Step 8: Commit**

```bash
git add frontend/
git commit -m "feat: frontend shell with routing, sidebar, layout, API client"
```

---

## Phase 4: Observatory Map (Core View)

### Task 4.1: MapLibre Base Map

**Files:**
- Create: `frontend/src/components/map/ObservatoryMap.tsx`
- Modify: `frontend/src/pages/ObservatoryPage.tsx`

**Step 1: Create ObservatoryMap component**

```tsx
import { useRef, useEffect, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const FRANCE_CENTER: [number, number] = [2.5, 46.5]
const FRANCE_ZOOM = 5.5

export function ObservatoryMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: FRANCE_CENTER,
      zoom: FRANCE_ZOOM,
      maxBounds: [[-10, 40], [15, 52]],
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map
    return () => { map.remove() }
  }, [])

  return <div ref={containerRef} className="w-full h-full" />
}
```

**Step 2: Update ObservatoryPage**

```tsx
import { ObservatoryMap } from '../components/map/ObservatoryMap'

export default function ObservatoryPage() {
  return (
    <div className="relative h-full">
      <ObservatoryMap />
    </div>
  )
}
```

**Step 3: Verify map renders**

```bash
cd E:/hydro_dashboard/frontend && npm run dev
# Open http://localhost:5173 — dark map of France should display
```

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: MapLibre dark basemap on Observatory page"
```

---

### Task 4.2: Station Layers with deck.gl

**Files:**
- Create: `frontend/src/hooks/useStations.ts`
- Create: `frontend/src/components/map/StationLayer.tsx`
- Modify: `frontend/src/components/map/ObservatoryMap.tsx`
- Create: `frontend/src/components/station/ClassificationBadge.tsx`

**Step 1: Create useStations hook**

```typescript
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function usePiezoStations(filters?: Record<string, string | undefined>) {
  return useQuery({
    queryKey: ['stations', 'piezo', filters],
    queryFn: () => api.stations.piezo(filters),
  })
}

export function useHydroStations(filters?: Record<string, string | undefined>) {
  return useQuery({
    queryKey: ['stations', 'hydro', filters],
    queryFn: () => api.stations.hydro(filters),
  })
}
```

**Step 2: Create StationLayer with deck.gl overlay**

Use deck.gl `MapboxOverlay` (compatible with MapLibre) to render ScatterplotLayers for piezo and hydro stations. Color each dot by `classification_derniere_annee` using `CLASSIFICATION_COLORS`. On click, emit station code to parent.

**Step 3: Create ClassificationBadge**

```tsx
import { CLASSIFICATION_COLORS, CLASSIFICATION_LABELS } from '../../lib/constants'

export function ClassificationBadge({ classification }: { classification: string | null }) {
  if (!classification) return <span className="text-text-secondary text-xs">N/A</span>
  const color = CLASSIFICATION_COLORS[classification] ?? '#6b7280'
  const label = CLASSIFICATION_LABELS[classification] ?? classification
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${color}20`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}
```

**Step 4: Integrate into ObservatoryMap — add deck.gl overlay on map load, fetch stations via hooks, render layers**

**Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat: deck.gl station layers on map with classification colors"
```

---

### Task 4.3: Station Popup and KPI Bar

**Files:**
- Create: `frontend/src/components/map/StationPopup.tsx`
- Create: `frontend/src/components/map/KPIBar.tsx`
- Modify: `frontend/src/pages/ObservatoryPage.tsx`

**Step 1: Create StationPopup** — shown on station click, displays station name, classification badge, level, trend, link to detail page.

**Step 2: Create KPIBar** — bottom bar with national stats (total piezo, total hydro, counts by classification). Uses `useQuery` calling `api.stats.national()`.

**Step 3: Integrate into ObservatoryPage**

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: station popup and national KPI bar on Observatory"
```

---

### Task 4.4: Search Bar with Autocomplete

**Files:**
- Create: `frontend/src/components/map/SearchBar.tsx`
- Modify: `frontend/src/pages/ObservatoryPage.tsx`

**Step 1: Create SearchBar** — input with debounced search (300ms), filters locally from already-loaded station data. Shows dropdown with matching station names. On select, flies map to station location and opens popup.

**Step 2: Commit**

```bash
git add frontend/src/
git commit -m "feat: search bar with autocomplete on Observatory map"
```

---

### Task 4.5: Temporal Slider for ERA5

**Files:**
- Create: `frontend/src/components/map/TemporalSlider.tsx`
- Create: `frontend/src/components/map/ERA5Overlay.tsx`
- Modify: `frontend/src/pages/ObservatoryPage.tsx`

**Step 1: Create TemporalSlider** — bottom bar with range slider (months from 1950 to 2026), play/pause button, speed control. Emits current date to parent.

**Step 2: Create ERA5Overlay** — deck.gl HeatmapLayer rendering ERA5 precipitation or temperature on the grid for the selected date. Calls `api.era5.snapshot(date)`. Pre-fetches adjacent months.

**Step 3: Add toggle button in ObservatoryPage to show/hide ERA5 overlay and slider**

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: temporal slider with ERA5 heatmap overlay on map"
```

---

## Phase 5: Station Detail Page

### Task 5.1: Station Detail Layout and KPI Cards

**Files:**
- Create: `frontend/src/components/station/StationKPICards.tsx`
- Create: `frontend/src/components/station/StationDetail.tsx`
- Modify: `frontend/src/pages/StationPage.tsx`

**Step 1: Create StationKPICards** — 4 cards (level, trend, precipitation, temperature) with classification badge, sparkline, vs-average comparison.

**Step 2: Create StationDetail** — layout component with header (station name, river, back button), KPI cards row, then chart sections.

**Step 3: Update StationPage** — reads route params (piezo vs hydro + code), fetches station detail, renders StationDetail.

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: station detail page with KPI cards"
```

---

### Task 5.2: Timeseries Chart

**Files:**
- Create: `frontend/src/components/charts/TimeseriesChart.tsx`
- Modify: `frontend/src/components/station/StationDetail.tsx`

**Step 1: Create TimeseriesChart** — Recharts ComposedChart with:
- Area for precipitation (right Y-axis, inverted, light blue)
- Line for level/flow (left Y-axis, cyan)
- Brush component for date range zoom
- Period toggles (1yr, 5yr, max) that change the API date params
- Responsive, dark themed, custom tooltip

**Step 2: Wire to monthly timeseries data** by default (lighter), switch to daily on zoom.

**Step 3: Commit**

```bash
git add frontend/src/
git commit -m "feat: interactive timeseries chart with dual axes and brush zoom"
```

---

### Task 5.3: Correlation and Seasonality Charts

**Files:**
- Create: `frontend/src/components/charts/CorrelationScatter.tsx`
- Create: `frontend/src/components/charts/SeasonalityChart.tsx`
- Modify: `frontend/src/components/station/StationDetail.tsx`

**Step 1: Create CorrelationScatter** — Recharts ScatterChart plotting precipitation vs level, with adjustable lag (dropdown: 0, 1, 3, 6, 12 months).

**Step 2: Create SeasonalityChart** — Recharts LineChart with 12-month X-axis (Jan–Dec), one line per year, showing seasonal patterns. Uses monthly data grouped by month-of-year.

**Step 3: Add both to StationDetail below the main timeseries chart, side by side.

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: correlation scatter and seasonality charts on station detail"
```

---

### Task 5.4: Yearly Heatmap

**Files:**
- Create: `frontend/src/components/charts/YearlyHeatmap.tsx`
- Modify: `frontend/src/components/station/StationDetail.tsx`

**Step 1: Create YearlyHeatmap** — Custom SVG or Recharts heatmap: years as rows, months (1-12) as columns, cell color = level/flow classification or quantile. Dark theme. Based on monthly data pivot.

**Step 2: Add to bottom of StationDetail.

**Step 3: Commit**

```bash
git add frontend/src/
git commit -m "feat: yearly heatmap showing years × months pattern"
```

---

## Phase 6: Trends Page

### Task 6.1: Trends Page with Department Choropleth

**Files:**
- Modify: `frontend/src/pages/TrendsPage.tsx`
- Create: `frontend/src/components/charts/TrendBarChart.tsx`

**Step 1: Implement TrendsPage** — layout with:
- KPI row (% baisse / stable / hausse from trends data)
- Department choropleth map (deck.gl GeoJsonLayer, load France department GeoJSON from public data)
- Horizontal bar chart ranking departments by avg_variation
- National evolution line chart (12-month rolling average from monthly data)
- Season selector and piezo/hydro toggle

**Step 2: For the choropleth, fetch France department boundaries GeoJSON** from a CDN or bundle a simplified version.

**Step 3: Commit**

```bash
git add frontend/src/
git commit -m "feat: trends page with choropleth, ranking, and national evolution"
```

---

## Phase 7: Alerts Page

### Task 7.1: Alerts Page with Table and Mini-Map

**Files:**
- Modify: `frontend/src/pages/AlertsPage.tsx`

**Step 1: Implement AlertsPage** — layout with:
- Alert summary cards (count per classification)
- Filterable/sortable table using HTML table + sort state (station, dept, level, classification, trend, last measurement)
- Pagination (50 per page)
- CSV export button (client-side from filtered data)
- Mini-map showing only TRES_BAS + BAS stations
- Piezo/hydro toggle, department filter

**Step 2: Commit**

```bash
git add frontend/src/
git commit -m "feat: alerts page with filterable table and mini-map"
```

---

## Phase 8: Compare Page

### Task 8.1: Compare Page with Multi-Station Charts

**Files:**
- Modify: `frontend/src/pages/ComparePage.tsx`
- Create: `frontend/src/components/compare/ComparePanel.tsx`

**Step 1: Implement ComparePage** — layout with:
- Station selector (autocomplete search, add as chips, max 5 stations)
- Superposed timeseries chart (one line per station, color-coded)
- Toggle: raw values vs z-score normalized
- ERA5 precipitation as background area
- KPI comparison table (mean, trend, amplitude, last value)
- Period selector (1yr, 5yr, max)
- URL state (station codes in query params for sharing)

**Step 2: Commit**

```bash
git add frontend/src/
git commit -m "feat: compare page with multi-station superposition and normalization"
```

---

## Phase 9: Global Filters

### Task 9.1: Global Filter Panel

**Files:**
- Create: `frontend/src/components/filters/GlobalFilters.tsx`
- Create: `frontend/src/hooks/useFilters.ts`
- Modify: `frontend/src/pages/ObservatoryPage.tsx`
- Modify: `frontend/src/pages/AlertsPage.tsx`
- Modify: `frontend/src/pages/TrendsPage.tsx`

**Step 1: Create useFilters hook** — reads/writes filter state from URL search params. Returns filter values + setters. Debounces changes 300ms.

```typescript
import { useSearchParams } from 'react-router-dom'
import { useMemo, useCallback } from 'react'

export interface Filters {
  minObservations?: number
  lastMeasurementAfter?: string
  classification?: string[]
  codeDepartement?: string
}

export function useFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = useMemo<Filters>(() => ({
    minObservations: searchParams.get('min_obs') ? Number(searchParams.get('min_obs')) : undefined,
    lastMeasurementAfter: searchParams.get('last_after') ?? undefined,
    classification: searchParams.getAll('classif').length > 0 ? searchParams.getAll('classif') : undefined,
    codeDepartement: searchParams.get('dept') ?? undefined,
  }), [searchParams])

  const setFilter = useCallback((key: string, value: string | string[] | undefined) => {
    setSearchParams(prev => {
      if (value === undefined) {
        prev.delete(key)
      } else if (Array.isArray(value)) {
        prev.delete(key)
        value.forEach(v => prev.append(key, v))
      } else {
        prev.set(key, value)
      }
      return prev
    })
  }, [setSearchParams])

  const apiParams = useMemo(() => {
    const p: Record<string, string | undefined> = {}
    if (filters.minObservations) p.min_observations = String(filters.minObservations)
    if (filters.lastMeasurementAfter) p.last_measurement_after = filters.lastMeasurementAfter
    if (filters.codeDepartement) p.code_departement = filters.codeDepartement
    return p
  }, [filters])

  return { filters, setFilter, apiParams }
}
```

**Step 2: Create GlobalFilters panel** — collapsible drawer with inputs for min observations, last measurement date picker, classification checkboxes, department dropdown. Shows result count.

**Step 3: Integrate on Observatory, Alerts, and Trends pages**

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: global quality filters persisted in URL across all views"
```

---

## Phase 10: Polish and Deployment

### Task 10.1: Animations and Loading States

**Files:** Various component files

**Step 1:** Add Framer Motion page transitions in Layout (AnimatePresence + motion.div wrapper around Outlet)

**Step 2:** Add skeleton loading components for map, charts, tables, KPI cards

**Step 3:** Add smooth number animations on KPI cards (count up effect)

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: page transitions, loading skeletons, and animations"
```

---

### Task 10.2: Docker Build and Final Integration

**Files:**
- Modify: `docker-compose.yml` (if needed)
- Modify: `frontend/Dockerfile` (production build)
- Modify: `nginx/nginx.conf` (serve built frontend)

**Step 1:** Create production frontend Dockerfile (multi-stage build with nginx):

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

**Step 2:** Update docker-compose for production mode with a `docker-compose.prod.yml` override.

**Step 3:** Test full stack:

```bash
docker compose up --build
# Visit http://localhost — full dashboard should work
```

**Step 4: Commit**

```bash
git add .
git commit -m "feat: Docker production build with multi-stage frontend"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1.1–1.3 | Foundation: Docker, Backend scaffold, Frontend scaffold |
| 2 | 2.1–2.3 | Backend API: Stations, Timeseries, Trends/Stats/ERA5 |
| 3 | 3.1 | Frontend shell: Layout, routing, theme |
| 4 | 4.1–4.5 | Observatory map: MapLibre, stations, popup, search, ERA5 slider |
| 5 | 5.1–5.4 | Station detail: KPIs, timeseries, correlations, heatmap |
| 6 | 6.1 | Trends page: choropleth, rankings, evolution |
| 7 | 7.1 | Alerts page: table, mini-map |
| 8 | 8.1 | Compare page: multi-station, normalization |
| 9 | 9.1 | Global filters: URL-synced quality filters |
| 10 | 10.1–10.2 | Polish: animations, Docker production build |

**Total: 18 tasks across 10 phases.**

Dependencies: Phase 2 (backend) and Phase 3 (frontend shell) can run in parallel. Phase 4+ requires both.
