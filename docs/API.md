# Référence API — Observatoire Hydrologique France

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

## Système de Classification

La classification est calculée à partir d'**indices de sécheresse standardisés** (et non de percentiles bruts) :

- **SPLI (IPS)** pour les stations piézométriques — Standardized Piezometric Level Index (méthodologie BRGM RP-64147-FR, estimation KDE par mois calendaire)
- **SSFI** pour les stations hydrométriques — Standardized Streamflow Index (distribution gamma par mois calendaire)

Les indices sont convertis en 7 classes selon les seuils Météo-France :

| Classe | Seuil (σ) | Description |
|---|---|---|
| `EXTREMEMENT_BAS` | < -1.75 | Situation exceptionnellement basse |
| `TRES_BAS` | -1.75 à -1.28 | Nettement en dessous de la normale |
| `BAS` | -1.28 à -0.84 | Modérément en dessous de la normale |
| `NORMAL` | -0.84 à 0.84 | Plage de variation habituelle |
| `HAUT` | 0.84 à 1.28 | Modérément au-dessus de la normale |
| `TRES_HAUT` | 1.28 à 1.75 | Nettement au-dessus de la normale |
| `EXTREMEMENT_HAUT` | > 1.75 | Situation exceptionnellement haute |

Le calcul est effectué en batch au démarrage du backend et mis en cache Redis (24h).

### Fiabilité

Chaque station se voit attribuer un niveau de fiabilité basé sur la profondeur historique :

| Niveau | Critère |
|---|---|
| `fiable` | >= 10 années distinctes avec >= 6 mois de données chacune |
| `indicatif` | 5 à 9 années |
| `insuffisant` | < 5 années |

La fiabilité est incluse dans les réponses GeoJSON et les listes de stations.

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
| `classification` | string[] | — | Un ou plusieurs parmi les 7 classes (répétable) |
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
    "codes_bdlisa": "117AA01",
    "fiabilite": "fiable"
  }
]
```

---

### GET /api/v1/stations/hydro

Liste paginée des stations hydrométriques. Cache Redis : **1 heure**.

**Paramètres de requête :**

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `min_observations` | integer | — | Filtre `nb_jours_total >= valeur` |
| `last_measurement_after` | date (YYYY-MM-DD) | — | Filtre `derniere_mesure >= valeur` |
| `classification` | string[] | — | Classification (7 classes, répétable) |
| `code_departement` | string (1–3 chars) | — | Code INSEE département |
| `grandeur_hydro` | string | — | `Q` (débit) ou `H` (hauteur) |
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
    "nom_cours_eau": "La Loire",
    "latitude_station": 47.902,
    "longitude_station": 1.909,
    "code_departement": "45",
    "nom_departement": "Loiret",
    "grandeur_hydro_principale": "Q",
    "nb_jours_total": 18000,
    "derniere_mesure": "2024-12-31",
    "classification_resultat_dern_annee": "HAUT",
    "fiabilite": "fiable"
  }
]
```

---

### GET /api/v1/stations/geojson

