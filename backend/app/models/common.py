from pydantic import BaseModel


class Alert(BaseModel):
    code: str
    type: str
    latitude: float | None = None
    longitude: float | None = None
    commune: str | None = None
    code_departement: str | None = None
    departement: str | None = None
    classification: str | None = None
    derniere_mesure: str | None = None
    alerte_depuis_annee: int | None = None
    nb_annees_consecutives: int | None = None


class NationalStats(BaseModel):
    total_piezo: int
    piezo_extremement_bas: int = 0
    piezo_tres_bas: int
    piezo_bas: int
    piezo_normal: int
    piezo_haut: int
    piezo_tres_haut: int
    piezo_extremement_haut: int = 0
    piezo_no_class: int
    total_hydro: int
    hydro_extremement_bas: int = 0
    hydro_tres_bas: int
    hydro_bas: int
    hydro_normal: int
    hydro_haut: int
    hydro_tres_haut: int
    hydro_extremement_haut: int = 0


class DepartmentStats(BaseModel):
    code_departement: str
    nom_departement: str | None = None
    nb_piezo: int
    nb_hydro: int
    pct_tres_bas: float | None = None
    avg_variation: float | None = None
