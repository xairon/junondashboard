# Levels Percentile Context Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add historical percentile context to station charts — colored reference bands on the timeseries chart (P10/P25/P75/P90) and a new annual percentile ranking chart.

**Architecture:** Two new backend endpoints compute PERCENTILE_CONT from the daily tables and return `{ p10, p25, p75, p90 }`. The frontend fetches these once per station visit, passes them to `TimeseriesChart` as `ReferenceArea` bands, and shows a new `PercentileChart` component using yearly data (already fetched) showing annual centile rank 0–100.

**Tech Stack:** FastAPI + SQLAlchemy (text queries), Pydantic, Redis cache; React 19 + TypeScript + Recharts (`ReferenceArea`), TanStack Query v5.

---

### Task 1: Add `StationPercentiles` Pydantic model

**Files:**
- Modify: `backend/app/models/station.py` (append at end of file)

**Step 1: Add the model**

At the end of `backend/app/models/station.py`, append:

```python
class StationPercentiles(BaseModel):
    p10: float | None = None
    p25: float | None = None
    p75: float | None = None
    p90: float | None = None
```

**Step 2: Verify no syntax error**

```bash
cd /e/hydro_dashboard/backend
python -c "from app.models.station import StationPercentiles; print('OK')"
```

Expected output: `OK`

**Step 3: Commit**

```bash
git add backend/app/models/station.py
git commit -m "feat: add StationPercentiles pydantic model"
```

---

### Task 2: Backend — Piezo percentiles endpoint

**Files:**
- Modify: `backend/app/routers/stations.py` (append after the `get_hydro_station` function, around line 319)

**Step 1: Add the constant and import check**

At the top of `stations.py`, `StationPercentiles` must be imported from the models. Check existing import line — it should read:

```python
from app.models.station import (
    PiezoStationMap, HydroStationMap,
    PiezoStationDetail, HydroStationDetail,
)
```

Add `StationPercentiles` to that import:

```python
from app.models.station import (
    PiezoStationMap, HydroStationMap,
    PiezoStationDetail, HydroStationDetail,
    StationPercentiles,
)
```

Then add the TTL constant near the other TTLs at the top of the file:

```python
PERCENTILES_TTL = 86400  # 24h — percentiles change very slowly
```

**Step 2: Add the endpoint**

After the `get_hydro_station` function (around line 318), add:

```python
@router.get("/piezo/{code_bss:path}/percentiles", response_model=StationPercentiles)
async def get_piezo_percentiles(
    code_bss: str,
    db: AsyncSession = Depends(get_db),
):
    r = get_redis()
    key = cache_key("piezo_percentiles", {"code_bss": code_bss})

    async def fetch():
        query = """
            SELECT
                PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY niveau_nappe_eau) AS p10,
                PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY niveau_nappe_eau) AS p25,
                PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY niveau_nappe_eau) AS p75,
                PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY niveau_nappe_eau) AS p90
            FROM gold.hubeau_daily_chroniques
            WHERE code_bss = :code
              AND niveau_nappe_eau IS NOT NULL
        """
        result = await db.execute(text(query), {"code": code_bss})
        row = result.mappings().first()
        if not row:
            return None
        return dict(row)

    data = await cached(r, key, PERCENTILES_TTL, fetch)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data for piezo station {code_bss}")
    return data
```

**Step 3: Verify endpoint is reachable (syntax check)**

```bash
cd /e/hydro_dashboard/backend
python -c "from app.routers.stations import router; print('OK')"
```

Expected: `OK`

**Step 4: Commit**

```bash
git add backend/app/routers/stations.py
git commit -m "feat: add GET /stations/piezo/{code}/percentiles endpoint"
```

---

### Task 3: Backend — Hydro percentiles endpoint

