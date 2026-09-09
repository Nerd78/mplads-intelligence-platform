"""Shared DB connection helper for the detection pipeline.

Reads DATABASE_URL from the environment (falling back to the documented local
dev default for this project) -- never a hardcoded credential in code.
"""
from __future__ import annotations

import os

import psycopg2

DEFAULT_LOCAL_URL = "postgresql://postgres:postgres@localhost:5432/mplads"


def get_database_url() -> str:
    return os.environ.get("DATABASE_URL", DEFAULT_LOCAL_URL)


def get_connection():
    return psycopg2.connect(get_database_url())
