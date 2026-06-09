from typing import Any
from uuid import UUID

import asyncpg


async def get_overall_summary(db: asyncpg.Connection) -> dict[str, Any]:
    row = await db.fetchrow(
        """
        SELECT
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
            COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
            COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
            COUNT(*) AS record_count,
            COUNT(DISTINCT user_id) AS user_count
        FROM token_usage_logs
        """
    )
    return _serialize(row)


async def get_by_user(
    db: asyncpg.Connection,
    *,
    page: int = 1,
    limit: int = 20,
) -> dict[str, Any]:
    offset = (page - 1) * limit
    total = await db.fetchval(
        "SELECT COUNT(DISTINCT user_id) FROM token_usage_logs"
    )
    rows = await db.fetch(
        """
        SELECT
            t.user_id, u.email, u.username,
            SUM(t.total_tokens) AS total_tokens,
            SUM(t.prompt_tokens) AS prompt_tokens,
            SUM(t.completion_tokens) AS completion_tokens,
            SUM(t.cost_usd) AS total_cost_usd,
            COUNT(*) AS call_count
        FROM token_usage_logs t
        JOIN users u ON u.id = t.user_id
        GROUP BY t.user_id, u.email, u.username
        ORDER BY total_cost_usd DESC
        LIMIT $1 OFFSET $2
        """,
        limit,
        offset,
    )
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": [_serialize(r) for r in rows],
    }


async def get_by_model(db: asyncpg.Connection) -> list[dict]:
    rows = await db.fetch(
        """
        SELECT
            model_name,
            SUM(total_tokens) AS total_tokens,
            SUM(prompt_tokens) AS prompt_tokens,
            SUM(completion_tokens) AS completion_tokens,
            SUM(cost_usd) AS total_cost_usd,
            COUNT(*) AS call_count,
            COUNT(DISTINCT user_id) AS user_count
        FROM token_usage_logs
        GROUP BY model_name
        ORDER BY total_cost_usd DESC
        """
    )
    return [_serialize(r) for r in rows]


async def get_by_caller(db: asyncpg.Connection) -> list[dict]:
    rows = await db.fetch(
        """
        SELECT
            COALESCE(caller, 'unknown') AS caller,
            SUM(total_tokens) AS total_tokens,
            SUM(cost_usd) AS total_cost_usd,
            COUNT(*) AS call_count
        FROM token_usage_logs
        GROUP BY caller
        ORDER BY total_cost_usd DESC
        """
    )
    return [_serialize(r) for r in rows]


async def get_user_tokens(
    db: asyncpg.Connection,
    user_id: UUID,
) -> dict[str, Any]:
    summary = await db.fetchrow(
        """
        SELECT
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
            COUNT(*) AS call_count
        FROM token_usage_logs
        WHERE user_id = $1
        """,
        user_id,
    )

    by_model = await db.fetch(
        """
        SELECT model_name,
               SUM(total_tokens) AS total_tokens,
               SUM(cost_usd) AS total_cost_usd,
               COUNT(*) AS call_count
        FROM token_usage_logs
        WHERE user_id = $1
        GROUP BY model_name
        ORDER BY total_cost_usd DESC
        """,
        user_id,
    )

    by_caller = await db.fetch(
        """
        SELECT COALESCE(caller, 'unknown') AS caller,
               SUM(total_tokens) AS total_tokens,
               SUM(cost_usd) AS total_cost_usd,
               COUNT(*) AS call_count
        FROM token_usage_logs
        WHERE user_id = $1
        GROUP BY caller
        ORDER BY total_cost_usd DESC
        """,
        user_id,
    )

    daily = await db.fetch(
        """
        SELECT date_trunc('day', created_at) AS day,
               SUM(total_tokens) AS total_tokens,
               SUM(cost_usd) AS total_cost_usd
        FROM token_usage_logs
        WHERE user_id = $1
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
        """,
        user_id,
    )

    return {
        "summary": _serialize(summary),
        "by_model": [_serialize(r) for r in by_model],
        "by_caller": [_serialize(r) for r in by_caller],
        "daily": [_serialize(r) for r in daily],
    }


def _serialize(row: asyncpg.Record | None) -> dict | None:
    if row is None:
        return None
    result: dict[str, Any] = {}
    for key, val in dict(row).items():
        if hasattr(val, "isoformat"):
            result[key] = val.isoformat()
        else:
            from uuid import UUID
            if isinstance(val, UUID):
                result[key] = str(val)
            else:
                result[key] = float(val) if hasattr(val, "as_tuple") else val
    return result