GeoJSON FeatureCollection pour l'affichage sur carte. Inclut la classification calculée (indices standardisés) et la fiabilité.
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
        "fiabilite": "fiable",
        "commune": "Paris",
        "departement": "Paris",
        "code_departement": "75",
        "derniere_mesure": "2024-12-31",
        "nb_observations": 12500,
        "tendance": "STABLE",
        "codes_bdlisa": "117AA01"
      }
    }
  ]
}
```

La propriété `classification` reflète l'indice standardisé calculé (SPLI ou SSFI), pas le champ brut de la base de données. Si le cache Redis est indisponible, le fallback utilise la classification percentile de la DB (5 classes).

---

### GET /api/v1/stations/piezo/{code_bss}

Détail complet d'une station piézométrique (50+ champs BSS).
Cache Redis : **1 heure**.

**Réponse 404 :**

```json
{"detail": "Piezo station BSS001ABCD not found"}
```

---

### GET /api/v1/stations/hydro/{code_station}

Détail complet d'une station hydrométrique.
Cache Redis : **1 heure**.

**Réponse 404 :**

```json
{"detail": "Hydro station K123456001 not found"}
```

---

### GET /api/v1/stations/piezo/{code_bss}/percentiles

Percentiles historiques P10/P25/P75/P90 du niveau piézométrique.
Cache Redis : **24 heures**. Valeurs en mètres NGF.

---

### GET /api/v1/stations/hydro/{code_station}/percentiles

Percentiles historiques P10/P25/P75/P90 du débit ou de la hauteur.
Cache Redis : **24 heures**. Unités : m³/s (Q) ou m (H).

---

### GET /api/v1/stations/piezo/{code_bss}/siblings

Stations piézométriques du même aquifère BDLISA.
Cache Redis : **1 heure**.

**Réponse 200 :** Liste de stations résumées (code, commune, classification, dernière mesure).

---

### GET /api/v1/stations/hydro/{code_station}/siblings

Stations hydrométriques du même site hydrométrique.
Cache Redis : **1 heure**.

---

## Séries Temporelles

### GET /api/v1/timeseries/piezo/{code_bss}/daily

Mesures journalières piézométriques, enrichies de données ERA5.
Cache Redis : **6 heures**.

**Paramètres de requête :**

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `start_date` | date (YYYY-MM-DD) | — | Date de début (incluse) |
| `end_date` | date (YYYY-MM-DD) | — | Date de fin (incluse) |
| `limit` | integer | `3650` | 1–36500 |

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

Mesures journalières hydrométriques + ERA5. Cache Redis : **6 heures**. Paramètres identiques.

---

### GET /api/v1/timeseries/piezo/{code_bss}/monthly

Agrégats mensuels piézométriques avec moyennes mobiles 3 et 12 mois.
Cache Redis : **12 heures**.

---

### GET /api/v1/timeseries/hydro/{code_station}/monthly

Agrégats mensuels hydrométriques. Cache Redis : **12 heures**.

---

### GET /api/v1/timeseries/piezo/{code_bss}/yearly

Statistiques annuelles piézométriques (percentile historique, classification annuelle).
Cache Redis : **24 heures**.

---

### GET /api/v1/timeseries/hydro/{code_station}/yearly

Statistiques annuelles hydrométriques. Cache Redis : **24 heures**.

---

### GET /api/v1/timeseries/compare

Séries temporelles multi-stations en parallèle (`asyncio.gather`).
Cache Redis : **30 minutes**.

**Paramètres de requête :**

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `stations` | string[] | *obligatoire* | Codes des stations (1–10, répétable) |
| `type` | string | *obligatoire* | `piezo` ou `hydro` |
| `granularity` | string | `monthly` | `daily` ou `monthly` |

---

## Indices de Sécheresse

### GET /api/v1/piezo/{code_bss}/spli

Série temporelle mensuelle de l'indice SPLI (IPS) — Standardized Piezometric Level Index.
Cache Redis : **12 heures**.

**Réponse 200 :**

```json
[
  {
    "mois": "2024-01-01",
    "valeur": -1.42
  }
]
```

---

### GET /api/v1/piezo/{code_bss}/spi

Série temporelle mensuelle du SPI (Standardized Precipitation Index) pour la station piézo.
Cache Redis : **12 heures**.

---

### GET /api/v1/hydro/{code_station}/ssfi

Série temporelle mensuelle de l'indice SSFI — Standardized Streamflow Index.
Cache Redis : **12 heures**.

---

### GET /api/v1/hydro/{code_station}/spi

Série temporelle mensuelle du SPI pour la station hydro.
Cache Redis : **12 heures**.

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
| `fiabilite_min` | float | — | Fiabilité minimum (0.0–1.0) |
| `limit` | integer | `500` | 1–5000 |
| `offset` | integer | `0` | Décalage |

---

### GET /api/v1/trends/hydro

Tendances de pente de Sen pour les stations hydrométriques.
Cache Redis : **12 heures**. Paramètre supplémentaire : `grandeur_hydro_elab` (`Q` ou `H`).

---

## Statistiques

### GET /api/v1/stats/national

Statistiques nationales agrégées par type et classification. Cache Redis : **6 heures**.

---

### GET /api/v1/stats/departments

Statistiques par département. Cache Redis : **6 heures**.

---

## Classifications Timeline

### GET /api/v1/common/classifications/timeline

Historique mensuel des classifications pour toutes les stations. Utilisé par le composant Timeline.
Cache Redis : **24 heures**.

**Réponse 200 :**

```json
{
  "periods": ["2005-01", "2005-02", "...", "2026-02"],
  "stations": {
    "BSS001ABCD": [3, 3, 4, 3, 7, ...],
    "K123456001": [2, 3, 3, 4, 7, ...]
  }
}
```

Les valeurs numériques correspondent aux classes :

| Index | Classification |
|---|---|
| 0 | EXTREMEMENT_BAS |
| 1 | TRES_BAS |
| 2 | BAS |
| 3 | NORMAL |
| 4 | HAUT |
| 5 | TRES_HAUT |
| 6 | EXTREMEMENT_HAUT |
| 7 | UNKNOWN (pas de données) |

---

## Alertes

### GET /api/v1/common/alerts

Stations actives (mesures < 90 jours) en situation anormale, avec historique de durée consécutive.
Cache Redis : **1 heure**.

**Paramètres de requête :**

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `severity` | string[] | `["TRES_BAS","TRES_HAUT"]` | Classifications à inclure (répétable) |
| `type` | string | — | `piezo` ou `hydro` |
| `code_departement` | string (1–3 chars) | — | Filtre par département |
| `active_only` | boolean | `true` | Stations avec mesures récentes uniquement |

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
    "fiabilite": "fiable",
    "derniere_mesure": "2026-02-15",
    "alerte_depuis_annee": 2024,
    "nb_annees_consecutives": 3
  }
]
```

