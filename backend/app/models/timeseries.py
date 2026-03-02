from pydantic import BaseModel
from datetime import date


class DailyPiezoMeasurement(BaseModel):
    date: date
    niveau_nappe_eau: float | None = None
    profondeur_nappe: float | None = None
    temperature_2m: float | None = None
    total_precipitation: float | None = None
    potential_evaporation: float | None = None


class DailyHydroMeasurement(BaseModel):
    date: date
    resultat_obs_elab: float | None = None
    grandeur_hydro_elab: str
    temperature_2m: float | None = None
    total_precipitation: float | None = None
    potential_evaporation: float | None = None


class MonthlyPiezoMeasurement(BaseModel):
    mois: date
    niveau_moyen: float | None = None
    niveau_min: float | None = None
    niveau_max: float | None = None
    amplitude_mensuelle: float | None = None
    temperature_moyenne: float | None = None
    precipitation_totale: float | None = None
    evaporation_moyenne: float | None = None
    nb_jours_mesures: int | None = None
    niveau_moy_mobile_3m: float | None = None
    niveau_moy_mobile_12m: float | None = None
    precipitation_moy_mobile_12m: float | None = None
    variation_niveau_vs_mois_prec: float | None = None
    variation_niveau_vs_annee_prec: float | None = None


class MonthlyHydroMeasurement(BaseModel):
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


class YearlyPiezoStats(BaseModel):
    annee: int
    niveau_moyen_annuel: float | None = None
    niveau_min_annuel: float | None = None
    niveau_max_annuel: float | None = None
    amplitude_annuelle: float | None = None
    temperature_moyenne_annuelle: float | None = None
    precipitation_totale_annuelle: float | None = None
    bilan_hydrique_annuel: float | None = None
    nb_jours_mesures_annuel: float | None = None
    percentile_niveau_historique: float | None = None
    classification_niveau_annuel: str | None = None
    niveau_moy_mobile_5ans: float | None = None


class YearlyHydroStats(BaseModel):
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
