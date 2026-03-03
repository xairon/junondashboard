# Référence API — Hydro Dashboard

Version de l'API : **v1**
Préfixe de base : `/api/v1`
Format de réponse : JSON (sérialisé via orjson)
Authentification : aucune (API publique en lecture seule)

---

## Authentification

L'API ne requiert actuellement **aucune authentification**. Toutes les requêtes sont en lecture seule (`GET` uniquement). Les origines CORS autorisées sont configurées via la variable d'environnement `ALLOWED_ORIGINS`.

---

## Rate Limiting

Le reverse proxy Nginx applique les limites suivantes :

| Zone | Limite | Burst | Endpoints concernés |
|---|---|---|---|
| `api` | 30 req/s par IP | 20 | `/api/*` |
| `general` | 60 req/s par IP | 30 | Tout le reste |
| `connlimit` | 20 connexions simultanées | — | Global |

En cas de dépassement, la réponse est `429 Too Many Requests`.

---

## Codes d'Erreur

| Code HTTP | Signification |
|---|---|
| `200 OK` | Succès |
| `400 Bad Request` | Paramètre invalide (bbox malformé, plage invalide, etc.) |
| `404 Not Found` | Ressource introuvable (station inexistante) |
| `429 Too Many Requests` | Rate limit dépassé |
| `500 Internal Server Error` | Erreur serveur inattendue |
| `503 Service Unavailable` | Base de données indisponible |

Toutes les erreurs retournent un corps JSON :

```json
{
  "detail": "Message d'erreur descriptif"
}
```

---

## En-têtes de Réponse Communs

| En-tête | Description |
|---|---|
| `Content-Type: application/json` | Toutes les réponses sont du JSON |
| `X-Total-Count: <n>` | Présent sur les endpoints paginés ; indique le total d'enregistrements |

---

## Endpoint Santé

### GET /api/v1/health

Vérifie l'état de l'application, de la base de données et de Redis.

**Paramètres :** aucun

**Réponse 200 :**

```json
{
  "status": "ok",
  "db": "ok",
  "redis": "ok"
}
```

Valeurs possibles pour `redis` : `"ok"`, `"unavailable"`, `"disabled"`.
Valeurs possibles pour `db` : `"ok"`.
En cas d'échec DB, retourne `503` avec `{"detail": "Database unavailable"}`.

---

## Stations

### GET /api/v1/stations/piezo

Liste paginée des stations piézométriques. Retourne `X-Total-Count` dans les en-têtes.
Cache Redis : **1 heure**.

**Paramètres de requête :**

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `min_observations` | integer | — | Filtre `nb_mesures_total >= valeur` |
| `last_measurement_after` | date (YYYY-MM-DD) | — | Filtre `derniere_mesure >= valeur` |
| `classification` | string[] | — | Un ou plusieurs parmi `TRES_BAS`, `BAS`, `NORMAL`, `HAUT`, `TRES_HAUT` (répétable) |
| `code_departement` | string (1–3 chars) | — | Code INSEE du département |
| `bbox` | string | — | Emprise géographique : `min_lon,min_lat,max_lon,max_lat` |
| `search` | string (2–100 chars) | — | Recherche ILIKE sur `code_bss` ou `nom_commune` |
| `limit` | integer | `500` | Nombre de résultats (1–5000) |
| `offset` | integer | `0` | Décalage pour la pagination |

**Réponse 200 :**

```json
[
  {
    "code_bss": "BSS001ABCD",
    "bss_id": "01234X0001/F",
    "latitude": 48.856,
    "longitude": 2.352,
    "nom_commune": "Paris",
    "code_departement": "75",
    "nom_departement": "Paris",
    "nb_mesures_total": 12500,
    "derniere_mesure": "2024-12-31",
    "classification_derniere_annee": "NORMAL",
    "niveau_derniere_annee": 32.5,
    "tendance_classification": "STABLE",
    "codes_bdlisa": "117AA01"
  }
]
```

**En-têtes de réponse :**

```
X-Total-Count: 4250
```

---

### GET /api/v1/stations/hydro

Liste paginée des stations hydrométriques. Paramètres identiques aux stations piézo avec un paramètre supplémentaire.
Cache Redis : **1 heure**.

