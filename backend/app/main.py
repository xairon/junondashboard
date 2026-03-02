from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.database import engine
from app.routers import stations, timeseries, trends, stats, era5


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(
    title="Hydro Dashboard API",
    version="0.1.0",
    lifespan=lifespan,
    default_response_class=ORJSONResponse,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(stations.router)
app.include_router(timeseries.router)
app.include_router(trends.router)
app.include_router(stats.router)
app.include_router(era5.router)


@app.get("/api/v1/health")
async def health():
    return {"status": "ok"}
