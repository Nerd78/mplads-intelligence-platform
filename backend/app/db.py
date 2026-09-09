"""Connection pooling for the FastAPI app.

DATABASE_URL is read from the environment (via python-dotenv loading
backend/.env in dev) -- never hardcoded. All route handlers are sync `def`
and borrow/return a connection from this pool per request; FastAPI already
runs sync def endpoints in a thread pool, so a blocking psycopg2 call here
never ties up an event loop.
"""
from __future__ import annotations

import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
import psycopg2.pool
from dotenv import load_dotenv

load_dotenv()

DEFAULT_LOCAL_URL = "postgresql://postgres:postgres@localhost:5432/mplads"
DATABASE_URL = os.environ.get("DATABASE_URL", DEFAULT_LOCAL_URL)

_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _pool
    if _pool is None:
        _pool = psycopg2.pool.ThreadedConnectionPool(minconn=1, maxconn=10, dsn=DATABASE_URL)
    return _pool


@contextmanager
def get_conn():
    pool = get_pool()
    conn = pool.getconn()
    try:
        yield conn
    finally:
        pool.putconn(conn)


@contextmanager
def get_cursor(dict_cursor: bool = True):
    with get_conn() as conn:
        cursor_factory = psycopg2.extras.RealDictCursor if dict_cursor else None
        with conn.cursor(cursor_factory=cursor_factory) as cur:
            yield cur
            conn.commit()


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.closeall()
        _pool = None
