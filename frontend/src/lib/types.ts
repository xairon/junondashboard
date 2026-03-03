// Station types
export interface PiezoStation {
  code_bss: string
  bss_id?: string
  latitude: number | null
  longitude: number | null
  nom_commune: string | null
  code_departement: string | null
  nom_departement: string | null
  nb_mesures_total: number | null
  derniere_mesure: string | null
  classification_derniere_annee: string | null
  niveau_derniere_annee: number | null
  tendance_classification: string | null
  codes_bdlisa: string | null
}

export interface HydroStation {
  code_station: string
  code_site: string | null
  libelle_station: string | null
  libelle_site: string | null
  code_cours_eau: string | null
  libelle_cours_eau: string | null
  latitude_station: number | null
  longitude_station: number | null
  code_departement: string | null
  nom_departement: string | null
  grandeur_hydro_principale: 'Q' | 'H' | null
  nb_jours_total: number | null
  derniere_mesure: string | null
  classification_resultat_dern_annee: string | null
}

// Timeseries types
export interface DailyPiezoMeasurement {
  date_mesure: string
  niveau_nappe_eau: number | null
  profondeur_nappe: number | null
  qualification: string | null
}

export interface DailyHydroMeasurement {
  date_obs_elab: string
  resultat_obs_elab: number | null
  grandeur_hydro_elab: string | null
}

export interface MonthlyPiezoData {
  mois: string
  niveau_moyen: number | null
  niveau_min: number | null
  niveau_max: number | null
  nb_jours_mesures: number | null
  precipitation_totale: number | null
  temperature_moyenne: number | null
  evaporation_moyenne: number | null
}

export interface MonthlyHydroData {
  mois: string
  resultat_moyen: number | null
  resultat_min: number | null
  resultat_max: number | null
  nb_jours_mesures: number | null
}

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
  percentile_niveau_historique: number | null
}

export interface YearlyHydroData {
  annee: number
  resultat_moyen: number | null
  resultat_min: number | null
  resultat_max: number | null
  nb_jours_mesures: number | null
  classification: string | null
  percentile_resultat_historique: number | null
}

// Stats types
export interface NationalStats {
  total_piezo: number
  piezo_tres_bas: number
  piezo_bas: number
  piezo_normal: number
  piezo_haut: number
  piezo_tres_haut: number
  piezo_no_class: number
  total_hydro: number
  hydro_tres_bas: number
  hydro_bas: number
  hydro_normal: number
  hydro_haut: number
  hydro_tres_haut: number
}

export interface DepartmentStats {
  code_departement: string
  nom_departement: string
  nb_piezo: number
  nb_hydro: number
  pct_tres_bas: number | null
  avg_variation: number | null
}

// Alert types
export interface Alert {
  code: string
  type: 'piezo' | 'hydro'
  latitude: number | null
  longitude: number | null
  commune: string | null
  code_departement: string | null
  departement: string | null
  classification: string | null
  derniere_mesure: string | null
}

// ERA5 types
export interface ERA5GridPoint {
  latitude: number
  longitude: number
  temperature_2m: number | null
  total_precipitation: number | null
  potential_evaporation: number | null
}

export interface StationPercentiles {
  p10: number | null
  p25: number | null
  p75: number | null
  p90: number | null
}

// GeoJSON station types (endpoint /stations/geojson)
export interface StationGeoJSONProperties {
  code: string
  type: 'piezo' | 'hydro'
  classification: string | null
  commune: string | null
  departement: string | null
  code_departement: string | null
  codes_bdlisa?: string | null    // piezo only
  code_district?: string | null   // hydro only — first char of code_cours_eau
}

export interface StationGeoJSONFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: StationGeoJSONProperties
}

export interface StationGeoJSON {
  type: 'FeatureCollection'
  features: StationGeoJSONFeature[]
}

// Classification
export type Classification = 'TRES_BAS' | 'BAS' | 'NORMAL' | 'HAUT' | 'TRES_HAUT' | 'UNKNOWN'
export type TrendClassification = 'HAUSSE_FORTE' | 'HAUSSE_SIGNIFICATIVE' | 'STABLE' | 'BAISSE_SIGNIFICATIVE' | 'BAISSE_FORTE'

// Chart tooltip style
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#111827',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  fontSize: 12,
} as const
