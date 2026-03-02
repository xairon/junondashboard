export const CLASSIFICATION_COLORS: Record<string, string> = {
  TRES_BAS: '#ef4444',
  BAS: '#f97316',
  NORMAL: '#10b981',
  HAUT: '#3b82f6',
  TRES_HAUT: '#1d4ed8',
} as const

export const CLASSIFICATION_LABELS: Record<string, string> = {
  TRES_BAS: 'Tres bas',
  BAS: 'Bas',
  NORMAL: 'Normal',
  HAUT: 'Haut',
  TRES_HAUT: 'Tres haut',
} as const

export const CLASSIFICATION_ORDER = ['TRES_BAS', 'BAS', 'NORMAL', 'HAUT', 'TRES_HAUT'] as const

export const API_BASE = '/api/v1'