**Files:**
- Modify: `backend/app/routers/stations.py` (append after Task 2's endpoint)

**Step 1: Add the endpoint**

After the piezo percentiles endpoint added in Task 2:

```python
@router.get("/hydro/{code_station}/percentiles", response_model=StationPercentiles)
async def get_hydro_percentiles(
    code_station: str,
    db: AsyncSession = Depends(get_db),
):
    r = get_redis()
    key = cache_key("hydro_percentiles", {"code_station": code_station})

    async def fetch():
        query = """
            SELECT
                PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY resultat_obs_elab) AS p10,
                PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY resultat_obs_elab) AS p25,
                PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY resultat_obs_elab) AS p75,
                PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY resultat_obs_elab) AS p90
            FROM gold.hydro_daily_chroniques
            WHERE code_station = :code
              AND resultat_obs_elab IS NOT NULL
        """
        result = await db.execute(text(query), {"code": code_station})
        row = result.mappings().first()
        if not row:
            return None
        return dict(row)

    data = await cached(r, key, PERCENTILES_TTL, fetch)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data for hydro station {code_station}")
    return data
```

**Step 2: Verify**

```bash
cd /e/hydro_dashboard/backend
python -c "from app.routers.stations import router; print([r.path for r in router.routes])"
```

Expected: list including `'/hydro/{code_station}/percentiles'`

**Step 3: Commit**

```bash
git add backend/app/routers/stations.py
git commit -m "feat: add GET /stations/hydro/{code}/percentiles endpoint"
```

---

### Task 4: Frontend types — StationPercentiles + yearly percentile fields

**Files:**
- Modify: `frontend/src/lib/types.ts`

**Step 1: Add `StationPercentiles` interface**

After the `ERA5GridPoint` interface (at the end of the interfaces section), add:

```typescript
export interface StationPercentiles {
  p10: number | null
  p25: number | null
  p75: number | null
  p90: number | null
}
```

**Step 2: Add `percentile_niveau_historique` to `YearlyPiezoData`**

The current `YearlyPiezoData` interface (around line 68) is missing this field. Add it:

```typescript
export interface YearlyPiezoData {
  annee: number
  niveau_moyen: number | null
  niveau_min: number | null
  niveau_max: number | null
  amplitude: number | null
  nb_jours_mesures_annuel: number | null
  classification: string | null
  precipitation_totale_annuelle: number | null
  bilan_hydrique_annuel: number | null
  percentile_niveau_historique: number | null   // ← add this line
}
```

**Step 3: Add `percentile_resultat_historique` to `YearlyHydroData`**

```typescript
export interface YearlyHydroData {
  annee: number
  resultat_moyen: number | null
  resultat_min: number | null
  resultat_max: number | null
  nb_jours_mesures: number | null
  classification: string | null
  percentile_resultat_historique: number | null  // ← add this line
}
```

**Step 4: TypeScript check**

```bash
cd /e/hydro_dashboard/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (clean).

**Step 5: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat: add StationPercentiles type and yearly percentile fields"
```

---

### Task 5: Frontend api — Add percentile query functions

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Step 1: Add import for `StationPercentiles`**

Find the existing imports at the top of `api.ts`. The import from `./types` already exists. Add `StationPercentiles` to it:

```typescript
import type {
  PiezoStation, HydroStation,
  DailyPiezoMeasurement, DailyHydroMeasurement,
  MonthlyPiezoData, MonthlyHydroData,
  YearlyPiezoData, YearlyHydroData,
  NationalStats, DepartmentStats,
  Alert, ERA5GridPoint,
  StationPercentiles,            // ← add this
} from './types'
```

**Step 2: Add two functions inside the `api` object**

In the `stations` section of `api`, after `hydroDetail`:

```typescript
piezoPercentiles: (code: string) =>
  fetchJson<StationPercentiles>(`/stations/piezo/${encodeURIComponent(code)}/percentiles`),
hydroPercentiles: (code: string) =>
  fetchJson<StationPercentiles>(`/stations/hydro/${encodeURIComponent(code)}/percentiles`),
```

**Step 3: TypeScript check**

```bash
cd /e/hydro_dashboard/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

**Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add piezoPercentiles and hydroPercentiles api functions"
```

---

### Task 6: Update TimeseriesChart — add percentile reference bands

**Files:**
- Modify: `frontend/src/components/charts/TimeseriesChart.tsx`

**Step 1: Add `ReferenceArea` to Recharts imports**

Existing import line (line 2–5):

```typescript
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Brush, Area,
} from 'recharts'
```

Change to:

```typescript
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Brush, Area, ReferenceArea,
} from 'recharts'
```

**Step 2: Add `StationPercentiles` import**

After the existing `import { CHART_TOOLTIP_STYLE } from '../../lib/types'` line, add:

```typescript
import type { StationPercentiles } from '../../lib/types'
```

**Step 3: Add `percentiles` to the Props interface**

Change the existing `interface Props` (line 8–14):

```typescript
interface Props {
  data: any[]
  valueKey: string
  valueLabel: string
  unit: string
  precipKey?: string
  percentiles?: StationPercentiles | null
}
```

**Step 4: Destructure `percentiles` in the function signature**

Change:

```typescript
export function TimeseriesChart({ data, valueKey, valueLabel, unit, precipKey = 'precipitation_totale' }: Props) {
```

To:

```typescript
export function TimeseriesChart({ data, valueKey, valueLabel, unit, precipKey = 'precipitation_totale', percentiles }: Props) {
```

**Step 5: Add the zone color constant**

After the `PERIODS` constant (after line 20), add:

```typescript
const ZONE_BANDS = [
  { key: 'tres_haut', label: 'Très haut', color: 'rgba(99,102,241,0.10)' },
  { key: 'haut',      label: 'Haut',      color: 'rgba(59,130,246,0.10)' },
  { key: 'normal',    label: 'Normal',    color: 'rgba(34,197,94,0.10)'  },
  { key: 'bas',       label: 'Bas',       color: 'rgba(249,115,22,0.10)' },
  { key: 'tres_bas',  label: 'Très bas',  color: 'rgba(239,68,68,0.10)'  },
] as const

const ZONE_DOT_COLORS = {
  tres_haut: '#818cf8',
  haut:      '#60a5fa',
  normal:    '#4ade80',
  bas:       '#fb923c',
  tres_bas:  '#f87171',
} as const
```

**Step 6: Insert ReferenceArea bands inside ComposedChart**

Inside the `<ComposedChart>` JSX, **before** the `<CartesianGrid>` element, add:

```tsx
{percentiles?.p10 != null && percentiles.p25 != null && percentiles.p75 != null && percentiles.p90 != null && (
  <>
    <ReferenceArea yAxisId="left" y2={percentiles.p10}  fill="rgba(239,68,68,0.10)"   ifOverflow="visible" />
    <ReferenceArea yAxisId="left" y1={percentiles.p10}  y2={percentiles.p25} fill="rgba(249,115,22,0.10)"  ifOverflow="visible" />
    <ReferenceArea yAxisId="left" y1={percentiles.p25}  y2={percentiles.p75} fill="rgba(34,197,94,0.10)"   ifOverflow="visible" />
    <ReferenceArea yAxisId="left" y1={percentiles.p75}  y2={percentiles.p90} fill="rgba(59,130,246,0.10)"  ifOverflow="visible" />
    <ReferenceArea yAxisId="left" y1={percentiles.p90}  fill="rgba(99,102,241,0.10)"  ifOverflow="visible" />
  </>
)}
```

**Step 7: Add the legend below the chart**

After the closing `</div>` of the `role="img"` wrapper (after the `</ResponsiveContainer>`), add:

```tsx
{percentiles?.p10 != null && (
  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-end">
    {ZONE_BANDS.map(z => (
      <span key={z.key} className="flex items-center gap-1 text-xs text-gray-500">
        <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: ZONE_DOT_COLORS[z.key] }} />
        {z.label}
      </span>
    ))}
  </div>
)}
```

**Step 8: TypeScript check**

```bash
cd /e/hydro_dashboard/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

**Step 9: Commit**

```bash
git add frontend/src/components/charts/TimeseriesChart.tsx
git commit -m "feat: add percentile reference bands to TimeseriesChart"
```

---

### Task 7: Create PercentileChart component

**Files:**
- Create: `frontend/src/components/charts/PercentileChart.tsx`

**Step 1: Create the file**

```tsx
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceArea, Cell,
} from 'recharts'
import { CHART_TOOLTIP_STYLE } from '../../lib/types'
import type { YearlyPiezoData, YearlyHydroData } from '../../lib/types'

