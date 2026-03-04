import type { WfsLayerConfig, WfsLayerId } from './types'

const SANDRE_ZONAGE_COLORS: Record<string, string> = {
  'region-hydro': '#3b82f6',
  'secteur-hydro': '#06b6d4',
  'sous-secteur-hydro': '#14b8a6',
  'zone-hydro': '#10b981',
}

export const WFS_LAYERS: WfsLayerConfig[] = [
  {
    id: 'region-hydro',
    label: 'Régions hydrographiques',
    group: 'sandre',
    minZoom: 0,
    geometryType: 'polygon',
    color: SANDRE_ZONAGE_COLORS['region-hydro'],
    tooltipFields: ['CdRegionHydro', 'LbRegionHydro'],
  },
  {
    id: 'secteur-hydro',
    label: 'Secteurs hydrographiques',
    group: 'sandre',
    minZoom: 6,
    geometryType: 'polygon',
    color: SANDRE_ZONAGE_COLORS['secteur-hydro'],
    tooltipFields: ['CdSecteurHydro', 'LbSecteurHydro'],
  },
  {
    id: 'sous-secteur-hydro',
    label: 'Sous-secteurs hydrographiques',
    group: 'sandre',
    minZoom: 7,
    geometryType: 'polygon',
    color: SANDRE_ZONAGE_COLORS['sous-secteur-hydro'],
    tooltipFields: ['CdSousSecteurHydro', 'LbSousSecteurHydro'],
  },
  {
    id: 'zone-hydro',
    label: 'Zones hydrographiques',
    group: 'sandre',
    minZoom: 9,
    geometryType: 'polygon',
    color: SANDRE_ZONAGE_COLORS['zone-hydro'],
    tooltipFields: ['CdZoneHydro', 'LbZoneHydro', 'Superficie'],
  },
  {
    id: 'cours-eau-1',
    label: 'Cours d\'eau principaux (>100km)',
    group: 'carthage',
    minZoom: 6,
    geometryType: 'line',
    color: '#60a5fa',
    tooltipFields: ['NomEntiteHydrographique', 'CdEntiteHydrographique'],
  },
  {
    id: 'cours-eau-2',
    label: 'Cours d\'eau secondaires (50-100km)',
    group: 'carthage',
    minZoom: 8,
    geometryType: 'line',
    color: '#93c5fd',
    tooltipFields: ['NomEntiteHydrographique', 'CdEntiteHydrographique'],
  },
  {
    id: 'plan-eau',
    label: 'Plans d\'eau',
    group: 'carthage',
    minZoom: 8,
    geometryType: 'polygon',
    color: '#38bdf8',
    tooltipFields: ['NomEntiteHydrographique', 'CdEntiteHydrographique', 'Superficie'],
  },
  {
    id: 'masse-eau-sout',
    label: 'Masses d\'eau souterraines (DCE)',
    group: 'hydroeco',
    minZoom: 7,
    geometryType: 'polygon',
    color: '#a78bfa',
    tooltipFields: ['CdMasseDEau', 'NomMasseDEau'],
  },
  {
    id: 'masse-eau-riv',
    label: 'Masses d\'eau cours d\'eau (DCE)',
    group: 'hydroeco',
    minZoom: 8,
    geometryType: 'line',
    color: '#c084fc',
    tooltipFields: ['CdMasseDEau', 'NomMasseDEau'],
  },
]

export const WFS_LAYER_MAP = Object.fromEntries(
  WFS_LAYERS.map(l => [l.id, l])
) as Record<WfsLayerId, WfsLayerConfig>

export interface LayerGroup {
  id: string
  label: string
  icon: string
  mode: 'radio' | 'checkbox'
  layers: WfsLayerConfig[]
}

export const LAYER_GROUPS: LayerGroup[] = [
  {
    id: 'sandre',
    label: 'Zonages SANDRE',
    icon: '\u{1F30A}',
    mode: 'radio',
    layers: WFS_LAYERS.filter(l => l.group === 'sandre'),
  },
  {
    id: 'carthage',
    label: 'Réseau hydrographique',
    icon: '\u{1F3DE}',
    mode: 'checkbox',
    layers: WFS_LAYERS.filter(l => l.group === 'carthage'),
  },
  {
    id: 'hydroeco',
    label: 'Hydro-écologie',
    icon: '\u{1F9EA}',
    mode: 'checkbox',
    layers: WFS_LAYERS.filter(l => l.group === 'hydroeco'),
  },
]
