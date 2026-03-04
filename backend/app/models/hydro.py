from pydantic import BaseModel
from datetime import date


class HydroStation(BaseModel):
    code_station: str
    libelle_station: str | None = None
    code_site: str | None = None
    libelle_site: str | None = None
    code_cours_eau: str | None = None
    nom_cours_eau: str | None = None
    code_departement: str | None = None
    nom_departement: str | None = None
    date_ouverture_station: date | None = None
    longitude_station: float | None = None
    latitude_station: float | None = None
    grandeur_hydro_principale: str | None = None
    premiere_mesure: date | None = None
    derniere_mesure: date | None = None
    nb_jours_total: float | None = None
    nb_mois_total: int | None = None
    resultat_moyen_global: float | None = None
    resultat_min_global: float | None = None
    resultat_max_global: float | None = None
    resultat_stddev_global: float | None = None
    annee_dernier_bilan: int | None = None
    resultat_moyen_dern_annee: float | None = None
    classification_resultat_dern_annee: str | None = None
    percentile_resultat_dern_annee: float | None = None


class HydroDaily(BaseModel):
    date: date
    resultat_obs_elab: float | None = None
    grandeur_hydro_elab: str | None = None
    temperature_2m: float | None = None
    total_precipitation: float | None = None
    potential_evaporation: float | None = None


class HydroMonthly(BaseModel):
    mois: date
    resultat_moyen: float | None = None
    resultat_min: float | None = None
    resultat_max: float | None = None
    amplitude_mensuelle: float | None = None
    temperature_moyenne: float | None = None
    precipitation_totale: float | None = None
    evaporation_moyenne: float | None = None
    nb_jours_mesures: int | None = None
    resultat_moy_mobile_3m: float | None = None
    resultat_moy_mobile_12m: float | None = None
    precipitation_moy_mobile_12m: float | None = None
    variation_resultat_vs_mois_prec: float | None = None
    variation_resultat_vs_annee_prec: float | None = None


class HydroYearly(BaseModel):
    annee: int
    resultat_moyen_annuel: float | None = None
    resultat_min_annuel: float | None = None
    resultat_max_annuel: float | None = None
    amplitude_annuelle: float | None = None
    temperature_moyenne_annuelle: float | None = None
    precipitation_totale_annuelle: float | None = None
    nb_jours_mesures_annuel: float | None = None
    percentile_resultat_historique: float | None = None
    classification_resultat_annuel: str | None = None


class HydroTrend(BaseModel):
    code_station: str
    grandeur_hydro_elab: str | None = None
    saison: str | None = None
    code_departement: str | None = None
    nom_departement: str | None = None
    variation_annuelle: float | None = None
    fiabilite_tendance: float | None = None
    nb_points: int | None = None
    classification_tendance: str | None = None
    projection_variation_5ans: float | None = None


class HydroPercentiles(BaseModel):
    p10: float | None = None
    p25: float | None = None
    p75: float | None = None
    p90: float | None = None
