import json
from typing import Any
from uuid import UUID

import asyncpg


async def list_users(
    db: asyncpg.Connection,
    *,
    search: str | None = None,
    status: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> dict[str, Any]:
    offset = (page - 1) * limit
    conditions: list[str] = []
    params: list[Any] = []
    idx = 1

    if search:
        conditions.append(
            f"(u.email ILIKE ${idx} OR u.username ILIKE ${idx})"
        )
        params.append(f"%{search}%")
        idx += 1

    if status:
        conditions.append(f"u.status = ${idx}")
        params.append(status)
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    total = await db.fetchval(
        f"SELECT COUNT(*) FROM users u {where}",
        *params,
    )

    rows = await db.fetch(
        f"""
        SELECT
            u.id, u.email, u.username, u.status,
            u.last_login_at, u.created_at, u.updated_at,
            st.name AS tier_name,
            st.monthly_token_limit,
            uq.used_tokens,
            uq.current_period_start,
            (SELECT COUNT(*) FROM chats c WHERE c.user_id = u.id) AS chat_count,
            (SELECT COUNT(*) FROM messages m
             JOIN chats c ON c.id = m.chat_id
             WHERE c.user_id = u.id) AS message_count
        FROM users u
        LEFT JOIN subscription_tiers st ON st.id = u.tier_id
        LEFT JOIN user_usage_quotas uq ON uq.user_id = u.id
        {where}
        ORDER BY u.created_at DESC
        LIMIT ${idx} OFFSET ${idx + 1}
        """,
        *params,
        limit,
        offset,
    )

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": [{**_serialize_row(r), "user_id": str(r["id"])} for r in rows],
    }


async def get_user_detail(db: asyncpg.Connection, user_id: UUID) -> dict | None:
    row = await db.fetchrow(
        """
        SELECT
            u.id, u.email, u.username, u.google_sub, u.status,
            u.last_login_provider, u.last_login_at,
            u.created_at, u.updated_at,
            st.id AS tier_id, st.name AS tier_name,
            st.monthly_token_limit, st.max_projects, st.features,
            uq.used_tokens, uq.current_period_start, uq.updated_at AS quota_updated_at
        FROM users u
        LEFT JOIN subscription_tiers st ON st.id = u.tier_id
        LEFT JOIN user_usage_quotas uq ON uq.user_id = u.id
        WHERE u.id = $1
        """,
        user_id,
    )
    if not row:
        return None

    settings = await db.fetchrow(
        "SELECT theme, language, notifications_enabled, settings, updated_at "
        "FROM user_settings WHERE user_id = $1",
        user_id,
    )

    roles = await db.fetch(
        """
        SELECT r.name, r.description
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1
        """,
        user_id,
    )

    token_summary = await db.fetchrow(
        """
        SELECT
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
            COUNT(*) AS log_count
        FROM token_usage_logs
        WHERE user_id = $1
        """,
        user_id,
    )

    project_count = await db.fetchval(
        "SELECT COUNT(*) FROM projects WHERE user_id = $1",
        user_id,
    )
    chat_count = await db.fetchval(
        "SELECT COUNT(*) FROM chats WHERE user_id = $1",
        user_id,
    )

    data = _serialize_row(row)
    data["user_id"] = data.get("id")
    data["settings"] = _serialize_row(settings) if settings else None
    data["roles"] = [_serialize_row(r) for r in roles]
    data["token_summary"] = _serialize_row(token_summary)
    data["project_count"] = project_count
    data["chat_count"] = chat_count
    return data


def _serialize_row(row: asyncpg.Record | None) -> dict | None:
    if row is None:
        return None
    result: dict[str, Any] = {}
    for key, val in dict(row).items():
        if isinstance(val, UUID):
            result[key] = str(val)
        elif hasattr(val, "isoformat"):
            result[key] = val.isoformat()
        elif isinstance(val, (dict, list)):
            result[key] = val
        else:
            result[key] = float(val) if hasattr(val, "as_tuple") else val
    return result
