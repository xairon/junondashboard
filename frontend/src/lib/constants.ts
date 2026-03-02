export const CLASSIFICATION_COLORS = {
  TRES_BAS: '#ef4444',
  BAS: '#f97316',
  NORMAL: '#10b981',
  HAUT: '#3b82f6',
  TRES_HAUT: '#1d4ed8',
  UNKNOWN: '#6b7280',
} as const satisfies Record<string, string>

export const CLASSIFICATION_LABELS = {
  TRES_BAS: 'Tr\u00e8s bas',
  BAS: 'Bas',
  NORMAL: 'Normal',
  HAUT: 'Haut',
  TRES_HAUT: 'Tr\u00e8s haut',
  UNKNOWN: 'Non class\u00e9',
} as const satisfies Record<string, string>

export const CLASSIFICATION_ORDER = ['TRES_BAS', 'BAS', 'NORMAL', 'HAUT', 'TRES_HAUT'] as const

export const API_BASE = '/api/v1'
