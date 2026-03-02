from pydantic import BaseModel


class ERA5GridPoint(BaseModel):
    era5_latitude: float
    era5_longitude: float


class ERA5Snapshot(BaseModel):
    latitude: float
    longitude: float
    temperature_2m: float | None = None
    total_precipitation: float | None = None
    potential_evaporation: float | None = None