**Paramètres de requête :**

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `min_observations` | integer | — | Filtre `nb_jours_total >= valeur` |
| `last_measurement_after` | date (YYYY-MM-DD) | — | Filtre `derniere_mesure >= valeur` |
| `classification` | string[] | — | Classification (voir ci-dessus) |
| `code_departement` | string (1–3 chars) | — | Code INSEE département |
| `grandeur_hydro` | string | — | Filtre sur `grandeur_hydro_principale` (`Q` = débit, `H` = hauteur) |
| `bbox` | string | — | Emprise géographique |
| `search` | string (2–100 chars) | — | ILIKE sur `code_station`, `libelle_station` ou `nom_cours_eau` |
| `limit` | integer | `500` | 1–5000 |
| `offset` | integer | `0` | Décalage |

**Réponse 200 :**

```json
[
  {
    "code_station": "K123456001",
    "code_site": "K123456",
    "libelle_station": "La Loire à Orléans",
    "libelle_site": "La Loire à Orléans",
    "code_cours_eau": "K---0100",
    "libelle_cours_eau": "La Loire",
    "latitude_station": 47.902,
    "longitude_station": 1.909,
    "code_departement": "45",
    "nom_departement": "Loiret",
    "grandeur_hydro_principale": "Q",
    "nb_jours_total": 18000,
    "derniere_mesure": "2024-12-31",
    "classification_resultat_dern_annee": "HAUT"
  }
]
```

---

### GET /api/v1/stations/geojson

Retourne un GeoJSON FeatureCollection pour l'affichage sur carte.
Cache Redis : **1 heure**.

**Paramètres de requête :**

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `type` | string | `all` | `piezo`, `hydro` ou `all` |

