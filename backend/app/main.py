"""FastAPI application entrypoint (M0 foundation)."""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import audit, consent, demo, markers, wearables
from app.schemas import HealthCheckResponse

settings = get_settings()

# Keep logging structured and PHI-free. Handlers must never log request bodies
# or marker values.
logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))

app = FastAPI(
    title="Chronic Health Tracker API",
    version="0.0.1",
    description="Pre-diabetes / metabolic MVP. M0 foundation: auth, consent, audit.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(consent.router)
app.include_router(markers.router)
app.include_router(audit.router)
app.include_router(wearables.router)
app.include_router(demo.router)


@app.get("/health", response_model=HealthCheckResponse, tags=["meta"])
async def health() -> HealthCheckResponse:
    """Liveness probe. No auth, no PHI."""
    return HealthCheckResponse(status="ok", environment=settings.environment)
