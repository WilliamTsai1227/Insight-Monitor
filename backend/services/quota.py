"""配額重置：只重置 user_usage_quotas，保留 token_usage_logs 花費紀錄。"""

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import asyncpg

ENSURE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS quota_reset_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    previous_period_start TIMESTAMPTZ,
    previous_used_tokens BIGINT NOT NULL DEFAULT 0,
    period_total_tokens BIGINT,
    period_total_cost_usd NUMERIC(10, 6),
    note TEXT,
    reset_by VARCHAR(100) DEFAULT 'monitor'
);
CREATE INDEX IF NOT EXISTS idx_quota_reset_logs_user_reset_at
    ON quota_reset_logs(user_id, reset_at DESC);
"""


async def ensure_quota_reset_table(db: asyncpg.Connection) -> None:
    await db.execute(ENSURE_TABLE_SQL)


async def get_user_quota_info(
    db: asyncpg.Connection,
    user_id: UUID,
) -> dict[str, Any] | None:
    user = await db.fetchrow(
        """
        SELECT u.id, u.email, u.username, u.status,
               st.name AS tier_name,
               COALESCE(st.monthly_token_limit, 200000) AS monthly_token_limit,
               uq.used_tokens, uq.current_period_start, uq.updated_at AS quota_updated_at
        FROM users u
        LEFT JOIN subscription_tiers st ON st.id = u.tier_id
        LEFT JOIN user_usage_quotas uq ON uq.user_id = u.id
        WHERE u.id = $1
        """,
        user_id,
    )
    if not user:
        return None

    all_time = await db.fetchrow(
        """
        SELECT COALESCE(SUM(total_tokens), 0) AS total_tokens,
               COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
               COUNT(*) AS log_count
        FROM token_usage_logs WHERE user_id = $1
        """,
        user_id,
    )

    period_start = user["current_period_start"]
    current_period = await _period_stats(db, user_id, period_start, None)

    history = await _build_period_history(db, user_id, period_start)

    data = _serialize(user)
    data["monthly_token_limit"] = int(user["monthly_token_limit"])
    data["used_tokens"] = int(user["used_tokens"] or 0)
    data["remaining_tokens"] = max(
        0, data["monthly_token_limit"] - data["used_tokens"]
    )
    data["all_time"] = _serialize(all_time)
    data["current_period"] = current_period
    data["period_history"] = history
    return data


async def reset_user_quota(
    db: asyncpg.Connection,
    user_id: UUID,
    *,
    note: str | None = None,
) -> dict[str, Any]:
    user = await db.fetchrow(
        "SELECT id, email, username FROM users WHERE id = $1",
        user_id,
    )
    if not user:
        raise ValueError("User not found")

    async with db.transaction():
        await db.execute(
            """
            INSERT INTO user_usage_quotas (user_id, current_period_start, used_tokens)
            VALUES ($1, date_trunc('month', NOW() AT TIME ZONE 'UTC'), 0)
            ON CONFLICT (user_id) DO NOTHING
            """,
            user_id,
        )

        quota = await db.fetchrow(
            """
            SELECT used_tokens, current_period_start
            FROM user_usage_quotas WHERE user_id = $1
            FOR UPDATE
            """,
            user_id,
        )
        prev_used = int(quota["used_tokens"] or 0)
        prev_start = quota["current_period_start"]
        period_stats = await _period_stats(db, user_id, prev_start, datetime.now(timezone.utc))

        await db.execute(
            """
            INSERT INTO quota_reset_logs (
                user_id, previous_period_start, previous_used_tokens,
                period_total_tokens, period_total_cost_usd, note
            ) VALUES ($1, $2, $3, $4, $5, $6)
            """,
            user_id,
            prev_start,
            prev_used,
            period_stats["total_tokens"],
            period_stats["total_cost_usd"],
            note,
        )

        new_row = await db.fetchrow(
            """
            UPDATE user_usage_quotas
            SET used_tokens = 0,
                current_period_start = NOW(),
                updated_at = NOW()
            WHERE user_id = $1
            RETURNING used_tokens, current_period_start, updated_at
            """,
            user_id,
        )

    return {
        "user_id": str(user_id),
        "email": user["email"],
        "username": user["username"],
        "previous_used_tokens": prev_used,
        "previous_period_start": _iso(prev_start),
        "closed_period": period_stats,
        "quota": _serialize(new_row),
        "message": "配額已重置；token_usage_logs 花費紀錄已保留。",
    }


async def _build_period_history(
    db: asyncpg.Connection,
    user_id: UUID,
    current_period_start: datetime | None,
) -> list[dict]:
    resets = await db.fetch(
        """
        SELECT id, reset_at, previous_period_start, previous_used_tokens,
               period_total_tokens, period_total_cost_usd, note
        FROM quota_reset_logs
        WHERE user_id = $1
        ORDER BY reset_at DESC
        LIMIT 50
        """,
        user_id,
    )

    history = []
    for row in resets:
        history.append({
            "type": "closed",
            "reset_id": str(row["id"]),
            "period_start": _iso(row["previous_period_start"]),
            "period_end": _iso(row["reset_at"]),
            "quota_used_tokens": int(row["previous_used_tokens"] or 0),
            "log_total_tokens": int(row["period_total_tokens"] or 0),
            "log_total_cost_usd": float(row["period_total_cost_usd"] or 0),
            "note": row["note"],
        })

    if current_period_start:
        current = await _period_stats(db, user_id, current_period_start, None)
        current["type"] = "current"
        current["period_start"] = _iso(current_period_start)
        current["period_end"] = None
        current["quota_used_tokens"] = None
        history.insert(0, current)

    return history


async def _period_stats(
    db: asyncpg.Connection,
    user_id: UUID,
    period_start: datetime | None,
    period_end: datetime | None,
) -> dict[str, Any]:
    if period_start is None:
        return {
            "total_tokens": 0,
            "total_cost_usd": 0.0,
            "log_count": 0,
        }

    if period_end:
        row = await db.fetchrow(
            """
            SELECT COALESCE(SUM(total_tokens), 0) AS total_tokens,
                   COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
                   COUNT(*) AS log_count
            FROM token_usage_logs
            WHERE user_id = $1
              AND created_at >= $2
              AND created_at < $3
            """,
            user_id,
            period_start,
            period_end,
        )
    else:
        row = await db.fetchrow(
            """
            SELECT COALESCE(SUM(total_tokens), 0) AS total_tokens,
                   COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
                   COUNT(*) AS log_count
            FROM token_usage_logs
            WHERE user_id = $1 AND created_at >= $2
            """,
            user_id,
            period_start,
        )

    return {
        "total_tokens": int(row["total_tokens"]),
        "total_cost_usd": float(row["total_cost_usd"]),
        "log_count": int(row["log_count"]),
    }


def _iso(val: datetime | None) -> str | None:
    if val is None:
        return None
    return val.isoformat()


def _serialize(row: asyncpg.Record | None) -> dict | None:
    if row is None:
        return None
    result: dict[str, Any] = {}
    for key, val in dict(row).items():
        if isinstance(val, UUID):
            result[key] = str(val)
        elif hasattr(val, "isoformat"):
            result[key] = val.isoformat()
        else:
            result[key] = float(val) if hasattr(val, "as_tuple") else val
    return result
