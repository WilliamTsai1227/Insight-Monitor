"""PostgreSQL connection pool (asyncpg)."""

import ssl
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import asyncpg

from config import DATABASE_SSL, DATABASE_URL

_pool: asyncpg.Pool | None = None


def _parse_dsn() -> tuple[str, ssl.SSLContext | None]:
    raw = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    parsed = urlparse(raw)
    query = parse_qs(parsed.query, keep_blank_values=False)

    ssl_required = DATABASE_SSL.lower() in ("require", "true", "1")

    ssl_param = (query.pop("ssl", [None]) or [None])[0]
    if ssl_param in ("require", "true", "1"):
        ssl_required = True

    sslmode = (query.pop("sslmode", [None]) or [None])[0]
    if sslmode in ("require", "verify-ca", "verify-full"):
        ssl_required = True

    flat_query = {k: v[0] for k, v in query.items() if v}
    dsn = urlunparse(parsed._replace(query=urlencode(flat_query) if flat_query else ""))

    ssl_context = None
    if ssl_required:
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE

    return dsn, ssl_context


async def create_pool() -> None:
    global _pool
    dsn, ssl_context = _parse_dsn()
    pool_kwargs: dict = {
        "dsn": dsn,
        "min_size": 2,
        "max_size": 10,
        "max_inactive_connection_lifetime": 3600.0,
        "command_timeout": 60.0,
    }
    if ssl_context is not None:
        pool_kwargs["ssl"] = ssl_context

    _pool = await asyncpg.create_pool(**pool_kwargs)
    print("[Monitor DB] asyncpg pool created.")


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        print("[Monitor DB] asyncpg pool closed.")


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool is not initialized.")
    return _pool


async def get_db():
    pool = get_pool()
    async with pool.acquire() as connection:
        yield connection
