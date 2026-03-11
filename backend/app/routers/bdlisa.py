import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from starlette.responses import FileResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/bdlisa", tags=["bdlisa"])

# Pre-extracted BDLISA NV3 entity polygons (from official GeoPackage download)
_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "bdlisa"


@router.get("/entity")
async def bdlisa_entity(
    code: str = Query(..., min_length=3, max_length=20, pattern=r"^[A-Za-z0-9]+$"),
):
    """Return the BDLISA NV3 entity polygon by code (e.g. 113AF05)."""
    path = _DATA_DIR / f"{code.upper()}.json"
    if not path.is_file():
        raise HTTPException(404, f"No geometry found for entity {code.upper()}")
    return FileResponse(path, media_type="application/json")
