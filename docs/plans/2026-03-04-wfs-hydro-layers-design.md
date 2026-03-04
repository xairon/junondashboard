# WFS Hydrological Layers — Design Document

**Goal:** Add 9 new WFS-backed map layers (SANDRE zonages, Carthage network, DCE masses d'eau) with accordion panel, progressive zoom loading, and spatial station filtering.

**Architecture:** Backend proxy converts SANDRE WFS (GML) to GeoJSON with Redis cache. Frontend loads layers progressively by zoom level via new TanStack Query hooks. Accordion panel replaces current flat checkbox list.

**WFS endpoints:**
- Zonages + Carthage: `https://services.sandre.eaufrance.fr/geo/zonage`
- Masses d'eau DCE: `https://services.sandre.eaufrance.fr/geo/MasseDEau_VRAP2022`
