export const CLASSIFICATION_COLORS = {
  TRES_BAS: '#ef4444',
  BAS: '#f97316',
  NORMAL: '#10b981',
  HAUT: '#3b82f6',
  TRES_HAUT: '#1d4ed8',
  UNKNOWN: '#6b7280',
} as const as Record<string, string>

export const CLASSIFICATION_LABELS: Record<string, string> = {
  TRES_BAS: 'Très bas',
  BAS: 'Bas',
  NORMAL: 'Normal',
  HAUT: 'Haut',
  TRES_HAUT: 'Très haut',
  UNKNOWN: 'Non classé',
}

export const CLASSIFICATION_ORDER = ['TRES_BAS', 'BAS', 'NORMAL', 'HAUT', 'TRES_HAUT'] as const

export const TREND_LABELS: Record<string, string> = {
  HAUSSE_FORTE: 'Hausse forte',
  HAUSSE_SIGNIFICATIVE: 'Hausse significative',
  STABLE: 'Stable',
  BAISSE_SIGNIFICATIVE: 'Baisse significative',
  BAISSE_FORTE: 'Baisse forte',
}

export const TREND_COLORS: Record<string, string> = {
  HAUSSE_FORTE: '#3b82f6',
  HAUSSE_SIGNIFICATIVE: '#60a5fa',
  STABLE: '#10b981',
  BAISSE_SIGNIFICATIVE: '#f97316',
  BAISSE_FORTE: '#ef4444',
}

export const TREND_ORDER = ['BAISSE_FORTE', 'BAISSE_SIGNIFICATIVE', 'STABLE', 'HAUSSE_SIGNIFICATIVE', 'HAUSSE_FORTE'] as const

export const API_BASE = '/api/v1'
