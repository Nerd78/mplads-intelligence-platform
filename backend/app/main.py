"""MPLADS Intelligence Platform API.

Run with: uvicorn app.main:app --reload --port 8000   (from backend/)

DATABASE_URL comes from the environment / backend/.env -- never hardcoded
(see app/db.py). CORS is opened for local Vite dev origins only.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import close_pool
from .routers import alerts, geo, mps, payments, stats, works

app = FastAPI(
    title="MPLADS Intelligence Platform API",
    description="Detection-engine-backed API for MPLADS works/payments/MPs, risk scores, "
    "alerts, geospatial aggregates, and model evaluation.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    # Vite dev server picks the first free port starting at 8080 (falls back to
    # 8081, 8082... whenever something else is already bound to 8080), so a
    # fixed origin list breaks the moment that happens -- match any localhost/
    # 127.0.0.1 dev port instead of hardcoding one.
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1):\d+$",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(works.router)
app.include_router(payments.router)
app.include_router(mps.router)
app.include_router(alerts.router)
app.include_router(geo.router)
app.include_router(stats.router)


@app.get("/")
def root():
    return {"service": "mplads-intelligence-api", "status": "ok"}


@app.get("/health")
def health():
    from .db import get_cursor

    with get_cursor() as cur:
        cur.execute("SELECT 1")
        cur.fetchone()
    return {"status": "ok"}


@app.on_event("shutdown")
def shutdown():
    close_pool()
