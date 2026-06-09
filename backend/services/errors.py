import json
from typing import Any
from uuid import UUID

import asyncpg


async def get_errors_by_user(
    db: asyncpg.Connection,
    *,
    page: int = 1,
    limit: int = 20,
) -> dict[str, Any]:
    offset = (page - 1) * limit
    total = await db.fetchval(
        """
        SELECT COUNT(DISTINCT c.user_id)
        FROM messages m
        JOIN chats c ON c.id = m.chat_id
        WHERE m.metadata IS NOT NULL
          AND m.metadata->>'error' IS NOT NULL
          AND m.metadata->>'error' != ''
        """
    )

    rows = await db.fetch(
        """
        SELECT
            c.user_id, u.email, u.username,
            COUNT(*) AS error_count,
            MAX(m.created_at) AS last_error_at,
            MIN(m.created_at) AS first_error_at
        FROM messages m
        JOIN chats c ON c.id = m.chat_id
        JOIN users u ON u.id = c.user_id
        WHERE m.metadata IS NOT NULL
          AND m.metadata->>'error' IS NOT NULL
          AND m.metadata->>'error' != ''
        GROUP BY c.user_id, u.email, u.username
        ORDER BY error_count DESC
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


async def get_all_errors(
    db: asyncpg.Connection,
    *,
    user_id: UUID | None = None,
    page: int = 1,
    limit: int = 20,
) -> dict[str, Any]:
    offset = (page - 1) * limit
    conditions = [
        "m.metadata IS NOT NULL",
        "m.metadata->>'error' IS NOT NULL",
        "m.metadata->>'error' != ''",
    ]
    params: list[Any] = []
    idx = 1

    if user_id:
        conditions.append(f"c.user_id = ${idx}")
        params.append(user_id)
        idx += 1

    where = " AND ".join(conditions)

    total = await db.fetchval(
        f"""
        SELECT COUNT(*)
        FROM messages m
        JOIN chats c ON c.id = m.chat_id
        WHERE {where}
        """,
        *params,
    )

    rows = await db.fetch(
        f"""
        SELECT
            m.id AS message_id, m.chat_id, m.content,
            m.metadata->>'error' AS error_message,
            m.metadata->>'response_mode' AS response_mode,
            m.created_at,
            c.title AS chat_title,
            c.user_id, u.email, u.username
        FROM messages m
        JOIN chats c ON c.id = m.chat_id
        JOIN users u ON u.id = c.user_id
        WHERE {where}
        ORDER BY m.created_at DESC
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
        "items": [_serialize(r) for r in rows],
    }


def _serialize(row: asyncpg.Record) -> dict:
    result: dict[str, Any] = {}
    for key, val in dict(row).items():
        if isinstance(val, UUID):
            result[key] = str(val)
        elif hasattr(val, "isoformat"):
            result[key] = val.isoformat()
        else:
            result[key] = val
    return result