---

## Données ERA5

### GET /api/v1/era5/grid

Points de grille ERA5 disponibles. Cache Redis : **24 heures**.

### GET /api/v1/era5/snapshot

Snapshot ERA5 pour une date précise. Cache Redis : **24 heures**.

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `date` | date (YYYY-MM-DD) | *obligatoire* | Date du snapshot |

### GET /api/v1/era5/dates

Mois disponibles dans les données ERA5. Cache Redis : **24 heures**.

### GET /api/v1/era5/monthly

Agrégats ERA5 mensuels par point de grille. Cache Redis : **24 heures**.

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `month` | date (YYYY-MM-DD) | *obligatoire* | Premier jour du mois |

---

## WFS (calques hydrographiques)

### GET /api/v1/wfs/{layer_id}

Proxy WFS vers les services SANDRE. Retourne du GeoJSON compressé gzip.
Cache Redis : **24 heures**, pré-chauffé au démarrage du backend.

**Calques disponibles :**

| `layer_id` | Source SANDRE | Description |
|---|---|---|
| `region-hydro` | `RegionHydro` | Régions hydrographiques |
| `secteur-hydro` | `SecteurHydro` | Secteurs hydrographiques |
| `sous-secteur-hydro` | `SousSecteurHydro` | Sous-secteurs hydrographiques |
| `zone-hydro` | `ZoneHydro` | Zones hydrographiques |
| `cours-eau-1` | `CoursEau1` | Cours d'eau principaux (> 100 km) |
| `cours-eau-2` | `CoursEau2` | Cours d'eau secondaires (50–100 km) |
| `plan-eau` | `PlanEau_FXX` | Plans d'eau |
| `masse-eau-riv` | `MasseDEauRiviere_VRAP2022_FXX` | Masses d'eau rivières (DCE) |

**Paramètres de requête :**

| Nom | Type | Défaut | Description |
|---|---|---|---|
| `bbox` | string | — | Bounding box `minLon,minLat,maxLon,maxLat` |

---

## BDLISA (entités hydrogéologiques)

### GET /api/v1/bdlisa/{code}

Retourne les données GeoJSON d'une entité BDLISA par son code.
Servies directement depuis des fichiers JSON statiques (`backend/data/bdlisa/`). Pas de cache Redis.

**Paramètres de chemin :**

| Nom | Type | Description |
|---|---|---|
| `code` | string | Code de l'entité BDLISA (ex: `117AA01`) |

**Réponse 200 :** GeoJSON Feature avec la géométrie de l'entité.

**Réponse 404 :** Entité non trouvée.

---

## Notes sur la Pagination

Les endpoints retournant des listes supportent `limit` et `offset` :

```
GET /api/v1/stations/piezo?limit=100&offset=200
```

Le nombre total d'enregistrements est disponible dans l'en-tête `X-Total-Count`. Le total utilise la fonction fenêtre PostgreSQL `COUNT(*) OVER()` pour éviter une double requête.
