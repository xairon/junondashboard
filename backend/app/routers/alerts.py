from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.json_response import FastJSONResponse

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])

ALERTS_TTL = 3600

SeverityType = Literal["TRES_BAS", "BAS", "HAUT", "TRES_HAUT"]
StationType = Literal["piezo", "hydro"]


@router.get("")
async def list_alerts(
    severity: Optional[list[SeverityType]] = Query(None, description="Filter by classification severity"),
    type: Optional[StationType] = Query(None, description="Filter by station type (piezo/hydro)"),
    code_departement: Optional[str] = Query(None, min_length=1, max_length=3, description="Filter by department code"),
    limit: int = Query(100, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    severity_list = severity if severity is not None else ["TRES_BAS", "TRES_HAUT"]

    params = {
        "severity": severity_list,
        "type": type,
        "code_departement": code_departement,
        "limit": limit,
        "offset": offset,
    }

    async def fetch():
        parts = []
        bind_params = {}

        if type is None or type == "piezo":
            piezo_conditions = ["classification_derniere_annee = ANY(:severity)"]
            if code_departement is not None:
                piezo_conditions.append("code_departement = :dept")
            piezo_where = " AND ".join(piezo_conditions)
            parts.append(f"""
                SELECT code_bss AS code, 'piezo' AS type,
                       latitude, longitude,
                       nom_commune AS commune, code_departement, nom_departement AS departement,
                       classification_derniere_annee AS classification,
                       derniere_mesure
                FROM gold.dim_piezo_stations
                WHERE {piezo_where}
            """)

        if type is None or type == "hydro":
            hydro_conditions = ["classification_resultat_dern_annee = ANY(:severity)"]
            if code_departement is not None:
                hydro_conditions.append("code_departement = :dept")
            hydro_where = " AND ".join(hydro_conditions)
            parts.append(f"""
                SELECT code_station AS code, 'hydro' AS type,
                       latitude_station AS latitude, longitude_station AS longitude,
                       libelle_station AS commune, code_departement, nom_departement AS departement,
                       classification_resultat_dern_annee AS classification,
                       derniere_mesure
                FROM gold.dim_hydro_stations
                WHERE {hydro_where}
            """)

        bind_params["severity"] = severity_list
        if code_departement is not None:
            bind_params["dept"] = code_departement

        union_query = " UNION ALL ".join(parts)

        # Count query
        count_query = f"SELECT count(*) AS total FROM ({union_query}) sub"
        count_result = await db.execute(text(count_query), bind_params)
        total = count_result.scalar()

        # Data query with pagination
        data_query = f"{union_query} ORDER BY classification, code LIMIT :limit OFFSET :offset"
        bind_params["limit"] = limit
        bind_params["offset"] = offset

        result = await db.execute(text(data_query), bind_params)
        rows = [dict(row) for row in result.mappings().all()]

        return {"total": total, "rows": rows}

    data = await fetch()
    total = data["total"]
    rows = data["rows"]

    response = FastJSONResponse(rows)
    response.headers["X-Total-Count"] = str(total)
    return response
