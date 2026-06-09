import json
from typing import Any
from uuid import UUID

import asyncpg


async def list_user_chats(
    db: asyncpg.Connection,
    user_id: UUID,
    *,
    page: int = 1,
    limit: int = 20,
) -> dict[str, Any]:
    offset = (page - 1) * limit
    total = await db.fetchval(
        "SELECT COUNT(*) FROM chats WHERE user_id = $1",
        user_id,
    )
    rows = await db.fetch(
        """
        SELECT
            c.id, c.title, c.title_generated, c.summary,
            c.project_id, p.name AS project_name,
            c.created_at, c.updated_at,
            (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id) AS message_count,
            (SELECT content FROM messages m
             WHERE m.chat_id = c.id AND m.role = 'user'
             ORDER BY m.created_at ASC LIMIT 1) AS first_question
        FROM chats c
        LEFT JOIN projects p ON p.id = c.project_id
        WHERE c.user_id = $1
        ORDER BY c.updated_at DESC
        LIMIT $2 OFFSET $3
        """,
        user_id,
        limit,
        offset,
    )
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": [_serialize(r) for r in rows],
    }


async def search_conversations(
    db: asyncpg.Connection,
    *,
    user_id: UUID | None = None,
    q: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> dict[str, Any]:
    offset = (page - 1) * limit
    conditions: list[str] = []
    params: list[Any] = []
    idx = 1

    if user_id:
        conditions.append(f"c.user_id = ${idx}")
        params.append(user_id)
        idx += 1

    if q:
        conditions.append(f"m.content ILIKE ${idx}")
        params.append(f"%{q}%")
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    total = await db.fetchval(
        f"""
        SELECT COUNT(DISTINCT m.id)
        FROM messages m
        JOIN chats c ON c.id = m.chat_id
        {where}
        """,
        *params,
    )

    rows = await db.fetch(
        f"""
        SELECT
            m.id AS message_id, m.chat_id, m.role, m.content,
            m.created_at, m.parent_id,
            c.title AS chat_title, c.user_id,
            u.email, u.username
        FROM messages m
        JOIN chats c ON c.id = m.chat_id
        JOIN users u ON u.id = c.user_id
        {where}
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


async def get_chat_messages(
    db: asyncpg.Connection,
    chat_id: UUID,
) -> dict[str, Any] | None:
    chat = await db.fetchrow(
        """
        SELECT c.id, c.title, c.summary, c.user_id, c.created_at, c.updated_at,
               u.email, u.username
        FROM chats c
        JOIN users u ON u.id = c.user_id
        WHERE c.id = $1
        """,
        chat_id,
    )
    if not chat:
        return None

    messages = await db.fetch(
        """
        SELECT id, chat_id, parent_id, role, content, tokens,
               context_refs, metadata, created_at
        FROM messages
        WHERE chat_id = $1
        ORDER BY created_at ASC
        """,
        chat_id,
    )

    return {
        "chat": _serialize(chat),
        "messages": [_serialize_message(m) for m in messages],
    }


def _serialize_message(row: asyncpg.Record) -> dict:
    data = _serialize(row)
    for field in ("tokens", "context_refs", "metadata"):
        if data.get(field) and isinstance(data[field], str):
            try:
                data[field] = json.loads(data[field])
            except json.JSONDecodeError:
                pass
    return data


def _serialize(row: asyncpg.Record) -> dict:
    result: dict[str, Any] = {}
    for key, val in dict(row).items():
        if isinstance(val, UUID):
            result[key] = str(val)
        elif hasattr(val, "isoformat"):
            result[key] = val.isoformat()
        else:
            result[key] = float(val) if hasattr(val, "as_tuple") else val
    return result
