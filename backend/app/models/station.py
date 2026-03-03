from pydantic import BaseModel
from datetime import date


class PiezoStationMap(BaseModel):
    code_bss: str
    latitude: float | None = None
    longitude: float | None = None
    nom_commune: str | None = None
    code_departement: str | None = None
    nom_departement: str | None = None
    libelle_eh: str | None = None
    niveau_alerte: str | None = None
    tendance_classification: str | None = None
    classification_derniere_annee: str | None = None
    niveau_moyen_global: float | None = None
    niveau_derniere_annee: float | None = None
    premiere_mesure: date | None = None
    derniere_mesure: date | None = None
    nb_mesures_total: float | None = None


class HydroStationMap(BaseModel):
    code_station: str
    latitude: float | None = None
    longitude: float | None = None
    code_departement: str | None = None
    nom_departement: str | None = None
    libelle_station: str | None = None
    libelle_cours_eau: str | None = None
    grandeur_hydro_principale: str | None = None
    classification_resultat_dern_annee: str | None = None
    resultat_moyen_global: float | None = None
    premiere_mesure: date | None = None
    derniere_mesure: date | None = None
    nb_jours_total: float | None = None


class PiezoStationDetail(BaseModel):
    code_bss: str
    bss_id: str | None = None
    nom_commune: str | None = None
    code_departement: str | None = None
    nom_departement: str | None = None
    codes_bdlisa: str | None = None
    altitude_station: float | None = None
    longitude: float | None = None
    latitude: float | None = None
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


class HydroStationDetail(BaseModel):
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


class StationPercentiles(BaseModel):
    p10: float | None = None
    p25: float | None = None
    p75: float | None = None
    p90: float | None = None