**Réponse 200 :**

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [2.352, 48.856]
      },
      "properties": {
        "code": "BSS001ABCD",
        "type": "piezo",
        "classification": "NORMAL",
        "commune": "Paris",
        "departement": "Paris",
        "code_departement": "75"
      }
    }
  ]
}
```

---

### GET /api/v1/stations/piezo/{code_bss}

Retourne le détail complet d'une station piézométrique (50+ champs BSS).
Cache Redis : **1 heure**.

**Paramètres de chemin :**

| Nom | Type | Description |
|---|---|---|
| `code_bss` | string | Code BSS de la station (ex: `BSS001ABCD`) |

**Réponse 200 :** Objet complet `PiezoStationDetail` avec tous les champs de `gold.dim_piezo_stations`.

**Réponse 404 :**

```json
{"detail": "Piezo station BSS001ABCD not found"}
```

---

### GET /api/v1/stations/hydro/{code_station}

Retourne le détail complet d'une station hydrométrique.
Cache Redis : **1 heure**.

**Paramètres de chemin :**

| Nom | Type | Description |
|---|---|---|
| `code_station` | string | Code station Hub'Eau (ex: `K123456001`) |

**Réponse 200 :** Objet `HydroStationDetail` avec tous les champs de `gold.dim_hydro_stations`.

**Réponse 404 :**

```json
{"detail": "Hydro station K123456001 not found"}
```

---

### GET /api/v1/stations/piezo/{code_bss}/percentiles

Calcule les percentiles historiques P10/P25/P75/P90 du niveau de la nappe pour une station piézométrique, sur l'ensemble des mesures journalières disponibles.
Cache Redis : **24 heures**.

**Paramètres de chemin :**

| Nom | Type | Description |
|---|---|---|
| `code_bss` | string | Code BSS de la station |

**Réponse 200 :**

```json
{
  "p10": 28.4,
  "p25": 31.2,
  "p75": 36.8,
  "p90": 39.5
}
```

Les valeurs sont en mètres NGF (Nivellement Général de la France).

**Réponse 404 :**

```json
{"detail": "No data for piezo station BSS001ABCD"}
```

---

### GET /api/v1/stations/hydro/{code_station}/percentiles

Calcule les percentiles historiques P10/P25/P75/P90 du débit ou de la hauteur pour une station hydrométrique.
Cache Redis : **24 heures**.

**Paramètres de chemin :**

| Nom | Type | Description |
|---|---|---|
| `code_station` | string | Code station hydrométrique |

**Réponse 200 :**

```json
{
  "p10": 12.5,
  "p25": 45.0,
  "p75": 210.0,
  "p90": 580.0
}
```

Les unités dépendent de la `grandeur_hydro_principale` de la station : m³/s pour le débit (Q), mètres pour la hauteur (H).

---

## Séries Temporelles

### GET /api/v1/timeseries/piezo/{code_bss}/daily

Mesures journalières d'une station piézométrique, enrichies de données ERA5.
Cache Redis : **6 heures**.

**Paramètres de chemin :**

| Nom | Type | Description |
|---|---|---|
| `code_bss` | string | Code BSS de la station |

**Paramètres de requête :**

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `start_date` | date (YYYY-MM-DD) | — | Date de début (incluse) |
| `end_date` | date (YYYY-MM-DD) | — | Date de fin (incluse) |
| `limit` | integer | `3650` | Nombre maximum de lignes (1–36500) |

**Réponse 200 :**

```json
[
  {
    "date": "2024-01-15",
    "niveau_nappe_eau": 34.25,
    "profondeur_nappe": 5.75,
    "temperature_2m": 8.3,
    "total_precipitation": 0.005,
    "potential_evaporation": 0.0012
  }
]
```

| Champ | Unité | Description |
|---|---|---|
| `niveau_nappe_eau` | m NGF | Cote piézométrique absolue |
| `profondeur_nappe` | m | Profondeur par rapport au sol |
| `temperature_2m` | °C | Température ERA5 à 2m |
| `total_precipitation` | m | Précipitations journalières ERA5 |
| `potential_evaporation` | m | Évapotranspiration potentielle ERA5 |

---

### GET /api/v1/timeseries/hydro/{code_station}/daily

Mesures journalières d'une station hydrométrique, enrichies de données ERA5.
Cache Redis : **6 heures**.

**Paramètres identiques à la route piézo daily.**

**Réponse 200 :**

```json
[
  {
    "date": "2024-01-15",
    "resultat_obs_elab": 245.5,
    "grandeur_hydro_elab": "Q",
    "temperature_2m": 8.3,
    "total_precipitation": 0.005,
    "potential_evaporation": 0.0012
  }
]
```

---

### GET /api/v1/timeseries/piezo/{code_bss}/monthly

Agrégats mensuels piézométriques avec moyennes mobiles 3 mois et 12 mois.
Cache Redis : **12 heures**.

**Paramètres de requête :**

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `start_date` | date | — | Filtre `mois >= valeur` |
| `end_date` | date | — | Filtre `mois <= valeur` |
| `limit` | integer | `600` | 1–1200 |

**Réponse 200 :**

```json
[
  {
    "mois": "2024-01-01",
    "niveau_moyen": 34.12,
    "niveau_min": 33.80,
    "niveau_max": 34.50,
    "amplitude_mensuelle": 0.70,
    "temperature_moyenne": 6.8,
    "precipitation_totale": 0.065,
    "evaporation_moyenne": 0.0009,
    "nb_jours_mesures": 31,
    "niveau_moy_mobile_3m": 34.05,
    "niveau_moy_mobile_12m": 33.90,
    "precipitation_moy_mobile_12m": 0.054,
    "variation_niveau_vs_mois_prec": 0.15,
    "variation_niveau_vs_annee_prec": -0.22
  }
]
```

---

### GET /api/v1/timeseries/hydro/{code_station}/monthly

Agrégats mensuels hydrométriques avec moyennes mobiles.
Cache Redis : **12 heures**. Paramètres identiques à la route piézo monthly.

**Réponse 200 :**

```json
[
  {
    "mois": "2024-01-01",
    "resultat_moyen": 245.0,
    "resultat_min": 180.0,
    "resultat_max": 420.0,
    "amplitude_mensuelle": 240.0,
    "temperature_moyenne": 6.8,
    "precipitation_totale": 0.065,
    "evaporation_moyenne": 0.0009,
    "nb_jours_mesures": 31,
    "resultat_moy_mobile_3m": 260.0,
    "resultat_moy_mobile_12m": 200.0,
    "precipitation_moy_mobile_12m": 0.054,
    "variation_resultat_vs_mois_prec": 15.0,
    "variation_resultat_vs_annee_prec": -30.0
  }
]
```

---

### GET /api/v1/timeseries/piezo/{code_bss}/yearly

Statistiques annuelles piézométriques incluant le rang percentile historique et la classification.
Cache Redis : **24 heures**.

**Paramètres de requête :**

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `start_date` | date | — | Filtre `annee >= année(valeur)` |
| `end_date` | date | — | Filtre `annee <= année(valeur)` |
| `limit` | integer | `100` | 1–200 |

**Réponse 200 :**

```json
[
  {
    "annee": 2023,
    "niveau_moyen_annuel": 33.85,
    "niveau_min_annuel": 31.20,
    "niveau_max_annuel": 36.90,
    "amplitude_annuelle": 5.70,
    "temperature_moyenne_annuelle": 13.2,
    "precipitation_totale_annuelle": 0.685,
    "bilan_hydrique_annuel": 0.245,
    "nb_jours_mesures_annuel": 365,
    "percentile_niveau_historique": 42.5,
    "classification_niveau_annuel": "NORMAL",
    "niveau_moy_mobile_5ans": 34.10
  }
]
```

---

### GET /api/v1/timeseries/hydro/{code_station}/yearly

Statistiques annuelles hydrométriques.
Cache Redis : **24 heures**. Paramètres identiques.

**Réponse 200 :**

```json
[
  {
    "annee": 2023,
    "resultat_moyen_annuel": 198.5,
    "resultat_min_annuel": 45.0,
    "resultat_max_annuel": 1250.0,
    "amplitude_annuelle": 1205.0,
    "temperature_moyenne_annuelle": 13.2,
    "precipitation_totale_annuelle": 0.685,
    "nb_jours_mesures_annuel": 365,
    "percentile_resultat_historique": 38.0,
    "classification_resultat_annuel": "NORMAL"
  }
]
```

---

### GET /api/v1/timeseries/compare

Récupère simultanément (en parallèle via `asyncio.gather`) les séries temporelles de plusieurs stations.
Cache Redis : **30 minutes**.

**Paramètres de requête :**

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `stations` | string[] | *obligatoire* | Codes des stations (param répétable, 1–10 stations) |
| `type` | string | *obligatoire* | `piezo` ou `hydro` |
| `granularity` | string | `monthly` | `daily` ou `monthly` |

**Exemple de requête :**

```
GET /api/v1/timeseries/compare?stations=BSS001ABCD&stations=BSS002EFGH&type=piezo&granularity=monthly
```

**Réponse 200 :**

```json
{
  "BSS001ABCD": [
    {"mois": "2024-01-01", "niveau_moyen": 34.12, "niveau_min": 33.80, "niveau_max": 34.50}
  ],
  "BSS002EFGH": [
    {"mois": "2024-01-01", "niveau_moyen": 28.50, "niveau_min": 28.10, "niveau_max": 28.90}
  ]
}
```

**Réponse 400 :**

```json
{"detail": "Provide between 1 and 10 station codes"}
```

---

## Tendances

### GET /api/v1/trends/piezo

Tendances de pente de Sen pour les stations piézométriques.
Cache Redis : **12 heures**.

**Paramètres de requête :**

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `saison` | string | — | `annuel`, `printemps`, `ete`, `automne` ou `hiver` |
| `code_departement` | string | — | Code département (1–3 chars) |
| `classification_tendance` | string | — | `HAUSSE_FORTE`, `HAUSSE_SIGNIFICATIVE`, `STABLE`, `BAISSE_SIGNIFICATIVE` ou `BAISSE_FORTE` |
| `fiabilite_min` | float | — | Fiabilité minimum de la tendance (0.0–1.0) |
| `limit` | integer | `500` | 1–5000 |
| `offset` | integer | `0` | Décalage |

**Réponse 200 :**

```json
[
  {
    "code_bss": "BSS001ABCD",
    "saison": "annuel",
    "code_departement": "75",
    "nom_departement": "Paris",
    "variation_annuelle_m": -0.042,
    "fiabilite_tendance": 0.95,
    "nb_points": 8760,
    "classification_tendance": "BAISSE_SIGNIFICATIVE",
    "projection_variation_5ans_m": -0.210
  }
]
```

**En-têtes de réponse :** `X-Total-Count: <n>`

---

### GET /api/v1/trends/hydro

Tendances de pente de Sen pour les stations hydrométriques.
Cache Redis : **12 heures**.

**Paramètres supplémentaires par rapport à `/trends/piezo` :**

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `grandeur_hydro_elab` | string | — | Filtre sur la grandeur élaborée (`Q` ou `H`) |

**Réponse 200 :**

```json
[
  {
    "code_station": "K123456001",
    "grandeur_hydro_elab": "Q",
    "saison": "ete",
    "code_departement": "45",
    "nom_departement": "Loiret",
    "variation_annuelle": -3.5,
    "fiabilite_tendance": 0.88,
    "nb_points": 15000,
    "classification_tendance": "BAISSE_SIGNIFICATIVE",
    "projection_variation_5ans": -17.5
  }
]
```

---

## Statistiques

### GET /api/v1/stats/national

Statistiques nationales agrégées : nombre total de stations par type et par classification.
Cache Redis : **6 heures**.

**Paramètres :** aucun

**Réponse 200 :**

```json
{
  "total_piezo": 4250,
  "piezo_tres_bas": 320,
  "piezo_bas": 580,
  "piezo_normal": 2100,
  "piezo_haut": 850,
  "piezo_tres_haut": 400,
  "piezo_no_class": 0,
  "total_hydro": 1800,
  "hydro_tres_bas": 150,
  "hydro_bas": 280,
  "hydro_normal": 980,
  "hydro_haut": 250,
  "hydro_tres_haut": 140
}
```

---

### GET /api/v1/stats/departments

Statistiques par département : nombre de stations, pourcentage en TRES_BAS, variation moyenne.
Cache Redis : **6 heures**.

**Paramètres :** aucun

**Réponse 200 :**

```json
[
  {
    "code_departement": "01",
    "nom_departement": "Ain",
    "nb_piezo": 45,
    "nb_hydro": 18,
    "pct_tres_bas": 12.5,
    "avg_variation": -0.028
  }
]
```

---

## Données ERA5

### GET /api/v1/era5/grid

Liste des points de grille ERA5 disponibles.
Cache Redis : **24 heures**.

**Paramètres :** aucun

**Réponse 200 :**

```json
[
  {"era5_latitude": 41.25, "era5_longitude": -5.25},
  {"era5_latitude": 41.25, "era5_longitude": -4.50}
]
```

---

### GET /api/v1/era5/snapshot

Snapshot des données ERA5 pour une date précise (température, précipitations, évaporation par point de grille).
Cache Redis : **24 heures**.

**Paramètres de requête :**

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `date` | date (YYYY-MM-DD) | *obligatoire* | Date du snapshot |

**Réponse 200 :**

```json
[
  {
    "latitude": 48.75,
    "longitude": 2.25,
    "temperature_2m": 9.5,
    "total_precipitation": 0.003,
    "potential_evaporation": 0.0008
  }
]
```

---

### GET /api/v1/era5/dates

Liste des mois disponibles dans les données ERA5.
Cache Redis : **24 heures**.

**Paramètres :** aucun

**Réponse 200 :**

```json
["2010-01-01", "2010-02-01", "2010-03-01", "...", "2024-12-01"]
```

---

### GET /api/v1/era5/monthly

Agrégats ERA5 mensuels (moyenne de température, cumul précipitations, moyenne évaporation) par point de grille.
Cache Redis : **24 heures**.

**Paramètres de requête :**

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `month` | date (YYYY-MM-DD) | *obligatoire* | Premier jour du mois demandé |

**Réponse 200 :**

```json
[
  {
    "latitude": 48.75,
    "longitude": 2.25,
    "temperature_2m": 8.3,
    "total_precipitation": 0.065,
    "potential_evaporation": 0.021
  }
]
```

---

## Alertes

### GET /api/v1/alerts

Liste des stations en situation extrême (classification TRES_BAS ou TRES_HAUT par défaut), avec pagination.
Cache Redis : **1 heure**.

**Paramètres de requête :**

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `severity` | string[] | `["TRES_BAS","TRES_HAUT"]` | Classifications à inclure (répétable) : `TRES_BAS`, `BAS`, `HAUT`, `TRES_HAUT` |
| `type` | string | — | `piezo` ou `hydro` (sans filtre = les deux types) |
| `code_departement` | string (1–3 chars) | — | Filtre par département |
| `limit` | integer | `100` | 1–10000 |
| `offset` | integer | `0` | Décalage |

**Exemple :**

```
GET /api/v1/alerts?severity=TRES_BAS&type=piezo&code_departement=34
```

**Réponse 200 :**

```json
[
  {
    "code": "BSS034XXXX",
    "type": "piezo",
    "latitude": 43.611,
    "longitude": 3.877,
    "commune": "Montpellier",
    "code_departement": "34",
    "departement": "Hérault",
    "classification": "TRES_BAS",
    "derniere_mesure": "2024-12-28"
  }
]
```

**En-têtes de réponse :** `X-Total-Count: <n>`

---

## Système de Classification

La classification est calculée en comparant la valeur annuelle de chaque station à son historique complet via la fonction PostgreSQL `PERCENTILE_CONT`.

| Valeur | Centile | Description |
|---|---|---|
| `TRES_BAS` | < P10 | Niveau exceptionnellement bas sur l'historique |
| `BAS` | P10 – P25 | Niveau en dessous de la normale |
| `NORMAL` | P25 – P75 | Niveau dans la plage saisonnière habituelle |
| `HAUT` | P75 – P90 | Niveau au-dessus de la normale |
| `TRES_HAUT` | > P90 | Niveau exceptionnellement haut sur l'historique |

---

## Notes sur la Pagination

Les endpoints retournant des listes supportent `limit` et `offset` :

```
GET /api/v1/stations/piezo?limit=100&offset=200
```

Le nombre total d'enregistrements est disponible dans l'en-tête `X-Total-Count`. Le calcul du total utilise la fonction fenêtre PostgreSQL `COUNT(*) OVER()` pour éviter une double requête.
