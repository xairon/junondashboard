from pydantic import BaseModel
from datetime import date


class PiezoStation(BaseModel):
    code_bss: str
    bss_id: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    nom_commune: str | None = None
    code_departement: str | None = None
    nom_departement: str | None = None
    codes_bdlisa: str | None = None
    altitude_station: float | None = None
    date_debut_mesure: date | None = None
    date_fin_mesure: date | None = None
    nb_mesures_total: float | None = None
    nb_mois_total: int | None = None
    premiere_mesure: date | None = None
    derniere_mesure: date | None = None
    niveau_moyen_global: float | None = None
    niveau_min_absolu: float | None = None
    niveau_max_absolu: float | None = None
    niveau_stddev_global: float | None = None
    amplitude_totale: float | None = None
    profondeur_moyenne_globale: float | None = None
    temperature_moyenne_globale: float | None = None
    precipitation_moyenne_mensuelle: float | None = None
    derniere_annee: int | None = None
    niveau_derniere_annee: float | None = None
    classification_derniere_annee: str | None = None
    percentile_derniere_annee: float | None = None
    slope_niveau: float | None = None
    r2_niveau: float | None = None
    slope_precipitation: float | None = None
    nb_mois_tendance: int | None = None
    tendance_classification: str | None = None
    niveau_alerte: str | None = None
    qualite_tendance: str | None = None


class PiezoDaily(BaseModel):
    date: date
    niveau_nappe_eau: float | None = None
    profondeur_nappe: float | None = None
    temperature_2m: float | None = None
    total_precipitation: float | None = None
    potential_evaporation: float | None = None


class PiezoMonthly(BaseModel):
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


class PiezoYearly(BaseModel):
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


class PiezoTrend(BaseModel):
    code_bss: str
    saison: str | None = None
    code_departement: str | None = None
    nom_departement: str | None = None
    variation_annuelle_m: float | None = None
    fiabilite_tendance: float | None = None
    nb_points: int | None = None
    classification_tendance: str | None = None
    projection_variation_5ans_m: float | None = None


class PiezoPercentiles(BaseModel):
    p10: float | None = None
    p25: float | None = None
    p75: float | None = None
    p90: float | None = None


class PiezoSPLI(BaseModel):
    mois: date
    value: float | None = None
    spli: float | None = None
    classification: str = "UNKNOWN"


class PiezoSPI(BaseModel):
    mois: date
    value: float | None = None
    spi: float | None = None
    classification: str = "UNKNOWN"


class PiezoSiblingStation(BaseModel):
    code_bss: str
    nom_commune: str | None = None
    code_departement: str | None = None
    classification: str | None = None
    derniere_mesure: date | None = None
    distance_km: float | None = None


class PiezoBasinSiblings(BaseModel):
    code_bdlisa: str
    nom_bdlisa: str | None = None
    nature_bdlisa: str | None = None
    nb_stations: int
    siblings: list[PiezoSiblingStation]