type Props = {
  data: YearlyPiezoData[] | YearlyHydroData[]
  type: 'piezo' | 'hydro'
}

function getPercentile(d: YearlyPiezoData | YearlyHydroData, type: 'piezo' | 'hydro'): number | null {
  if (type === 'piezo') return (d as YearlyPiezoData).percentile_niveau_historique ?? null
  return (d as YearlyHydroData).percentile_resultat_historique ?? null
}

function percentileColor(v: number): string {
  if (v < 10)  return '#f87171'  // red — Très bas
  if (v < 25)  return '#fb923c'  // orange — Bas
  if (v < 75)  return '#4ade80'  // green — Normal
  if (v < 90)  return '#60a5fa'  // blue — Haut
  return '#818cf8'               // indigo — Très haut
}

function classLabel(v: number): string {
  if (v < 10)  return 'Très bas'
  if (v < 25)  return 'Bas'
  if (v < 75)  return 'Normal'
  if (v < 90)  return 'Haut'
  return 'Très haut'
}

export function PercentileChart({ data, type }: Props) {
  const chartData = data
    .map(d => ({
      annee: String((d as YearlyPiezoData | YearlyHydroData).annee),
      centile: getPercentile(d, type),
    }))
    .filter(d => d.centile != null)
    .sort((a, b) => a.annee.localeCompare(b.annee))

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center h-32 text-text-secondary text-sm">
        Données de rang centile non disponibles
      </div>
    )
  }

  return (
    <div role="img" aria-label="Graphique du rang centile historique annuel">
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <ReferenceArea y1={0}  y2={10} fill="rgba(239,68,68,0.08)"   ifOverflow="visible" />
          <ReferenceArea y1={10} y2={25} fill="rgba(249,115,22,0.08)"  ifOverflow="visible" />
          <ReferenceArea y1={25} y2={75} fill="rgba(34,197,94,0.08)"   ifOverflow="visible" />
          <ReferenceArea y1={75} y2={90} fill="rgba(59,130,246,0.08)"  ifOverflow="visible" />
          <ReferenceArea y1={90} y2={100} fill="rgba(99,102,241,0.08)" ifOverflow="visible" />
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="annee"
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            stroke="transparent"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            stroke="transparent"
            label={{ value: 'Centile', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value: number) => [`${Math.round(value)}e centile — ${classLabel(value)}`, 'Rang']}
          />
          <Bar dataKey="centile" radius={[2, 2, 0, 0]}>
            {chartData.map((entry) => (
              <Cell
                key={entry.annee}
                fill={percentileColor(entry.centile!)}
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
```

**Step 2: TypeScript check**

```bash
cd /e/hydro_dashboard/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

**Step 3: Commit**

```bash
git add frontend/src/components/charts/PercentileChart.tsx
git commit -m "feat: add PercentileChart component with historical centile bars"
```

---

### Task 8: Wire everything in StationPage

**Files:**
- Modify: `frontend/src/pages/StationPage.tsx`

**Step 1: Add imports**

At the top of `StationPage.tsx`, add these two imports after the existing chart imports:

```typescript
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { PercentileChart } from '../components/charts/PercentileChart'
```

(Check if `useQuery` and `api` are already imported — they may be used elsewhere. If so, just add `PercentileChart`.)

**Step 2: Add the percentiles query**

Inside the `StationPage` component, after the existing yearly data queries (around line 142), add:

```typescript
// Percentile thresholds (P10/P25/P75/P90) for reference bands on chart
const { data: percentiles } = useQuery({
  queryKey: ['percentiles', type, code],
  queryFn: () => isPiezo
    ? api.stations.piezoPercentiles(code)
    : api.stations.hydroPercentiles(code),
  enabled: !!code,
  staleTime: 24 * 60 * 60 * 1000, // 24h
})
```

**Step 3: Pass `percentiles` to `<TimeseriesChart />`**

Find the existing `<TimeseriesChart>` usage (around line 440–456). It currently looks like:

```tsx
<TimeseriesChart
  data={activeData}
  valueKey={valueKey}
  valueLabel={valueLabel}
  unit={unit}
/>
```

Change to:

```tsx
<TimeseriesChart
  data={activeData}
  valueKey={valueKey}
  valueLabel={valueLabel}
  unit={unit}
  percentiles={percentiles}
/>
```

**Step 4: Add the PercentileChart section**

Find the yearly data section or after `TimeseriesChart`. The yearly data is already loaded via `piezoYearly`/`hydroYearly`. We always want to show the percentile chart when yearly data is available. Add this section after the `TimeseriesChart` block:

```tsx
{/* Rang centile historique annuel */}
{(() => {
  const yearlyData = isPiezo ? piezoYearly : hydroYearly
  if (!yearlyData?.length) return null
  return (
    <div className="bg-gray-900/50 rounded-xl border border-white/5 p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Rang centile historique annuel</h3>
      <PercentileChart data={yearlyData} type={type} />
    </div>
  )
})()}
```

Note: `piezoYearly` and `hydroYearly` are already fetched when `resolution === 'yearly'`. We need them always for this chart. Check if the queries currently use `enabled: resolution === 'yearly'`. If yes, change to always enabled:

```typescript
// Before (around line 138):
const { data: piezoYearly, isLoading: piezoYearlyLoading } = usePiezoYearly(
  isPiezo && resolution === 'yearly' ? code : '',
)
// Change to:
const { data: piezoYearly, isLoading: piezoYearlyLoading } = usePiezoYearly(
  isPiezo ? code : '',
)

// Before:
const { data: hydroYearly, isLoading: hydroYearlyLoading } = useHydroYearly(
  !isPiezo && resolution === 'yearly' ? code : '',
)
// Change to:
const { data: hydroYearly, isLoading: hydroYearlyLoading } = useHydroYearly(
  !isPiezo ? code : '',
)
```

**Step 5: TypeScript check**

```bash
cd /e/hydro_dashboard/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

**Step 6: Commit**

```bash
git add frontend/src/pages/StationPage.tsx
git commit -m "feat: wire percentile bands and PercentileChart into StationPage"
```

---

### Task 9: Final verification

**Step 1: Full TypeScript build**

```bash
cd /e/hydro_dashboard/frontend
npx tsc --noEmit 2>&1
```

Expected: no output.

**Step 2: Check for unicode escape regressions**

```bash
cd /e/hydro_dashboard
python3 -c "
import os, re
issues = []
for root, _, files in os.walk('frontend/src'):
    for f in files:
        if f.endswith(('.tsx', '.ts')):
            path = os.path.join(root, f)
            txt = open(path, encoding='utf-8').read()
            for m in re.finditer(r'(?<![\\\\])\\\\u[0-9a-fA-F]{4}', txt):
                issues.append(f'{path}: {m.group()}')
print(chr(10).join(issues) if issues else 'OK — no unicode escapes')
"
```

Expected: `OK — no unicode escapes`

**Step 3: Backend syntax check**

```bash
cd /e/hydro_dashboard/backend
python -c "from app.routers.stations import router; print('OK')"
```

Expected: `OK`
