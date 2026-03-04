# Unified Panel & Layout Redesign — Design Doc

**Goal:** Replace the current multi-float layout (sidebar + scattered buttons + overlapping panels) with a clean full-map layout using a top nav, a retractable right drawer (data/filters/layers), and a left drawer for station info.

## Current Problems
- GlobalFilters and LayerPanel overlap when both expanded
- Piezo/Hydro toggles are isolated top-left, disconnected from layers
- Left sidebar wastes horizontal space for just 4-5 nav links
- StationPopup is a small floating card — not enough room for content
- Hydro-éco layers can overlap (checkboxes, user manages)

## New Layout

```
┌──────────────────────────────────────────────────┐
│  Logo   Observatoire  Tendances  Alertes  ERA5   │  Top nav (h-12)
├──────────────────────────────────────────────────┤
│ [SearchBar]                              [≡]     │  Toggle btn for right drawer
│                                          ┌──────┐│
│  ┌────────────┐                          │Données│
│  │ Station    │    MAP (full)            │Filtres│  Right drawer (w-80, retractable)
│  │ info panel │                          │Calques│
│  └────────────┘                          └──────┘│
│  ┌───────────── KPI Bar ────────────────────────┐│
└──────────────────────────────────────────────────┘
```

### 1. Top Navigation Bar
- Replaces left sidebar entirely
- Horizontal bar: logo + nav links (Observatoire, Tendances, Alertes, ERA5)
- Height: `h-12` fixed
- Dark bg matching current theme
- Mobile: hamburger menu

### 2. Right Drawer (retractable)
- **Trigger:** Toggle button top-right on map (layer icon)
- **Width:** `w-80` (320px), slides in/out from right
- **Sections (accordion):**

  **Données**
  - Piézométrie toggle (cyan)
  - Hydrométrie toggle (indigo)

  **Filtres**
  - Département (text input)
  - Classification (multi-select buttons)
  - Min observations (number)
  - Dernière mesure après (date)
  - Reset button

  **Calques**
  - *Administratif* — checkboxes: Régions, Départements, Bassins
  - *Zonages SANDRE* — radio (deselectable): Régions hydro, Secteurs, Sous-secteurs, Zones
  - *Réseau hydrographique* — checkboxes: Cours d'eau principaux, secondaires, Plans d'eau
  - *Hydro-écologie* — checkboxes: Masses d'eau souterraines, Masses d'eau rivières, HER-2

- **State:** Open/closed persists during session, sections remember expanded state
- **Mobile:** Full-width overlay with backdrop

### 3. Left Drawer (station info)
- **Trigger:** Click on a station marker
- **Width:** `w-80` (320px), slides in from left
- **Close:** X button, click elsewhere on map, or ESC
- **Content:**
  - Station type badge (Piézo / Hydro)
  - Station name + code
  - Commune, département
  - Classification badge (color-coded)
  - Latest measurement + date
  - Tendance (trend arrow)
  - Metadata grid: period, nb mesures, altitude, percentile
  - BDLISA info (piezo only)
  - **"Voir détails →"** link to `/station/:type/:code`

### 4. Existing Elements Repositioned
- **SearchBar:** stays top-left on map, `top-4 left-4`
- **KPIBar:** stays bottom full-width
- **Piezo/Hydro toggle buttons:** REMOVED from map, moved into right drawer "Données" section

### 5. Files Changed
- **Delete:** `components/layout/Sidebar.tsx` (replaced by TopNav)
- **Create:** `components/layout/TopNav.tsx`
- **Create:** `components/map/RightDrawer.tsx` (replaces GlobalFilters + LayerPanel)
- **Rewrite:** `components/map/StationDrawer.tsx` (replaces StationPopup)
- **Rewrite:** `App.tsx` / `Layout` — TopNav + Outlet (no sidebar)
- **Rewrite:** `ObservatoryPage.tsx` — remove floating elements, wire drawers
- **Delete:** `components/filters/GlobalFilters.tsx` (absorbed into RightDrawer)
- **Delete:** `components/map/LayerPanel.tsx` (absorbed into RightDrawer)

### 6. Animations
- Right drawer: `transform translateX(100%)` → `translateX(0)`, 200ms ease
- Left drawer: `transform translateX(-100%)` → `translateX(0)`, 200ms ease
- Accordion sections: height transition via CSS grid trick (`grid-template-rows: 0fr → 1fr`)

### 7. Responsive
- **Desktop (md+):** Both drawers can coexist, map shrinks between them
- **Mobile:** One drawer at a time, full-width overlay with backdrop blur
